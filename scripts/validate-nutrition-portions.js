const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const portionPolicy = require("../lib/nutrition-portion-policy");
const { generateNutritionPlanV2 } = require("../lib/nutrition-engine");

const mealLookup = new Map(meals.map((meal) => [meal.meal_id, meal]));
const scenarios = [
  { meals: 2, goal: "Build Muscle", weight: 90, dietStyle: "High Protein" },
  { meals: 3, goal: "Lose Weight", weight: 70, dietStyle: "Balanced" },
  { meals: 4, goal: "Lose Weight", weight: 80, dietStyle: "High Protein" },
  { meals: 5, goal: "Improve Fitness", weight: 65, dietStyle: "Mediterranean" },
  { meals: 6, goal: "Gain Strength", weight: 85, dietStyle: "Balanced" }
];

let portionsChecked = 0;
let nonScalableChecks = 0;
let maximumAnimalProtein = 0;
let maximumSmokedFish = 0;
let maximumLeafyVegetable = 0;
let maximumBreakfastCalories = 0;
let maximumSnackCalories = 0;
let maximumMainMealCalories = 0;

for (const scenario of scenarios) {
  const generated = generateNutritionPlanV2({
    goal: scenario.goal,
    profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: scenario.weight },
    nutrition: {
      meals: String(scenario.meals),
      dietStyle: scenario.dietStyle,
      allergies: ["None"],
      restrictions: ["None"],
      cookingTime: "Flexible",
      budget: "Flexible",
      preferences: [],
      foodsToAvoid: []
    }
  }, meals, { ingredientLibrary: ingredients });

  assert(generated.validation.valid, `${scenario.meals}-meal scenario failed: ${generated.validation.errors.join(", ")}`);

  for (const day of generated.plan.days) {
    for (const meal of day.meals) {
      const libraryMeal = mealLookup.get(meal.meal_id);
      assert(libraryMeal, `Unknown materialized meal ${meal.meal_id}`);
      if (meal.meal_slot === "breakfast") maximumBreakfastCalories = Math.max(maximumBreakfastCalories, meal.calories);
      if (meal.meal_slot === "snack") maximumSnackCalories = Math.max(maximumSnackCalories, meal.calories);
      if (["lunch", "dinner"].includes(meal.meal_slot)) {
        maximumMainMealCalories = Math.max(maximumMainMealCalories, meal.calories);
        assert(meal.calories <= portionPolicy.mealCalorieLimit(meal.meal_slot, generated.normalized_input.calorie_target, generated.normalized_input.requested_meals_per_day), `${meal.meal_id} exceeded its main-meal calorie cap`);
      }
      for (const row of meal.ingredients) {
        const libraryRow = libraryMeal.ingredients.find((item) => item.ingredient_id === row.ingredient_id);
        const [minimum, maximum] = portionPolicy.portionRange(row.ingredient_id, row.ingredient_role, meal.meal_slot);
        assert(row.quantity_g >= minimum && row.quantity_g <= maximum, `${meal.meal_id}/${row.ingredient_id} escaped ${minimum}-${maximum} g`);
        if (libraryMeal.non_scalable_ingredients.includes(row.ingredient_id)) {
          assert(Math.abs(row.quantity_g - libraryRow.quantity_g) <= 1, `${meal.meal_id}/${row.ingredient_id} was scaled`);
          nonScalableChecks += 1;
        }
        if (/^(chicken|turkey|beef|lamb|salmon|white_fish|shrimp)/.test(row.ingredient_id)) maximumAnimalProtein = Math.max(maximumAnimalProtein, row.quantity_g);
        if (row.ingredient_id === "smoked_salmon") maximumSmokedFish = Math.max(maximumSmokedFish, row.quantity_g);
        if (["spinach", "lettuce", "mixed_salad"].includes(row.ingredient_id)) maximumLeafyVegetable = Math.max(maximumLeafyVegetable, row.quantity_g);
        portionsChecked += 1;
      }
    }
  }
}

assert(maximumAnimalProtein <= 220, "Animal protein exceeded the main-meal cap");
assert(maximumSmokedFish <= 120, "Smoked fish exceeded its cap");
assert(maximumLeafyVegetable <= 150, "Leafy vegetables exceeded their cap");
assert(maximumBreakfastCalories <= portionPolicy.mealCalorieLimit("breakfast"), "Breakfast exceeded its calorie cap");
assert(maximumSnackCalories <= portionPolicy.mealCalorieLimit("snack"), "Snack exceeded its calorie cap");
assert(nonScalableChecks > 0, "No non-scalable recipe ingredients were verified");

const highThreeMeal = generateNutritionPlanV2({
  goal: "Lose Weight",
  profile: { gender: "Male", birth_date: "1986-06-12", height_cm: 170, weight_kg: 80 },
  nutrition: { meals: "3", activityLevel: "Mostly sitting", safetyFlags: ["None"], dietStyle: "Balanced", allergies: ["None"], restrictions: ["None"], cookingTime: "Flexible", budget: "Flexible", preferences: [], foodsToAvoid: [] }
}, meals, { ingredientLibrary: ingredients });
assert(highThreeMeal.validation.valid, highThreeMeal.validation.errors.join(", "));
assert(highThreeMeal.normalized_input.calorie_target === 1700, "Reference scenario calorie target changed");
assert(highThreeMeal.normalized_input.calorie_calculation.estimated_maintenance_calories === 2000, "Reference maintenance estimate changed");
assert(highThreeMeal.normalized_input.calorie_calculation.applied_goal_adjustment_calories === -300, "Reference goal adjustment changed");
assert(highThreeMeal.normalized_input.requested_meals_per_day === 3 && highThreeMeal.normalized_input.meals_per_day === 3, "Three-meal preference was not preserved exactly");
assert(highThreeMeal.normalized_input.calorie_aware_snacks === 0, "Three-meal preference received an unrequested snack");
assert(highThreeMeal.plan.days.every((day) => day.meals.length === 3 && day.meals.every((meal) => meal.meal_slot !== "snack")), "Three-meal plan contains an extra eating occasion");
assert(highThreeMeal.plan.days.every((day) => Math.abs(day.daily_totals.calories - 1700) / 1700 <= 0.05), "Reference scenario calories exceed 5% tolerance");
assert(!/\bhalal\b/i.test(JSON.stringify(highThreeMeal.plan).replace(/whey_halal/g, "whey_internal_id")), "User-facing plan exposes redundant halal wording");

console.log(JSON.stringify({
  status: "passed",
  policy_version: portionPolicy.version,
  scenarios_checked: scenarios.length,
  portions_checked: portionsChecked,
  non_scalable_checks: nonScalableChecks,
  observed_maximums_g: {
    animal_protein: maximumAnimalProtein,
    smoked_fish: maximumSmokedFish,
    leafy_vegetable: maximumLeafyVegetable
  },
  observed_meal_calorie_maximums: { breakfast: maximumBreakfastCalories, lunch_or_dinner: maximumMainMealCalories, snack: maximumSnackCalories },
  reference_three_meal_preference_preserved: true
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
