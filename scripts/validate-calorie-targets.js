const {
  calculateCalorieTarget,
  assessNutritionEligibility
} = require("../lib/nutrition-engine");

const profile = {
  gender: "Male",
  birth_date: "1986-06-12",
  height_cm: 170,
  weight_kg: 80
};

const activities = ["Mostly sitting", "Lightly active", "Moderately active", "Very active"];
const weightLossCalculations = activities.map((activityLevel) =>
  calculateCalorieTarget(profile, "Lose Weight", activityLevel)
);

const reference = weightLossCalculations[0];
assert(reference.calculation_version === "fitnet.calorie_target.v2", "Calculation version changed");
assert(reference.estimated_resting_calories === 1668, "Mifflin-St Jeor resting estimate changed");
assert(reference.estimated_maintenance_calories === 2000, "Sedentary maintenance estimate changed");
assert(reference.daily_calorie_target === 1700, "Weight-loss target should be 1700 kcal for the reference profile");
assert(reference.applied_goal_adjustment_calories === -300, "Reference deficit should be 300 kcal");
assert(reference.target_is_estimate, "Calorie target must be labeled as an estimate");

for (let index = 1; index < weightLossCalculations.length; index += 1) {
  assert(
    weightLossCalculations[index].estimated_maintenance_calories > weightLossCalculations[index - 1].estimated_maintenance_calories,
    "Higher activity must increase estimated maintenance"
  );
}

const maintenance = calculateCalorieTarget(profile, "Improve Fitness", "Mostly sitting");
const muscleGain = calculateCalorieTarget(profile, "Build Muscle", "Mostly sitting");
const strength = calculateCalorieTarget(profile, "Gain Strength", "Mostly sitting");
assert(maintenance.daily_calorie_target === maintenance.estimated_maintenance_calories, "Fitness target should use estimated maintenance");
assert(muscleGain.daily_calorie_target > muscleGain.estimated_maintenance_calories, "Muscle-gain target must be a surplus");
assert(strength.daily_calorie_target > strength.estimated_maintenance_calories, "Strength target must be a surplus");
assert(Math.abs(reference.intended_goal_adjustment_calories) >= 250 && Math.abs(reference.intended_goal_adjustment_calories) <= 500, "Weight-loss deficit escaped its bounds");
assert(muscleGain.intended_goal_adjustment_calories <= 250, "Muscle-gain surplus escaped its cap");

const legacy = calculateCalorieTarget(profile, "Lose Weight");
assert(legacy.activity_level === "Mostly sitting" && legacy.activity_source === "legacy_default", "Legacy inputs should use the conservative compatibility default");

const withUnrelatedWorkoutData = calculateCalorieTarget(
  { ...profile, workout: { days: "6", duration: "90 minutes" } },
  "Lose Weight",
  "Mostly sitting"
);
assert(withUnrelatedWorkoutData.daily_calorie_target === reference.daily_calorie_target, "Workout data must not be double-counted in nutrition calories");

const currentYear = new Date().getFullYear();
const minor = assessNutritionEligibility(
  { ...profile, birth_date: `${currentYear - 16}-01-01` },
  { activityLevel: "Mostly sitting", safetyFlags: ["None"] },
  "Lose Weight"
);
assert(!minor.eligible && minor.reasons.includes("adult_only"), "Minor nutrition generation should be blocked");

const clinicalReferral = assessNutritionEligibility(
  profile,
  { activityLevel: "Mostly sitting", safetyFlags: ["Medical nutrition needs"] },
  "Lose Weight"
);
assert(!clinicalReferral.eligible && clinicalReferral.reasons.some((reason) => reason.startsWith("clinical_referral:")), "Medical nutrition needs should trigger a referral");

console.log(JSON.stringify({
  status: "passed",
  calculation_version: reference.calculation_version,
  reference_profile: {
    estimated_resting_calories: reference.estimated_resting_calories,
    estimated_maintenance_calories: reference.estimated_maintenance_calories,
    weight_loss_target: reference.daily_calorie_target
  },
  activity_levels_checked: activities.length,
  goal_directions_checked: 4,
  safety_guards_checked: ["adult_only", "medical_nutrition_referral"],
  workout_double_counting_checked: true
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
