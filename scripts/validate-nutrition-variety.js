const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const { generateNutritionPlanV2 } = require("../lib/nutrition-engine");

const mealLookup = new Map(meals.map((meal) => [meal.meal_id, meal]));
const scenarios = [
  ...[2, 3, 4, 5, 6].map((mealCount) => ({ mealCount, dietStyle: "Balanced", allergy: "None" })),
  { mealCount: 4, dietStyle: "Vegetarian", allergy: "Eggs" },
  { mealCount: 5, dietStyle: "High Protein", allergy: "Dairy" }
];

let daysChecked = 0;
let duplicateMeals = 0;
let constrainedVarietyReasons = 0;
let minimumProteinFamilies = Infinity;
let minimumCarbBases = Infinity;

for (const scenario of scenarios) {
  const generated = generateNutritionPlanV2({
    goal: "Lose Weight",
    profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: 80 },
    nutrition: {
      meals: String(scenario.mealCount),
      dietStyle: scenario.dietStyle,
      allergies: [scenario.allergy],
      restrictions: ["None"],
      cookingTime: "Flexible",
      budget: "Flexible",
      preferences: [],
      foodsToAvoid: []
    }
  }, meals, { ingredientLibrary: ingredients });

  assert(generated.validation.valid, `${scenario.dietStyle}/${scenario.allergy}/${scenario.mealCount}: ${generated.validation.errors.join(", ")}`);
  const seenBySlot = {};
  const weekFamilies = new Set();
  const weekCarbs = new Set();

  for (const day of generated.plan.days) {
    const familyCounts = new Map();
    for (const meal of day.meals) {
      const metadata = mealLookup.get(meal.meal_id);
      assert(metadata, `Unknown meal ${meal.meal_id}`);
      assert(metadata.meal_type === meal.meal_slot, `${meal.meal_id} is in the wrong meal slot`);
      seenBySlot[meal.meal_slot] = seenBySlot[meal.meal_slot] || new Set();
      if (seenBySlot[meal.meal_slot].has(meal.meal_id)) {
        assert(String(meal.duplicate_reason || "").length > 20, `${meal.meal_id} repeats without a useful reason`);
        duplicateMeals += 1;
      }
      seenBySlot[meal.meal_slot].add(meal.meal_id);
      familyCounts.set(metadata.protein_family, Number(familyCounts.get(metadata.protein_family) || 0) + 1);
      weekFamilies.add(metadata.protein_family);
      if (metadata.carb_base) weekCarbs.add(metadata.carb_base);
      if (meal.variety_reason) constrainedVarietyReasons += 1;
    }
    for (const [family, count] of familyCounts) {
      if (count > 2) {
        assert(day.meals.some((meal) => mealLookup.get(meal.meal_id)?.protein_family === family && /no approved alternative/i.test(meal.variety_reason || "")), `Day ${day.day_index} overuses ${family} without a constrained-coverage reason`);
      }
    }
    daysChecked += 1;
  }

  const availableFamilies = new Set(Object.values(generated.candidate_map).flat().map((meal) => meal.protein_family).filter(Boolean));
  const availableCarbs = new Set(Object.values(generated.candidate_map).flat().map((meal) => meal.carb_base).filter(Boolean));
  const notes = generated.plan.days.flatMap((day) => day.meals).map((meal) => meal.variety_reason || "");
  assert(weekFamilies.size >= Math.min(3, availableFamilies.size) || notes.some((note) => /protein variety was limited/i.test(note)), "Weekly protein-family coverage is too narrow");
  assert(weekCarbs.size >= Math.min(3, availableCarbs.size) || notes.some((note) => /carbohydrate variety was limited/i.test(note)), "Weekly carbohydrate rotation is too narrow");
  minimumProteinFamilies = Math.min(minimumProteinFamilies, weekFamilies.size);
  minimumCarbBases = Math.min(minimumCarbBases, weekCarbs.size);
}

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.weekly_variety.v1",
  scenarios_checked: scenarios.length,
  days_checked: daysChecked,
  duplicate_meals_with_reasons: duplicateMeals,
  constrained_variety_reasons: constrainedVarietyReasons,
  minimum_weekly_protein_families: minimumProteinFamilies,
  minimum_weekly_carb_bases: minimumCarbBases,
  weighted_quality_score_used: false
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
