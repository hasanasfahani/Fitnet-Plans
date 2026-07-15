const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutPlanV3, normalizeWorkoutDuplicateSelections } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const generated = generateWorkoutPlanV3({
  goal: "Lose Weight",
  profile: { experience: "Intermediate" },
  workout: { days: "6", duration: "45 minutes", place: "Full Equipment Gym", split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
}, exercises);

assert(generated.validation.valid, `Reference plan failed: ${generated.validation.errors.join(", ")}`);

const justified = clone(generated.plan);
repeatCardio(justified, generated, "Repeated to keep cardio setup and progression consistent across the two weekly conditioning sessions.");
assert(validate(justified, generated).valid, "A justified second cardio use was rejected");

const weakReason = clone(justified);
findCardio(weakReason, 4).duplicate_reason = "Repeated.";
normalizeWorkoutDuplicateSelections(weakReason, generated.candidate_map);
assert(validate(weakReason, generated).valid, "Backend-normalized repeat reason was rejected");
assert(findCardio(weakReason, 4).duplicate_reason.includes("cardio setup"), "Cardio repeat reason was not canonicalized");

const missingReason = clone(justified);
findCardio(missingReason, 4).duplicate_reason = null;
expectError(missingReason, generated, "duplicate_missing_reason");
normalizeWorkoutDuplicateSelections(missingReason, generated.candidate_map);
assert(validate(missingReason, generated).valid, "Missing repeat reason was not normalized before validation");

const forcedThirdUse = buildForcedThirdUse(generated);
expectError(forcedThirdUse.plan, { ...generated, candidate_map: forcedThirdUse.candidateMap }, "duplicate_exercise_same_day");
expectError(forcedThirdUse.plan, { ...generated, candidate_map: forcedThirdUse.candidateMap }, "duplicate_exercise_week");

const repeatedFamilies = Object.values(generated.validation.quality_validation.diagnostics.days)
  .flatMap((day) => Object.entries(day.movement_family_counts).filter(([, count]) => count > 1));
assert(repeatedFamilies.length > 0, "Reference plan does not exercise useful same-pattern variation");

console.log(JSON.stringify({
  status: "passed",
  variety_policy_version: "workout_variety_policy_v1",
  justified_second_use_accepted: true,
  weak_reason_canonicalized: true,
  missing_reason_canonicalized: true,
  same_day_duplicate_rejected: true,
  third_use_with_alternatives_rejected: true,
  distinct_same_pattern_variations_accepted: true
}, null, 2));

function repeatCardio(plan, source, reason) {
  const first = findCardio(plan, 1);
  const second = findCardio(plan, 4);
  const candidate = (source.candidate_map[second.slot_id] || []).find((item) => Number(item.exercise_id) === Number(first.exercise_id));
  assert(candidate, "The first cardio choice is not approved for the second cardio slot");
  applyCandidate(second, candidate);
  second.duplicate_reason = reason;
}

function buildForcedThirdUse(source) {
  const plan = clone(source.plan);
  const candidateMap = clone(source.candidate_map);
  const slots = ["day2_slot1", "day2_slot2", "day5_slot1"];
  const sourceCandidate = candidateMap[slots[0]][0];
  for (const [index, slotId] of slots.entries()) {
    if (!candidateMap[slotId].some((item) => Number(item.exercise_id) === Number(sourceCandidate.exercise_id))) {
      candidateMap[slotId].push({ ...clone(sourceCandidate), approved_substitution_ids: [] });
    }
    const exercise = plan.plan_days.flatMap((day) => day.exercises).find((item) => item.slot_id === slotId);
    applyCandidate(exercise, sourceCandidate);
    exercise.duplicate_reason = index === 0 ? null : "Repeated for specific technique practice with approved equipment and consistent setup.";
  }
  return { plan, candidateMap };
}

function applyCandidate(exercise, candidate) {
  exercise.exercise_id = Number(candidate.exercise_id);
  exercise.exercise_name = candidate.display_name || candidate.name;
  exercise.exercise_category = candidate.category === "Cardio" ? "cardio" : "strength";
  exercise.movement_pattern = candidate.movement_family || candidate.movement_pattern;
  exercise.muscle_group = candidate.category;
  exercise.substitution_ids = [];
}

function findCardio(plan, dayIndex) {
  return plan.plan_days.find((day) => day.day_index === dayIndex).exercises.find((exercise) => exercise.exercise_category === "cardio");
}

function validate(plan, source) {
  return validateWorkoutPlanV3(plan, source.skeleton, source.candidate_map, source.normalized_input, source.coaching_strategy);
}

function expectError(plan, source, prefix) {
  const result = validate(plan, source);
  assert(result.errors.some((error) => error.startsWith(prefix)), `Missing ${prefix}: ${result.errors.join(", ")}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
