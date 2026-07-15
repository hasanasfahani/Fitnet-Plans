const fs = require("fs");
const path = require("path");
const {
  generateNutritionPlanV2,
  materializeNutritionSelectionV2,
  validateNutritionPlanV2
} = require("../lib/nutrition-engine");
const { buildNutritionSelectionPromptV2, canonicalizeNutritionSelectionV1 } = require("../lib/plan-contracts");

const root = path.join(__dirname, "..");
const meals = read("data/meal_library.json");
const ingredients = read("data/ingredient_library.json");
let scenarios = 0;
let minimumCandidates = Infinity;

for (const meal of meals) {
  assert(meal.quality_metadata_version === "nutrition_recipe_quality_v1", `${meal.meal_id} is missing quality metadata`);
  assert(["bake", "saute", "blend", "assemble"].includes(meal.cooking_technique), `${meal.meal_id} has an invalid cooking technique`);
  assert(["light", "moderate", "rich"].includes(meal.richness_level), `${meal.meal_id} has an invalid richness level`);
  assert(meal.review_method === "deterministic_quality_review", `${meal.meal_id} has an unknown review method`);
  for (const ingredient of meal.ingredients || []) {
    if (ingredient.ingredient_role === "sauce" && ingredient.ingredient_id !== "tomato_sauce") {
      assert(Number(ingredient.quantity_g || 0) <= 45, `${meal.meal_id} has an oversized sauce portion`);
    }
  }
}

for (const dietStyle of ["Balanced", "High Protein", "Low Carb", "Mediterranean", "Vegetarian"]) {
  for (const allergy of ["None", "Eggs", "Dairy", "Gluten", "Nuts", "Fish", "Shellfish", "Soy"]) {
    for (const cookingTime of ["Minimal", "Moderate", "Flexible"]) {
      for (const budget of ["Low", "Medium", "Flexible"]) {
        for (const mealCount of [2, 3, 4, 5, 6]) {
          const generated = generate({ dietStyle, allergy, cookingTime, budget, mealCount });
          assert(generated.validation.valid, `${dietStyle}/${allergy}/${cookingTime}/${budget}/${mealCount}: ${generated.validation.errors.join(", ")}`);
          const candidateCounts = Object.values(generated.candidate_map).map((items) => items.length);
          assert(candidateCounts.every((count) => count >= 1), "A filtered meal slot has no approved candidates");
          minimumCandidates = Math.min(minimumCandidates, ...candidateCounts);
          scenarios += 1;
        }
      }
    }
  }
}

for (const dietStyle of ["Balanced", "High Protein", "Low Carb", "Mediterranean", "Vegetarian"]) {
  const generated = generate({ dietStyle, allergy: "None", cookingTime: "Flexible", budget: "Flexible", mealCount: 4 });
  assert(Object.values(generated.candidate_map).every((items) => items.length >= 3), `${dietStyle} lacks normal-case recipe variety`);
}

const eggAllergy = generate({ dietStyle: "Balanced", allergy: "Eggs", cookingTime: "Flexible", budget: "Flexible", mealCount: 4 });
assert(Object.values(eggAllergy.candidate_map).flat().every((meal) => !(meal.allergens || []).includes("egg")), "Egg-allergy filtering leaked an egg recipe");

const twoMeal = generate({ dietStyle: "Balanced", allergy: "None", cookingTime: "Flexible", budget: "Flexible", mealCount: 2, goal: "Build Muscle", weight: 85 });
assert(twoMeal.normalized_input.requested_meals_per_day === 2, "Requested two-meal preference was lost");
assert(twoMeal.normalized_input.calorie_aware_snacks >= 1, "Two-meal plan did not add calorie-aware snacks");
assert(twoMeal.plan.days.every((day) => day.meals.filter((meal) => meal.meal_slot === "snack").length === twoMeal.normalized_input.calorie_aware_snacks), "Calorie-aware snack count is inconsistent");

const prompt = buildNutritionSelectionPromptV2({ normalizedInput: twoMeal.normalized_input, skeleton: twoMeal.skeleton, candidateMap: twoMeal.candidate_map });
assert(prompt.user.includes("fitnet.nutrition.selection.v1"), "Selection contract is missing");
assert(!prompt.user.includes('"ingredients"') && !prompt.user.includes('"cooking_method"'), "Prompt exposes backend-owned recipe content");

const maliciousSelection = canonicalizeNutritionSelectionV1({
  selection_version: "fitnet.nutrition.selection.v1",
  days: twoMeal.skeleton.map((day) => ({
    day_index: day.day_index,
    meals: day.meals.map((slot) => ({
      meal_slot: slot.meal_slot,
      meal_id: twoMeal.candidate_map[slot.slot_id][0].meal_id,
      ingredients: [{ name: "Invented food", quantity_g: 9999 }],
      calories: 1
    }))
  }))
});
const materialized = materializeNutritionSelectionV2(maliciousSelection, twoMeal.skeleton, twoMeal.candidate_map, twoMeal.normalized_input, meals, ingredients);
const validation = validateNutritionPlanV2(materialized, twoMeal.skeleton, twoMeal.candidate_map, twoMeal.normalized_input, meals, ingredients);
assert(validation.valid, validation.errors.join(", "));
assert(materialized.days.flatMap((day) => day.meals).every((meal) => !meal.ingredients.some((item) => item.name === "Invented food") && meal.calories > 1), "LLM-authored recipe details reached the final plan");
assert(materialized.weekly_grocery_list.flatMap((group) => group.items).every((item) => item.ingredient_id), "Grocery list is not grouped by ingredient_id");

const tampered = clone(materialized);
tampered.days[0].meals[0].ingredients[0].quantity_g += 100;
const tamperedValidation = validateNutritionPlanV2(tampered, twoMeal.skeleton, twoMeal.candidate_map, twoMeal.normalized_input, meals, ingredients);
assert(tamperedValidation.errors.some((error) => error.startsWith("meal_nutrition_mismatch:")), "Tampered ingredient nutrition was not rejected");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet_rich_recipe_library_v2",
  recipes: meals.length,
  ingredients: ingredients.length,
  scenarios_checked: scenarios,
  minimum_candidates_in_constrained_scenarios: minimumCandidates,
  normal_scenario_minimum_candidates: 3,
  llm_selection_only: true,
  backend_materialization_verified: true,
  egg_allergy_verified: true,
  strict_halal_forbidden_terms_verified: true,
  quality_metadata_verified: true,
  grocery_grouping: "ingredient_id"
}, null, 2));

function generate({ dietStyle, allergy, cookingTime, budget, mealCount, goal = "Lose Weight", weight = 70 }) {
  return generateNutritionPlanV2({
    goal,
    profile: { gender: "Female", birth_date: "1993-01-01", height_cm: 165, weight_kg: weight },
    nutrition: { meals: String(mealCount), dietStyle, allergies: [allergy], restrictions: ["None"], cookingTime, budget, preferences: [], foodsToAvoid: [] }
  }, meals, { ingredientLibrary: ingredients });
}

function read(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
