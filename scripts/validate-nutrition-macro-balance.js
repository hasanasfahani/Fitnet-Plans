const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const { generateNutritionPlanV2 } = require("../lib/nutrition-engine");

const scenarios = [
  { meals: 2, goal: "Build Muscle", weight: 90, dietStyle: "High Protein", allergy: "None" },
  { meals: 3, goal: "Lose Weight", weight: 80, dietStyle: "Balanced", allergy: "None" },
  { meals: 4, goal: "Lose Weight", weight: 70, dietStyle: "Low Carb", allergy: "Dairy" },
  { meals: 5, goal: "Improve Fitness", weight: 65, dietStyle: "Mediterranean", allergy: "None" },
  { meals: 6, goal: "Gain Strength", weight: 85, dietStyle: "Balanced", allergy: "Gluten" }
];

let daysChecked = 0;
let maximumProteinPerKg = 0;
let maximumCalorieDeviation = 0;

for (const scenario of scenarios) {
  const generated = generateNutritionPlanV2({
    goal: scenario.goal,
    profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: scenario.weight },
    nutrition: {
      meals: String(scenario.meals),
      dietStyle: scenario.dietStyle,
      allergies: [scenario.allergy],
      restrictions: ["None"],
      cookingTime: "Flexible",
      budget: "Flexible",
      preferences: [],
      foodsToAvoid: []
    }
  }, meals, { ingredientLibrary: ingredients });

  assert(generated.validation.valid, `${scenario.meals}-meal macro scenario failed: ${generated.validation.errors.join(", ")}`);
  const normalized = generated.normalized_input;
  assert(normalized.macro_targets.protein_g <= normalized.protein_ceiling_g, "Protein target exceeds the body-weight ceiling");

  for (const day of generated.plan.days) {
    const totals = day.daily_totals;
    const calorieDeviation = Math.abs(totals.calories - normalized.calorie_target) / normalized.calorie_target;
    maximumCalorieDeviation = Math.max(maximumCalorieDeviation, calorieDeviation);
    maximumProteinPerKg = Math.max(maximumProteinPerKg, totals.protein_g / scenario.weight);
    assert(calorieDeviation <= 0.05, `Day ${day.day_index} calories exceed 5% tolerance`);
    assert(totals.protein_g >= normalized.macro_targets.protein_g * 0.9 && totals.protein_g <= Math.ceil(normalized.macro_targets.protein_g * 1.1), `Day ${day.day_index} protein is outside tolerance`);
    assert(totals.protein_g <= normalized.protein_ceiling_g, `Day ${day.day_index} exceeds the protein ceiling`);
    assert(inRange(totals.carbs_g, normalized.macro_targets.carbs_g, 0.85, 1.15), `Day ${day.day_index} carbohydrates are outside tolerance`);
    assert(inRange(totals.fat_g, normalized.macro_targets.fat_g, 0.85, 1.15), `Day ${day.day_index} fat is outside tolerance`);
    assert(totals.fiber_g >= normalized.fiber_target_g, `Day ${day.day_index} misses the fiber target`);
    daysChecked += 1;
  }
}

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.macro_balance.v1",
  scenarios_checked: scenarios.length,
  days_checked: daysChecked,
  maximum_calorie_deviation_percent: Number((maximumCalorieDeviation * 100).toFixed(2)),
  maximum_observed_protein_g_per_kg: Number(maximumProteinPerKg.toFixed(2)),
  protein_ceiling_g_per_kg: 2.2
}, null, 2));

function inRange(value, target, minimum, maximum) {
  return value >= target * minimum && value <= target * maximum;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
