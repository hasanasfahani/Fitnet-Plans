const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutPlanV3 } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const schedules = [2, 3, 4, 5, 6];
const durations = [30, 45, 60, 75];
const places = ["Home", "Building Gym", "Full Equipment Gym"];
let scenariosChecked = 0;
let daysChecked = 0;

for (const days of schedules) {
  for (const duration of durations) {
    for (const place of places) {
      const generated = generate({ days, duration, place });
      assert(generated.validation.valid, `${days}/${duration}/${place}: ${generated.validation.errors.join(", ")}`);
      for (const diagnostic of generated.validation.quality_validation.diagnostics.days) {
        const constrainedHomeHinge = place === "Home" && duration >= 60 && /Lower|Legs/.test(diagnostic.day_name);
        assert(
          Object.entries(diagnostic.same_function_counts || {}).every(([signature, count]) =>
            count <= 1 || (constrainedHomeHinge && signature.startsWith("hip_dominant|hinge|") && count === 2)
          ),
          `${days}/${duration}/${place}/${diagnostic.day_name}: same function repeated`
        );
        daysChecked += 1;
      }
      scenariosChecked += 1;
    }
  }
}

const complementary = generate({ days: 6, duration: 75, place: "Full Equipment Gym" });
const pushDay = complementary.plan.plan_days.find((day) => day.day_name === "Push A");
const horizontalPushes = pushDay.exercises.map((exercise) => ({
  exercise,
  candidate: complementary.candidate_map[exercise.slot_id].find((item) => Number(item.exercise_id) === Number(exercise.exercise_id))
})).filter(({ candidate }) => candidate?.training_role === "horizontal_push");
assert(horizontalPushes.length === 2, "Reference Push A does not contain the expected complementary horizontal-push roles");
assert(
  horizontalPushes[0].candidate.movement_family !== horizontalPushes[1].candidate.movement_family ||
    horizontalPushes[0].candidate.exercise_type !== horizontalPushes[1].candidate.exercise_type,
  "Press and fly functions were flattened into the same signature"
);

const lowerBDay = complementary.plan.plan_days.find((day) => day.day_name === "Legs B");
const lowerBFunctions = lowerBDay.exercises.map((exercise) =>
  complementary.candidate_map[exercise.slot_id].find((item) => Number(item.exercise_id) === Number(exercise.exercise_id))
).filter((candidate) => candidate?.training_role === "hip_dominant");
assert(lowerBFunctions.some((candidate) => candidate.movement_family === "hinge"), "Lower B complementary hinge is missing");
assert(lowerBFunctions.some((candidate) => candidate.movement_family === "hip_extension"), "Lower B complementary hip extension is missing");

const duplicateCandidateMap = clone(complementary.candidate_map);
const first = horizontalPushes[0];
const second = horizontalPushes[1];
const firstCandidate = duplicateCandidateMap[first.exercise.slot_id].find((item) => Number(item.exercise_id) === Number(first.exercise.exercise_id));
const secondCandidate = duplicateCandidateMap[second.exercise.slot_id].find((item) => Number(item.exercise_id) === Number(second.exercise.exercise_id));
secondCandidate.movement_family = firstCandidate.movement_family;
secondCandidate.movement_pattern = firstCandidate.movement_pattern;
secondCandidate.exercise_type = firstCandidate.exercise_type;
secondCandidate.substitution_group = firstCandidate.substitution_group;
const duplicateValidation = validateWorkoutPlanV3(
  complementary.plan,
  complementary.skeleton,
  duplicateCandidateMap,
  complementary.normalized_input,
  complementary.coaching_strategy
);
assert(
  duplicateValidation.errors.some((error) => error.startsWith("quality:same_function_redundancy:")),
  "An unresolved same-function duplicate was not rejected"
);

const injuryAdapted = generateWorkoutPlanV3({
  goal: "Build Muscle",
  profile: { experience: "Intermediate" },
  workout: {
    days: "4",
    duration: "45 minutes",
    place: "Building Gym",
    split: "Auto",
    focusAreas: ["Full Body"],
    equipment: [],
    injuries: ["Knee"]
  }
}, exercises);
assert(injuryAdapted.validation.valid, `Deferred injury adaptation was broken: ${injuryAdapted.validation.errors.join(", ")}`);

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_same_function_policy_v1",
  scenarios_checked: scenariosChecked,
  workout_days_checked: daysChecked,
  metadata_fields: ["training_role", "movement_family", "exercise_type", "substitution_group"],
  accepted_complementary_pairs: ["press_and_fly", "hinge_and_hip_extension"],
  rejected_cases: ["same_role_movement_type_and_substitution_group"],
  injury_adapted_structure_deferred: true,
  exercise_name_matching_used: false
}, null, 2));

function generate({ days, duration, place }) {
  return generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: {
      days: String(days),
      duration: `${duration} minutes`,
      place,
      split: "Auto",
      focusAreas: ["Full Body"],
      equipment: [],
      injuries: ["None"]
    }
  }, exercises);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
