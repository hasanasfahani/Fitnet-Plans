const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV2 } = require("../lib/workout-engine");
const { buildWorkoutSelectionPromptV2 } = require("../lib/plan-contracts");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const places = ["Home", "Building Gym", "Full Equipment Gym"];
const dayCounts = [2, 3, 4, 5, 6];
const durations = [30, 45, 60, 75, 90];
let slotsChecked = 0;
let fallbackTierSlots = 0;
let substitutionReadyCandidates = 0;

for (const place of places) {
  for (const days of dayCounts) {
    for (const duration of durations) {
      const generated = generateScenario({ place, days, duration });
      assert(generated.candidate_validation.valid, generated.candidate_validation.errors.join(", "));
      for (const day of generated.skeleton) {
        for (const slot of day.slots) {
          const candidates = generated.candidate_map[slot.slot_id] || [];
          assert(candidates.length > 0 && candidates.length <= 6, `Invalid candidate count for ${slot.slot_id}`);
          assert(candidates.every((candidate) => candidate.category === slot.muscle_group), `Wrong category in ${slot.slot_id}`);
          if (day.day_name.includes("Push") && slot.training_role === "side_rear_delts") {
            assert(candidates.every((candidate) => {
              const text = `${candidate.name || ""} ${(candidate.sub_muscles || []).join(" ")}`.toLowerCase();
              return /lateral|side delt|medial delt/.test(text) && !/rear|posterior/.test(text);
            }), `Rear-delt candidate leaked into Push day slot ${slot.slot_id}`);
          }
          const ids = new Set(candidates.map((candidate) => Number(candidate.exercise_id)));
          assert(ids.size === candidates.length, `Duplicate candidate IDs in ${slot.slot_id}`);
          for (const candidate of candidates) {
            for (const substitutionId of candidate.approved_substitution_ids || []) {
              const substitution = candidates.find((item) => Number(item.exercise_id) === Number(substitutionId));
              assert(substitution, `Substitution escaped slot ${slot.slot_id}`);
              assert(substitution.substitution_group === candidate.substitution_group, `Wrong substitution group in ${slot.slot_id}`);
            }
            if (candidate.approved_substitution_ids?.length) substitutionReadyCandidates += 1;
          }
          slotsChecked += 1;
        }
      }
      fallbackTierSlots += generated.candidate_validation.fallback_tier_slots.length;
    }
  }
}

const fallbackSource = generateScenario({ place: "Full Equipment Gym", days: 4, duration: 45 });
const fallbackDay = fallbackSource.skeleton[0];
const fallbackSlot = { ...fallbackDay.slots.find((slot) => slot.exercise_type !== "cardio"), movement_pattern: "unavailable_test_pattern" };
const fallbackSkeleton = [{ ...fallbackDay, slots: [fallbackSlot] }];
const fallbackDiagnostics = {};
const fallbackMap = require("../lib/workout-engine").filterCandidatesForSkeleton(
  fallbackSkeleton,
  fallbackSource.normalized_input,
  exercises,
  fallbackDiagnostics
);
assert(fallbackMap[fallbackSlot.slot_id].length > 0, "Role-preserving fallback did not supply candidates");
assert(
  ["role_type_fallback", "role_fallback"].includes(fallbackDiagnostics.slots[fallbackSlot.slot_id].eligibility_mode),
  "Fallback hierarchy did not report its role-preserving tier"
);
assert(
  require("../lib/workout-engine").validateWorkoutCandidateCoverage(
    fallbackSkeleton,
    fallbackMap,
    fallbackDiagnostics,
    fallbackSource.normalized_input
  ).valid,
  "Role-preserving fallback candidates failed coverage validation"
);

const unavailableSlot = {
  ...fallbackSlot,
  training_role: fallbackSlot.muscle_group === "Back" ? "horizontal_push" : "vertical_pull"
};
const unavailableSkeleton = [{ ...fallbackDay, slots: [unavailableSlot] }];
const unavailableDiagnostics = {};
const unavailableMap = require("../lib/workout-engine").filterCandidatesForSkeleton(
  unavailableSkeleton,
  fallbackSource.normalized_input,
  exercises,
  unavailableDiagnostics
);
assert(unavailableMap[unavailableSlot.slot_id].length === 0, "Unavailable role drifted into an unrelated category candidate");
assert(
  unavailableDiagnostics.slots[unavailableSlot.slot_id].eligibility_mode === "role_unavailable",
  "Unavailable role was not reported explicitly"
);

