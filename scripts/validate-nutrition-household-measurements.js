const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const portionPolicy = require("../lib/nutrition-portion-policy");
const { generateNutritionPlanV2 } = require("../lib/nutrition-engine");

const ingredientLookup = new Map(ingredients.map((ingredient) => [ingredient.ingredient_id, ingredient]));
const scenarios = [
  { meals: 2, goal: "Build Muscle", weight: 90 },
  { meals: 4, goal: "Lose Weight", weight: 80 },
  { meals: 6, goal: "Improve Fitness", weight: 70 }
];

let measurementsChecked = 0;
let gramFallbacks = 0;

for (const scenario of scenarios) {
  const generated = generateNutritionPlanV2({
    goal: scenario.goal,
    profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: scenario.weight },
    nutrition: {
      meals: String(scenario.meals),
      dietStyle: "Balanced",
      allergies: ["None"],
      restrictions: ["None"],
      cookingTime: "Flexible",
      budget: "Flexible",
      preferences: [],
      foodsToAvoid: []
    }
  }, meals, { ingredientLibrary: ingredients });
  assert(generated.validation.valid, `${scenario.meals}-meal measurement scenario failed: ${generated.validation.errors.join(", ")}`);

  for (const day of generated.plan.days) {
    for (const meal of day.meals) {
      for (const row of meal.ingredients) {
        const expected = portionPolicy.formatHouseholdQuantity(row.quantity_g, ingredientLookup.get(row.ingredient_id));
        assert(row.household_quantity === expected, `${meal.meal_id}/${row.ingredient_id} does not match its grams`);
        assert(!/\d+\.\d+/.test(row.household_quantity), `${meal.meal_id}/${row.ingredient_id} exposes a decimal household quantity`);
        assert(!/\b0\s+(cups?|tablespoons?|teaspoons?|servings?)\b/i.test(row.household_quantity), `${meal.meal_id}/${row.ingredient_id} exposes a zero household quantity`);
        assert(!/tomatos|half avocados/i.test(row.household_quantity), `${meal.meal_id}/${row.ingredient_id} uses awkward household wording`);
        if (/^\d+ g$/.test(row.household_quantity)) gramFallbacks += 1;
        measurementsChecked += 1;
      }
    }
  }
}

assert(portionPolicy.formatHouseholdQuantity(10, ingredientLookup.get("olive_oil")) === "2 1/4 teaspoons", "Small oil portions must convert to teaspoons");
assert(portionPolicy.formatHouseholdQuantity(80, ingredientLookup.get("avocado")) === "1/2 avocado", "Avocado must use a natural whole-item fraction");
assert(portionPolicy.formatHouseholdQuantity(160, ingredientLookup.get("tomato")) === "1 1/2 medium tomatoes", "Tomatoes must use natural fractions and correct pluralization");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.household_measurements.v1",
  scenarios_checked: scenarios.length,
  measurements_checked: measurementsChecked,
  gram_fallbacks: gramFallbacks,
  examples: {
    olive_oil_10g: portionPolicy.formatHouseholdQuantity(10, ingredientLookup.get("olive_oil")),
    avocado_80g: portionPolicy.formatHouseholdQuantity(80, ingredientLookup.get("avocado")),
    tomato_160g: portionPolicy.formatHouseholdQuantity(160, ingredientLookup.get("tomato"))
  }
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
