const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const portionPolicy = require("../lib/nutrition-portion-policy");
const { generateNutritionPlanV2 } = require("../lib/nutrition-engine");

const breakfasts = meals.filter((meal) => meal.meal_type === "breakfast");
assert(breakfasts.length === 25, `Expected 25 breakfasts, received ${breakfasts.length}`);

for (const meal of breakfasts) {
  assert(meal.savory_breakfast === true && meal.contains_sweet_food === false, `${meal.meal_id}: breakfast must be savory`);
  assert(meal.carb_base === null && meal.contains_breakfast_carbs === false, `${meal.meal_id}: breakfast has a carbohydrate base`);
  assert(meal.ingredients.every((row) => !["carb_base", "fruit", "legume"].includes(row.ingredient_role)), `${meal.meal_id}: breakfast contains bread, grains, fruit, or legumes`);
  assert(meal.calories <= portionPolicy.mealCalorieLimit("breakfast"), `${meal.meal_id}: breakfast exceeds ${portionPolicy.mealCalorieLimit("breakfast")} kcal`);
}

for (const meal of meals) {
  const instructions = meal.cooking_method.join(" ").toLowerCase();
  assert(!/chop or warm .* as appropriate|slice or portion|combine .*finish with|prepare the cooked/.test(instructions), `${meal.meal_id}: generic preparation language remains`);
  assert(!/warm the (plain greek yogurt|cottage cheese|labneh|smoked salmon|tuna)/.test(instructions), `${meal.meal_id}: cold ingredient is warmed`);
}
assert(meals.flatMap((meal) => meal.ingredients).every((row) => !/\bhalal\b/i.test(row.name)), "Recipe ingredient labels expose redundant halal wording");

const generated = generateNutritionPlanV2({
  goal: "Lose Weight",
  profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: 80 },
  nutrition: { meals: "4", dietStyle: "Balanced", allergies: ["None"], restrictions: ["None"], cookingTime: "Flexible", budget: "Flexible", preferences: [], foodsToAvoid: [] }
}, meals, { ingredientLibrary: ingredients });
assert(generated.validation.valid, generated.validation.errors.join(", "));

let maximumBreakfastCalories = 0;
let maximumMainMealProtein = 0;
let maximumSnackProtein = 0;
for (const day of generated.plan.days) {
  for (const meal of day.meals) {
    if (meal.meal_slot === "breakfast") {
      maximumBreakfastCalories = Math.max(maximumBreakfastCalories, meal.calories);
      assert(meal.ingredients.every((row) => !["carb_base", "fruit", "legume"].includes(row.ingredient_role)), `Day ${day.day_index}: restricted breakfast ingredient reached runtime`);
    }
    if (meal.meal_slot === "snack") maximumSnackProtein = Math.max(maximumSnackProtein, meal.protein_g);
    else maximumMainMealProtein = Math.max(maximumMainMealProtein, meal.protein_g);
  }
}

assert(maximumBreakfastCalories <= 650, "Runtime breakfast exceeds 650 kcal");
assert(maximumMainMealProtein <= 60, "Main meal protein is unevenly concentrated");
assert(maximumSnackProtein <= 30, "Snack protein is unevenly concentrated");
assert(portionPolicy.formatHouseholdQuantity(50, ingredients.find((item) => item.ingredient_id === "avocado")) === "1/4 avocado", "Avocado household conversion remains impractical");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.breakfast_quality.v1",
  breakfasts_checked: breakfasts.length,
  recipes_checked_for_culinary_language: meals.length,
  maximum_runtime_breakfast_calories: maximumBreakfastCalories,
  maximum_runtime_main_meal_protein_g: maximumMainMealProtein,
  maximum_runtime_snack_protein_g: maximumSnackProtein,
  breakfast_carb_bases: 0,
  breakfast_fruit_ingredients: 0
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
