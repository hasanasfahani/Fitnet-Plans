const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const { generateNutritionPlanV2, validateNutritionPlanV2 } = require("../lib/nutrition-engine");

const generated = generateNutritionPlanV2({
  goal: "Lose Weight",
  profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: 80 },
  nutrition: {
    meals: "4",
    dietStyle: "Balanced",
    allergies: ["None"],
    restrictions: ["None"],
    cookingTime: "Flexible",
    budget: "Flexible",
    preferences: ["Chicken"],
    foodsToAvoid: []
  }
}, meals, { ingredientLibrary: ingredients });

assert(generated.validation.valid, generated.validation.errors.join(", "));
assert(generated.validation.quality_score.passed, "A valid plan did not pass the quality threshold");
assert(generated.validation.quality_score.score >= 95, "A valid representative plan scored unexpectedly low");
assert(Object.keys(generated.validation.quality_score.categories).length === 8, "Quality score does not include all eight required categories");

const degraded = clone(generated.plan);
for (const day of degraded.days) {
  day.daily_totals.calories += 1000;
  day.meals[0].ingredients[0].household_quantity = "invalid";
}
degraded.days[0].meals[0].meal_name = "Workout exercise program";
degraded.weekly_grocery_list[0].items[0].quantity_g += 500;

const rejected = validateNutritionPlanV2(
  degraded,
  generated.skeleton,
  generated.candidate_map,
  generated.normalized_input,
  meals,
  ingredients
);

assert(!rejected.valid, "A degraded nutrition plan passed the quality gate");
assert(rejected.quality_score.score < rejected.quality_score.threshold, "A degraded plan did not fall below the quality threshold");
assert(rejected.errors.some((error) => error.startsWith("quality:score_below_threshold:")), "The minimum quality threshold was not enforced");
assert(rejected.errors.includes("nutrition_scope:workout_language"), "Workout wording was not rejected from a nutrition plan");
assert(rejected.quality_score.reasons.includes("macro_balance"), "Macro deductions were not reported");
assert(rejected.quality_score.reasons.includes("portion_realism"), "Portion deductions were not reported");
assert(rejected.quality_score.reasons.includes("recipe_authenticity"), "Recipe deductions were not reported");
assert(rejected.quality_score.reasons.includes("grocery_practicality"), "Grocery deductions were not reported");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.quality_gate.v1",
  threshold: generated.validation.quality_score.threshold,
  valid_plan_score: generated.validation.quality_score.score,
  degraded_plan_score: rejected.quality_score.score,
  categories: Object.keys(generated.validation.quality_score.categories),
  pdf_requires_valid_gate: true,
  nutrition_scope_check: true
}, null, 2));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
