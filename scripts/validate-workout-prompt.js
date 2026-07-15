const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV2 } = require("../lib/workout-engine");
const { buildWorkoutSelectionPromptV2 } = require("../lib/plan-contracts");
const { TRAINING_ROLES } = require("../lib/exercise-metadata");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const generated = generateWorkoutPlanV2(
  {
    goal: "Build Muscle",
    profile: {
      gender: "Male",
      birth_date: "2000-01-01",
      height_cm: "180",
      weight_kg: "80",
      experience: "Intermediate"
    },
    workout: {
      days: "6",
      duration: "90 minutes",
      place: "Full Equipment Gym",
      split: "Auto",
      focusAreas: ["Chest", "Back"],
      equipment: [],
      injuries: ["None"]
    }
  },
  exercises
);
const prompt = buildWorkoutSelectionPromptV2({
  normalizedInput: generated.normalized_input,
  coachingStrategy: generated.coaching_strategy,
  skeleton: generated.skeleton,
  candidateMap: generated.candidate_map
});
const payload = JSON.parse(prompt.user);
const promptCharacters = prompt.system.length + prompt.user.length;

assert(prompt.prompt_version === "workout_program_v3_1", "Unexpected workout prompt version");
assert(prompt.response_format === "json_schema", "Prompt must use strict provider JSON Schema mode");
assert(promptCharacters < 65000, `Six-day prompt exceeds size guard: ${promptCharacters}`);
assert(!prompt.system.includes("pain triggers"), "Prompt references an answer the questionnaire does not collect");
assert(prompt.system.includes("do not provide a diagnosis"), "Prompt lacks medical-boundary wording");
assert(prompt.system.includes("Backend decisions are final"), "Prompt does not declare backend-owned decisions immutable");
assert(prompt.system.includes("training role for each slot"), "Prompt does not fix slot training roles");
assert(prompt.system.includes("exercise count for each day"), "Prompt does not fix per-day exercise counts");
assert(prompt.system.includes("cardio allocation"), "Prompt does not fix cardio allocation");
assert(prompt.system.includes("exactly one approved exercise ID from candidates_by_slot"), "Prompt lacks exact per-slot candidate selection");
assert(prompt.system.includes("A/B sessions meaningfully different"), "Prompt lacks complementary A/B instructions");
assert(prompt.system.includes("safe ranges, working-set budget"), "Prompt lacks safe prescription and time-budget instructions");
assert(prompt.system.includes("Avoid unnecessary exercise repetition"), "Prompt lacks weekly repetition control");
assert(payload.user_context.profile_context.gender === "Male", "Gender was not carried into workout context");
assert(payload.user_context.profile_context.birth_date === "2000-01-01", "Birth date was not carried into workout context");
assert(payload.user_context.profile_context.height_cm === 180, "Height was not normalized into workout context");
assert(payload.user_context.profile_context.weight_kg === 80, "Weight was not normalized into workout context");
assert(Number.isInteger(payload.user_context.profile_context.age_years), "Age was not derived from birth date");
assert(payload.backend_coaching_strategy.strategy_version === "workout_coaching_rules_v1", "Coaching strategy is missing");
assert(payload.output_schema_id === "fitnet.workout.output.v3", "Output schema ID is missing");
assert(!payload.safe_output_requirements.required_root_fields.includes("weeks"), "Step 7 expanded the existing response shape");
assert(payload.safe_output_requirements.field_types.exercise_id.includes("candidates_by_slot"), "Exercise ID contract is ambiguous");
for (const [exerciseId, exercise] of Object.entries(payload.approved_exercise_catalog)) {
  assert(TRAINING_ROLES.includes(exercise.training_role), `Catalog exercise ${exerciseId} has no canonical training role`);
}

for (const [slotId, slotCandidates] of Object.entries(payload.candidates_by_slot)) {
  assert(slotCandidates.length > 0 && slotCandidates.length <= 6, `Invalid candidate count in ${slotId}`);
  const ids = new Set(slotCandidates.map((candidate) => String(candidate.id)));
  for (const candidate of slotCandidates) {
    assert(payload.approved_exercise_catalog[String(candidate.id)], `Slot ${slotId} references a missing catalog ID`);
    const fixedSlot = payload.fixed_weekly_skeleton.flatMap((day) => day.slots).find((slot) => slot.slot_id === slotId);
    assert(fixedSlot, `Slot ${slotId} is missing from the fixed skeleton`);
    assert(
      payload.approved_exercise_catalog[String(candidate.id)].training_role === fixedSlot.training_role,
      `Slot ${slotId} contains a candidate outside its fixed training role`
    );
    for (const substitutionId of candidate.approved_substitution_ids) {
      assert(ids.has(String(substitutionId)), `Slot ${slotId} contains an unapproved substitution reference`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      prompt_version: prompt.prompt_version,
      response_format: prompt.response_format,
      prompt_characters: promptCharacters,
      fixed_days: payload.fixed_weekly_skeleton.length,
      catalog_records: Object.keys(payload.approved_exercise_catalog).length,
      catalog_training_roles_checked: true,
      slot_references_checked: Object.keys(payload.candidates_by_slot).length
    },
    null,
    2
  )
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
