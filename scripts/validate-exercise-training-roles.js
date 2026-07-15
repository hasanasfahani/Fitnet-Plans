const fs = require("fs");
const path = require("path");
const { TRAINING_ROLES, canonicalTrainingRole } = require("../lib/exercise-metadata");
const { generateWorkoutPlanV3 } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const sourceFields = ["exercise_id", "name", "category", "sub_muscles", "equipment", "movement_pattern", "allowed_places"];

for (const exercise of exercises) {
  for (const field of sourceFields) assert(exercise[field] !== undefined && exercise[field] !== null, `Source field ${field} is missing for ${exercise.exercise_id}`);
  assert(TRAINING_ROLES.includes(exercise.training_role), `Invalid role for ${exercise.exercise_id}: ${exercise.training_role}`);
  assert(
    exercise.training_role === canonicalTrainingRole(exercise, exercise.movement_family, exercise.exercise_type),
    `Non-deterministic role for ${exercise.exercise_id}`
  );
}

const expectedExamples = [
  [/bench press/i, "horizontal_push", "chest press"],
  [/shoulder press|military press/i, "vertical_push", "shoulder press"],
  [/bent over row|seated row/i, "horizontal_pull", "row"],
  [/pull up|pulldown/i, "vertical_pull", "vertical pull"],
  [/goblet squat|back squat/i, "knee_dominant", "squat"],
  [/deadlift/i, "hip_dominant", "hinge"],
  [/lunge/i, "unilateral_lower_body", "unilateral lower body"],
  [/leg extension/i, "quadriceps_isolation", "quadriceps isolation"],
  [/leg curl/i, "hamstring_isolation", "hamstring isolation"],
  [/calf/i, "calves", "calves"],
  [/lateral raise|rear delt/i, "side_rear_delts", "side or rear delts"],
  [/curl/i, "biceps", "biceps"],
  [/triceps|pushdown/i, "triceps", "triceps"],
  [/wrist curl/i, "forearms", "forearms"],
  [/crunch|plank/i, "core", "core"],
  [/treadmill|stationary bike/i, "cardio", "cardio"]
];
for (const [pattern, role, label] of expectedExamples) {
  const example = exercises.find((exercise) => pattern.test(exercise.name) && exercise.training_role === role);
  assert(example, `Missing representative ${label} exercise with role ${role}`);
}

const generated = generateWorkoutPlanV3({
  goal: "Build Muscle",
  profile: { experience: "Intermediate" },
  workout: {
    days: "5",
    duration: "60 minutes",
    place: "Full Equipment Gym",
    split: "Auto",
    focusAreas: ["Full Body"],
    equipment: [],
    injuries: ["None"]
  }
}, exercises);
assert(generated.validation.valid, `Role-aware plan failed: ${generated.validation.errors.join(", ")}`);
for (const candidates of Object.values(generated.candidate_map)) {
  for (const candidate of candidates) assert(TRAINING_ROLES.includes(candidate.training_role), `Candidate ${candidate.exercise_id} has no canonical role`);
}

console.log(JSON.stringify({
  status: "passed",
  metadata_version: exercises[0]?.metadata_version,
  records_checked: exercises.length,
  allowed_roles: TRAINING_ROLES,
  roles_present: [...new Set(exercises.map((exercise) => exercise.training_role))].sort(),
  representative_roles_checked: expectedExamples.length,
  role_aware_generation_checked: true,
  source_fields_preserved: sourceFields
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
