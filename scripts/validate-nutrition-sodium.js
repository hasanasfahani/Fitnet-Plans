const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const {
  generateNutritionPlanV2,
  materializeNutritionSelectionV2,
  validateNutritionPlanV2
} = require("../lib/nutrition-engine");

const mealLookup = new Map(meals.map((meal) => [meal.meal_id, meal]));
const riskCounts = ingredients.reduce((counts, ingredient) => {
  assert(["low", "moderate", "high"].includes(ingredient.sodium_risk), `${ingredient.ingredient_id} lacks sodium risk metadata`);
  counts[ingredient.sodium_risk] += 1;
  return counts;
}, { low: 0, moderate: 0, high: 0 });

for (const meal of meals) {
  const risks = meal.ingredients.map((row) => ingredients.find((ingredient) => ingredient.ingredient_id === row.ingredient_id)?.sodium_risk);
  const expected = risks.includes("high") || risks.filter((risk) => risk === "moderate").length >= 2
    ? "high"
    : risks.includes("moderate") ? "moderate" : "low";
  assert(meal.sodium_risk === expected, `${meal.meal_id} has stale sodium risk metadata`);
}

const generated = generate({ mealCount: 5, allergy: "None" });
assert(generated.validation.valid, generated.validation.errors.join(", "));

const aggressiveSelection = {
  selection_version: "fitnet.nutrition.selection.v1",
  days: generated.skeleton.map((day) => ({
    day_index: day.day_index,
    meals: day.meals.map((slot) => {
      const candidates = generated.candidate_map[slot.slot_id] || [];
      const selected = candidates.find((meal) => meal.sodium_risk === "high")
        || candidates.find((meal) => contains(meal, "smoked_salmon") || contains(meal, "tuna_water_drained"))
        || candidates[0];
      return { meal_slot: slot.meal_slot, meal_id: selected.meal_id };
    })
  }))
};

const repaired = materializeNutritionSelectionV2(
  aggressiveSelection,
  generated.skeleton,
  generated.candidate_map,
  generated.normalized_input,
  meals,
  ingredients
);
const validation = validateNutritionPlanV2(
  repaired,
  generated.skeleton,
  generated.candidate_map,
  generated.normalized_input,
  meals,
  ingredients
);
assert(validation.valid, validation.errors.join(", "));

let smokedSalmonMeals = 0;
let tunaMeals = 0;
let highRiskMeals = 0;
let sodiumExceptions = 0;
for (const day of repaired.days) {
  let dailyHighRisk = 0;
  for (const meal of day.meals) {
    const metadata = mealLookup.get(meal.meal_id);
    if (metadata.sodium_risk === "high") {
      dailyHighRisk += 1;
      highRiskMeals += 1;
    }
    if (contains(metadata, "smoked_salmon")) smokedSalmonMeals += 1;
    if (contains(metadata, "tuna_water_drained")) tunaMeals += 1;
    if (meal.sodium_reason) sodiumExceptions += 1;
  }
  assert(dailyHighRisk <= 1 || day.meals.some((meal) => /no lower-sodium approved alternative/i.test(meal.sodium_reason || "")), `Day ${day.day_index} stacks high sodium-risk meals`);
}
assert(smokedSalmonMeals <= 2 || sodiumExceptions > 0, "Smoked salmon frequency exceeds policy");
assert(tunaMeals <= 2 || sodiumExceptions > 0, "Canned tuna frequency exceeds policy");
assert(!Object.prototype.hasOwnProperty.call(repaired.nutrition_summary, "daily_sodium_mg"), "Unverified sodium totals must not be shown to users");

for (const allergy of ["Dairy", "Fish", "Gluten"]) {
  const scenario = generate({ mealCount: 4, allergy });
  assert(scenario.validation.valid, `${allergy}: ${scenario.validation.errors.join(", ")}`);
}

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.sodium_risk.v1",
  ingredient_risk_counts: riskCounts,
  adversarial_selection_repaired: true,
  high_risk_meals_in_repaired_week: highRiskMeals,
  smoked_salmon_meals: smokedSalmonMeals,
  canned_tuna_meals: tunaMeals,
  constrained_sodium_exceptions: sodiumExceptions,
  unverified_sodium_totals_exposed: false
}, null, 2));

function generate({ mealCount, allergy }) {
  return generateNutritionPlanV2({
    goal: "Lose Weight",
    profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: 80 },
    nutrition: {
      meals: String(mealCount),
      dietStyle: "Balanced",
      allergies: [allergy],
      restrictions: ["None"],
      cookingTime: "Flexible",
      budget: "Flexible",
      preferences: [],
      foodsToAvoid: []
    }
  }, meals, { ingredientLibrary: ingredients });
}

function contains(meal, ingredientId) {
  return (meal?.ingredients || []).some((row) => row.ingredient_id === ingredientId);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
