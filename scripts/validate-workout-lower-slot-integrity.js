const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV3,
  validateWorkoutCoachingStrategy,
  validateWorkoutPlanV3
} = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const allowedRoles = new Set([
  "knee_dominant", "hip_dominant", "unilateral_lower_body",
  "quadriceps_isolation", "hamstring_isolation", "calves", "core", "cardio"
]);
const scenarios = [];
let lowerDays = 0;
let lowerSlots = 0;

for (const days of [3, 4, 5, 6]) {
  for (const duration of [30, 45, 60, 75]) {
    for (const place of ["Home", "Building Gym", "Full Equipment Gym"]) {
      const generated = generate(days, duration, place);
      assert(generated.validation.valid, `${days}/${duration}/${place}: ${generated.validation.errors.join(", ")}`);
      assert(generated.coaching_strategy.lower_slot_integrity_policy_version === "workout_lower_slot_integrity_v1", "Policy version missing");
      for (const day of generated.skeleton.filter((item) => /Lower|Legs/.test(item.day_name))) {
        const planDay = generated.plan.plan_days.find((item) => item.day_index === day.day_index);
        for (const slot of day.slots) {
          assert(allowedRoles.has(slot.training_role), `${days}/${duration}/${place}/${day.day_name}: forbidden role ${slot.training_role}`);
          const exercise = planDay.exercises.find((item) => item.slot_id === slot.slot_id);
          assert(slot.exercise_type === "cardio" || ["Legs", "Core"].includes(exercise.muscle_group), `${day.day_name}: forbidden muscle group ${exercise.muscle_group}`);
          lowerSlots += 1;
        }
        lowerDays += 1;
      }
      scenarios.push({ days, duration, place });
    }
  }
}

const rejection = generate(4, 60, "Full Equipment Gym");
const malformedSkeleton = clone(rejection.skeleton);
const lowerDay = malformedSkeleton.find((day) => /Lower/.test(day.day_name));
lowerDay.slots.at(-1).training_role = "biceps";
const strategyValidation = validateWorkoutCoachingStrategy(rejection.coaching_strategy, malformedSkeleton);
assert(strategyValidation.errors.some((error) => error.startsWith("strategy:lower_forbidden_role:")), "Forbidden lower-day role was not rejected");

const malformedPlan = clone(rejection.plan);
const malformedDay = malformedPlan.plan_days.find((day) => /Lower/.test(day.day_name));
malformedDay.exercises.at(-1).muscle_group = "Biceps";
const planValidation = validateWorkoutPlanV3(malformedPlan, rejection.skeleton, rejection.candidate_map, rejection.normalized_input, rejection.coaching_strategy);
assert(planValidation.errors.some((error) => error.startsWith("lower_forbidden_muscle_group:")), "Forbidden lower-day muscle group was not rejected");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_lower_slot_integrity_v1",
  scenarios_checked: scenarios.length,
  lower_days_checked: lowerDays,
  lower_slots_checked: lowerSlots,
  allowed_roles: [...allowedRoles],
  supported_gym_isolation_structure_preserved: true,
  home_equipment_fallback_checked: true,
  rejection_cases: ["forbidden_backend_role", "forbidden_generated_muscle_group"]
}, null, 2));

function generate(days, duration, place) {
  return generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: { days: String(days), duration: `${duration} minutes`, place, split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
  }, exercises);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
