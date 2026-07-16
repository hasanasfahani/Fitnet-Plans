const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV3,
  validateWorkoutPlanV3,
  normalizeWorkoutDuplicateSelections
} = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const generated = generateWorkoutPlanV3({
  goal: "Lose Weight",
  profile: { experience: "Intermediate" },
  workout: { days: "6", duration: "45 minutes", place: "Full Equipment Gym", split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
}, exercises);

assert(generated.status === "valid_v3", `Baseline failed: ${generated.validation.errors.join(", ")}`);

const repeatedCardio = clone(generated.plan);
const cardioExercises = repeatedCardio.plan_days.flatMap((day) => day.exercises).filter((exercise) => exercise.exercise_category === "cardio");
assert(cardioExercises.length === 2, "Expected two cardio slots");
const firstCardioCandidate = generated.candidate_map[cardioExercises[0].slot_id].find((item) => Number(item.exercise_id) === Number(cardioExercises[0].exercise_id));
assert(generated.candidate_map[cardioExercises[1].slot_id].some((item) => Number(item.exercise_id) === Number(firstCardioCandidate.exercise_id)), "Cardio repeat candidate unavailable");
applyCandidate(cardioExercises[1], firstCardioCandidate);
cardioExercises[1].duplicate_reason = "Repeated.";
normalizeWorkoutDuplicateSelections(repeatedCardio, generated.candidate_map);
assert(cardioExercises[1].duplicate_reason === "Repeated intentionally to keep cardio setup and progression consistent across the week.", "Cardio reason was not canonicalized");
assert(validate(repeatedCardio).valid, `Canonical cardio repeat failed: ${validate(repeatedCardio).errors.join(", ")}`);

const avoidable = clone(generated.plan);
const resistance = avoidable.plan_days.flatMap((day) => day.exercises).filter((exercise) => exercise.exercise_category !== "cardio");
let pair = null;
for (let sourceIndex = 0; sourceIndex < resistance.length && !pair; sourceIndex += 1) {
  const source = resistance[sourceIndex];
  for (let targetIndex = sourceIndex + 1; targetIndex < resistance.length; targetIndex += 1) {
    const target = resistance[targetIndex];
    const shared = generated.candidate_map[target.slot_id].find((candidate) => Number(candidate.exercise_id) === Number(source.exercise_id));
    const unusedAlternative = generated.candidate_map[target.slot_id].find((candidate) => Number(candidate.exercise_id) !== Number(source.exercise_id));
    if (shared && unusedAlternative) {
      pair = { source, target, shared };
      break;
    }
  }
}
assert(pair, "Could not find an avoidable resistance repeat fixture");
applyCandidate(pair.target, pair.shared);
pair.target.duplicate_reason = null;
normalizeWorkoutDuplicateSelections(avoidable, generated.candidate_map);
assert(Number(pair.target.exercise_id) !== Number(pair.source.exercise_id), "Avoidable resistance repeat was not replaced");
assert(pair.target.duplicate_reason === null, "Replacement retained a duplicate reason");
assert(!validate(avoidable).errors.some((error) => error.startsWith("duplicate_")), "Normalized resistance repeat still has duplicate errors");

assert(!/copy debug|copyDebug/i.test(appSource), "Production UI still exposes the copy-debug control");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_duplicate_normalization_v1",
  avoidable_resistance_repeat_replaced: true,
  missing_or_weak_reason_canonicalized: true,
  true_duplicate_validation_preserved: true,
  production_copy_debug_removed: true
}, null, 2));

function validate(plan) {
  return validateWorkoutPlanV3(plan, generated.skeleton, generated.candidate_map, generated.normalized_input, generated.coaching_strategy);
}

function applyCandidate(exercise, candidate) {
  exercise.exercise_id = Number(candidate.exercise_id);
  exercise.exercise_name = candidate.display_name || candidate.name;
  exercise.exercise_category = candidate.category === "Cardio" ? "cardio" : "strength";
  exercise.movement_pattern = candidate.movement_pattern;
  exercise.muscle_group = candidate.category;
  exercise.substitution_ids = [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
