const fs = require("fs");
const path = require("path");
const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const { generateNutritionPlanV2, assessNutritionEligibility } = require("../lib/nutrition-engine");

const root = path.join(__dirname, "..");
const ingredientLookup = new Map(ingredients.map((item) => [item.ingredient_id, item]));
const scenarios = [];

for (const mealsPerDay of [2, 3, 4, 5, 6]) scenarios.push(testCase(`meals_${mealsPerDay}`, { meals: String(mealsPerDay) }));
for (const dietStyle of ["Balanced", "High Protein", "Low Carb", "Mediterranean", "Vegetarian"]) scenarios.push(testCase(`diet_${slug(dietStyle)}`, { dietStyle }));
for (const allergy of ["Nuts", "Shellfish", "Eggs", "Dairy", "Soy"]) scenarios.push(testCase(`allergy_${slug(allergy)}`, { allergies: [allergy] }));
for (const restriction of ["Gluten-free", "Dairy-free", "No red meat"]) scenarios.push(testCase(`restriction_${slug(restriction)}`, { restrictions: [restriction] }));
for (const cookingTime of ["Minimal", "Moderate", "Flexible"]) scenarios.push(testCase(`cooking_${slug(cookingTime)}`, { cookingTime }));
for (const budget of ["Low", "Medium", "Flexible"]) scenarios.push(testCase(`budget_${slug(budget)}`, { budget }));

scenarios.push(
  testCase("known_dairy_minimal_low_four_meals", { meals: "4", allergies: ["Dairy"], cookingTime: "Minimal", budget: "Low" }),
  testCase("fish_minimal_six_meals", { meals: "6", allergies: ["Fish"], cookingTime: "Minimal", budget: "Medium" }),
  testCase("vegetarian_egg_free", { dietStyle: "Vegetarian", allergies: ["Eggs"] }),
  testCase("high_protein_dairy_free", { dietStyle: "High Protein", restrictions: ["Dairy-free"] }),
  testCase("gluten_free_soy_allergy", { restrictions: ["Gluten-free"], allergies: ["Soy"] }),
  testCase("no_red_meat_low_budget", { restrictions: ["No red meat"], budget: "Low" })
);

let slotsChecked = 0;
for (const scenario of uniqueByName(scenarios)) {
  const generated = generateNutritionPlanV2(scenario.input, meals, { ingredientLibrary: ingredients });
  assert(generated.validation.valid, `${scenario.name}: ${generated.validation.errors.join(", ")}`);
  assert(generated.plan.days.length === 7, `${scenario.name}: expected seven days`);
  for (const candidates of Object.values(generated.candidate_map)) {
    assert(candidates.length > 0, `${scenario.name}: a meal slot has no supported recipe`);
    slotsChecked += 1;
  }

  const selectedIngredients = generated.plan.days.flatMap((day) => day.meals).flatMap((meal) => meal.ingredients);
  const forbiddenTags = new Set(generated.normalized_input.allergy_tags);
  for (const row of selectedIngredients) {
    const ingredient = ingredientLookup.get(row.ingredient_id);
    assert(ingredient, `${scenario.name}: unknown ingredient ${row.ingredient_id}`);
    const conflicts = [...(ingredient.allergens || []), ...(ingredient.avoid_tags || [])];
    assert(!conflicts.some((tag) => forbiddenTags.has(tag)), `${scenario.name}: ${row.ingredient_id} conflicts with a selected restriction`);
  }
}

const safetyCases = [
  { name: "pregnancy", nutrition: { safetyFlags: ["Pregnant or breastfeeding"] } },
  { name: "eating_disorder_history", nutrition: { safetyFlags: ["Eating disorder history"] } },
  { name: "medical_nutrition_needs", nutrition: { safetyFlags: ["Medical nutrition needs"] } },
  { name: "combined_safety_referral", nutrition: { safetyFlags: ["Pregnant or breastfeeding", "Medical nutrition needs"] } },
  { name: "minor", profile: { birth_date: "2012-01-01" } }
];
for (const safetyCase of safetyCases) {
  const input = testCase(safetyCase.name, safetyCase.nutrition || {}, safetyCase.profile || {}).input;
  const eligibility = assessNutritionEligibility(input.profile, input.nutrition, input.goal);
  assert(!eligibility.eligible, `${safetyCase.name}: safety referral was not enforced`);
}

const unsupported = testCase("unsupported_restriction", { restrictions: ["Keto except weekends"] }).input;
const unsupportedEligibility = assessNutritionEligibility(unsupported.profile, unsupported.nutrition, unsupported.goal);
assert(!unsupportedEligibility.eligible, "Unsupported dietary restriction was accepted");
assert(unsupportedEligibility.reasons.some((reason) => reason.startsWith("unsupported_dietary_restriction:")), "Unsupported restriction has no explicit reason");

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert(!appSource.includes("restrictionOther") && !appSource.includes("nutritionRestrictionOther"), "Unsupported free-text dietary restriction UI is still present");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.supported_matrix.v1",
  supported_scenarios_checked: uniqueByName(scenarios).length,
  candidate_slots_checked: slotsChecked,
  safety_referrals_checked: safetyCases.length,
  unsupported_free_text_rejected: true
}, null, 2));

function testCase(name, nutritionOverrides = {}, profileOverrides = {}) {
  return {
    name,
    input: {
      goal: "Lose Weight",
      profile: {
        gender: "Female",
        birth_date: "1993-01-01",
        height_cm: 165,
        weight_kg: 70,
        ...profileOverrides
      },
      nutrition: {
        meals: "4",
        activityLevel: "Mostly sitting",
        safetyFlags: ["None"],
        dietStyle: "Balanced",
        restrictions: ["None"],
        allergies: ["None"],
        cookingTime: "Flexible",
        budget: "Flexible",
        preferences: [],
        foodsToAvoid: [],
        ...nutritionOverrides
      }
    }
  };
}

function uniqueByName(items) {
  return [...new Map(items.map((item) => [item.name, item])).values()];
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
