const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutPlanV3, validateWorkoutCoachingStrategy } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const schedules = [3, 4, 5, 6];
const durations = [30, 45, 60, 75];
const places = ["Home", "Building Gym", "Full Equipment Gym"];
let scenariosChecked = 0;
let pairedUpperScenarios = 0;

for (const days of schedules) {
  for (const duration of durations) {
    for (const place of places) {
      const generated = generate({ days, duration, place });
      assert(generated.strategy_validation.valid, `${days}/${duration}/${place}: ${generated.strategy_validation.errors.join(", ")}`);
      assert(generated.validation.valid, `${days}/${duration}/${place}: ${generated.validation.errors.join(", ")}`);
      assert(generated.coaching_strategy.arm_balance_policy_version === "workout_direct_arm_balance_v1", "Arm-balance policy version is missing");

      const upperRequirements = generated.coaching_strategy.day_requirements.filter((requirement) =>
        ["upper", "push", "pull"].includes(requirement.day_role)
      );
      const plannedRoles = upperRequirements.flatMap((requirement) => requirement.training_role_template);
      const bicepsSlots = plannedRoles.filter((role) => role === "biceps").length;
      const tricepsSlots = plannedRoles.filter((role) => role === "triceps").length;
      assert(Math.abs(bicepsSlots - tricepsSlots) <= 1, `${days}/${duration}/${place}: direct arm slots are imbalanced ${bicepsSlots}/${tricepsSlots}`);

      const upperA = upperRequirements.find((requirement) => requirement.day_name === "Upper A");
      const upperB = upperRequirements.find((requirement) => requirement.day_name === "Upper B");
      if (upperA && upperB) {
        assert(upperA.training_role_template.includes("triceps"), `${duration}/${place}: Upper A lacks direct triceps`);
        assert(upperB.training_role_template.includes("biceps"), `${duration}/${place}: Upper B lacks direct biceps`);
        pairedUpperScenarios += 1;
      }

      if (place !== "Home") {
        const lowerArmRoles = generated.skeleton
          .filter((day) => /Lower|Legs/.test(day.day_name))
          .flatMap((day) => day.slots)
          .filter((slot) => ["biceps", "triceps"].includes(slot.training_role));
        assert(lowerArmRoles.length === 0, `${days}/${duration}/${place}: lower-body template contains direct arm isolation`);
      }

      const armDiagnostics = generated.validation.quality_validation.diagnostics.direct_arm_balance;
      assert(armDiagnostics, `${days}/${duration}/${place}: direct-arm diagnostics are missing`);
      if (armDiagnostics.planned_slots.biceps && armDiagnostics.planned_slots.triceps) {
        assert(
          Math.abs(armDiagnostics.selected_sets.biceps - armDiagnostics.selected_sets.triceps) <= armDiagnostics.maximum_set_difference,
          `${days}/${duration}/${place}: selected direct-arm sets exceed the allowed difference`
        );
      }
      scenariosChecked += 1;
    }
  }
}

const strategyBaseline = generate({ days: 4, duration: 45, place: "Full Equipment Gym" });
const malformedStrategy = clone(strategyBaseline.coaching_strategy);
const upperBRequirement = malformedStrategy.day_requirements.find((requirement) => requirement.day_name === "Upper B");
const bicepsIndex = upperBRequirement.training_role_template.indexOf("biceps");
upperBRequirement.training_role_template[bicepsIndex] = "triceps";
const malformedStrategyValidation = validateWorkoutCoachingStrategy(malformedStrategy, strategyBaseline.skeleton);
assert(
  malformedStrategyValidation.errors.some((error) => error.startsWith("strategy:direct_arm_slot_imbalance")),
  "Backend direct-arm slot imbalance was not rejected"
);

const outputBaseline = generate({ days: 6, duration: 75, place: "Full Equipment Gym" });
const imbalancedPlan = clone(outputBaseline.plan);
for (const day of imbalancedPlan.plan_days) {
  for (const exercise of day.exercises) {
    const candidate = outputBaseline.candidate_map[exercise.slot_id].find((item) => Number(item.exercise_id) === Number(exercise.exercise_id));
    if (candidate?.training_role === "biceps") exercise.sets = 2;
    if (candidate?.training_role === "triceps") exercise.sets = 5;
  }
}
const imbalancedValidation = validateWorkoutPlanV3(
  imbalancedPlan,
  outputBaseline.skeleton,
  outputBaseline.candidate_map,
  outputBaseline.normalized_input,
  outputBaseline.coaching_strategy
);
assert(
  imbalancedValidation.errors.some((error) => error.startsWith("quality:direct_arm_set_imbalance")),
  "AI direct-arm set imbalance was not rejected"
);

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_direct_arm_balance_v1",
  scenarios_checked: scenariosChecked,
  paired_upper_scenarios: pairedUpperScenarios,
  schedules_checked: schedules,
  durations_checked: durations,
  places_checked: places,
  maximum_slot_difference: 1,
  maximum_set_difference: 4,
  lower_body_direct_arm_slots_for_supported_gyms: 0,
  rejection_cases: ["backend_slot_imbalance", "ai_set_imbalance"]
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