const tamperedMap = JSON.parse(JSON.stringify(fallbackMap));
tamperedMap[fallbackSlot.slot_id][0].training_role = unavailableSlot.training_role;
const tamperedValidation = require("../lib/workout-engine").validateWorkoutCandidateCoverage(
  fallbackSkeleton,
  tamperedMap,
  fallbackDiagnostics,
  fallbackSource.normalized_input
);
assert(
  tamperedValidation.errors.some((error) => error.startsWith("candidate_wrong_training_role:")),
  "Candidate validation did not reject training-role drift"
);

const explicitEquipment = generateScenario({
  place: "Full Equipment Gym",
  days: 3,
  duration: 45,
  equipment: ["Dumbbells"],
  experience: "Beginner",
  injuries: ["Knee"]
});
assert(explicitEquipment.normalized_input.equipment_selection_mode === "explicit", "Explicit equipment mode was not retained");
for (const day of explicitEquipment.skeleton) {
  for (const slot of day.slots) {
    for (const candidate of explicitEquipment.candidate_map[slot.slot_id] || []) {
      assert(candidate.difficulty !== "Advanced", `Advanced exercise leaked into beginner candidates: ${candidate.exercise_id}`);
      assert(!(candidate.injury_flags || []).includes("Knee"), `Knee-flagged exercise leaked into candidates: ${candidate.exercise_id}`);
      if ((candidate.equipment || []).length) {
        assert(
          candidate.equipment.some((item) => String(item).toLowerCase().includes("dumbbell")),
          `Unselected equipment leaked into explicit Dumbbells candidates: ${candidate.exercise_id}`
        );
      }
    }
  }
}

const prompt = buildWorkoutSelectionPromptV2({
  normalizedInput: explicitEquipment.normalized_input,
  coachingStrategy: explicitEquipment.coaching_strategy,
  skeleton: explicitEquipment.skeleton,
  candidateMap: explicitEquipment.candidate_map
});
assert(prompt.user.includes("approved_substitution_ids"), "Approved substitutions are missing from the AI payload");
assert(prompt.user.includes("movement_family"), "Canonical movement families are missing from the AI payload");

const largestScenario = generateScenario({ place: "Full Equipment Gym", days: 6, duration: 90 });
const largestPrompt = buildWorkoutSelectionPromptV2({
  normalizedInput: largestScenario.normalized_input,
  coachingStrategy: largestScenario.coaching_strategy,
  skeleton: largestScenario.skeleton,
  candidateMap: largestScenario.candidate_map
});
const largestPromptCharacters = largestPrompt.system.length + largestPrompt.user.length;
assert(largestPromptCharacters < 110000, `Largest workout prompt is unexpectedly large: ${largestPromptCharacters}`);

console.log(
  JSON.stringify(
    {
      status: "passed",
      candidate_policy_version: "workout_candidate_policy_v2",
      supported_combinations_checked: places.length * dayCounts.length * durations.length,
      slots_checked: slotsChecked,
      role_fallback_slots_observed: fallbackTierSlots,
      constrained_role_fallback_test: "passed",
      unavailable_role_failure_test: "passed",
      role_drift_rejection_test: "passed",
      substitution_ready_candidate_observations: substitutionReadyCandidates,
      explicit_equipment_test: "passed",
      beginner_difficulty_test: "passed",
      injury_exclusion_test: "passed",
      largest_prompt_characters: largestPromptCharacters
    },
    null,
    2
  )
);

function generateScenario({
  place,
  days,
  duration,
  equipment = [],
  experience = "Intermediate",
  injuries = ["None"]
}) {
  return generateWorkoutPlanV2(
    {
      goal: "Build Muscle",
      profile: { experience },
      workout: {
        days: String(days),
        duration: `${duration} minutes`,
        place,
        split: "Auto",
        focusAreas: ["Full Body"],
        equipment,
        injuries
      }
    },
    exercises
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
