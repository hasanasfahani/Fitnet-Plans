const fs = require("fs");
const path = require("path");
const { enrichFoodLibrary, calculateMealNutrition } = require("../lib/nutrition-engine");
const portionPolicy = require("../lib/nutrition-portion-policy");

const root = path.join(__dirname, "..");
const requiredExerciseFields = [
  "exercise_id",
  "name",
  "category",
  "sub_muscles",
  "equipment",
  "difficulty",
  "movement_pattern",
  "exercise_type",
  "allowed_places",
  "contraindications"
];
const requiredFoodFields = [
  "food_id",
  "name",
  "category",
  "diet_tags",
  "allergy_tags",
  "protein_g",
  "carbs_g",
  "fat_g",
  "calories",
  "meal_type"
];
const requiredMealFields = [
  "meal_id",
  "meal_name",
  "meal_type",
  "cuisine_style",
  "authenticity_level",
  "editorial_status",
  "recipe_version",
  "goal_tags",
  "diet_tags",
  "ingredients",
  "cooking_method",
  "recipe_specific_steps",
  "preparation_style",
  "primary_protein",
  "protein_family",
  "carb_base",
  "fat_source",
  "fiber_sources",
  "sodium_risk",
  "sodium_source_ids",
  "required_core_ingredients",
  "optional_ingredients",
  "required_spices",
  "scalable_ingredients",
  "non_scalable_ingredients",
  "min_serving_multiplier",
  "max_serving_multiplier",
  "min_practical_calories",
  "max_practical_calories",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "budget_level",
  "allergens",
  "avoid_tags",
  "approved_substitutions"
];
const recipeNameRequirements = [
  [/\begg(?:s|-white)?\b/i, /egg_/],
  [/\bchicken\b/i, /chicken_/],
  [/\bturkey\b/i, /turkey_/],
  [/\bbeef\b/i, /beef_/],
  [/\blamb\b/i, /lamb_/],
  [/\bsalmon\b/i, /salmon/],
  [/\btuna\b/i, /tuna_/],
  [/\bshrimp\b/i, /shrimp_/],
  [/\btofu\b/i, /tofu_/],
  [/\blentil\b/i, /lentils_/],
  [/\bchickpea\b/i, /chickpeas_/],
  [/\bhalloumi\b/i, /halloumi/],
  [/\blabneh\b/i, /labneh/],
  [/\bavocado\b/i, /avocado/],
  [/\bquinoa\b/i, /quinoa/],
  [/\bbulgur\b/i, /bulgur/],
  [/\bcouscous\b/i, /couscous/],
  [/\bpasta\b/i, /pasta_/],
  [/\bpotato\b/i, /potato/],
  [/\bspinach\b/i, /spinach/],
  [/\bmushroom\b/i, /mushrooms/],
  [/\bcucumber\b/i, /cucumber/],
  [/\btomato\b/i, /tomato/],
  [/\bbroccoli\b/i, /broccoli/],
  [/\bpepper\b/i, /bell_pepper/],
  [/\bza['’]?atar\b/i, /zaatar/]
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateUniqueIds(items, field, label) {
  const seen = new Set();

  for (const item of items) {
    assert(!seen.has(item[field]), `${label} has duplicate ${field}: ${item[field]}`);
    seen.add(item[field]);
  }
}

function validateArrayField(item, field, label) {
  assert(Array.isArray(item[field]), `${label} ${item.name} field ${field} must be an array`);
}

function validateExercises() {
  const exercises = readJson("data/exercise_library.json");
  assert(exercises.length > 0, "exercise_library.json must contain exercises");
  validateUniqueIds(exercises, "exercise_id", "exercise_library");

  for (const exercise of exercises) {
    for (const field of requiredExerciseFields) {
      assert(exercise[field] !== undefined, `Exercise ${exercise.exercise_id} missing ${field}`);
    }

    validateArrayField(exercise, "sub_muscles", "Exercise");
    validateArrayField(exercise, "equipment", "Exercise");
    validateArrayField(exercise, "allowed_places", "Exercise");
    validateArrayField(exercise, "contraindications", "Exercise");
    assert(Number.isInteger(exercise.exercise_id), `Exercise ${exercise.name} id must be an integer`);
    assert(exercise.name.trim(), `Exercise ${exercise.exercise_id} must have a name`);
  }

  return exercises.length;
}

function validateFoods() {
  const foods = readJson("data/food_library.json");
  const enrichedFoods = enrichFoodLibrary(foods);
  assert(foods.length > 0, "food_library.json must contain foods");
  validateUniqueIds(foods, "food_id", "food_library");

  for (const food of foods) {
    for (const field of requiredFoodFields) {
      assert(food[field] !== undefined, `Food ${food.food_id} missing ${field}`);
    }

    validateArrayField(food, "diet_tags", "Food");
    validateArrayField(food, "allergy_tags", "Food");
    validateArrayField(food, "meal_type", "Food");
    assert(Number.isInteger(food.food_id), `Food ${food.name} id must be an integer`);
    assert(food.calories > 0, `Food ${food.name} must have calories`);
    assert(food.protein_g >= 0 && food.carbs_g >= 0 && food.fat_g >= 0, `Food ${food.name} macros must be non-negative`);
  }

  for (const food of enrichedFoods) {
    for (const field of ["fiber_g", "serving_grams", "household_unit", "household_quantity", "halal_status", "grocery_category"]) {
      assert(food[field] !== undefined, `Enriched food ${food.food_id} missing ${field}`);
    }
    assert(food.halal_status === "halal", `Enriched food ${food.food_id} must be halal for Fitnet local library`);
  }

  return foods.length;
}

function validateIngredients() {
  const ingredients = readJson("data/ingredient_library.json");
  assert(ingredients.length > 0, "ingredient_library.json must contain ingredients");
  validateUniqueIds(ingredients, "ingredient_id", "ingredient_library");
  for (const ingredient of ingredients) {
    for (const field of ["ingredient_id", "name_en", "aliases", "category", "default_state", "nutrition_per_100g", "source", "allergens", "avoid_tags", "halal_status", "sodium_risk", "purchase_state", "purchase_multiplier", "purchase_conversion_reviewed", "grocery_category", "household_unit", "household_unit_grams", "verified_by_fitnet"]) {
      assert(ingredient[field] !== undefined, `Ingredient ${ingredient.ingredient_id} missing ${field}`);
    }
    assert(ingredient.verified_by_fitnet === true, `Ingredient ${ingredient.ingredient_id} is not Fitnet verified`);
    assert(["inherently_halal", "requires_halal_certified_source", "verified_halal_product"].includes(ingredient.halal_status), `Ingredient ${ingredient.ingredient_id} has invalid halal status`);
    assert(["low", "moderate", "high"].includes(ingredient.sodium_risk), `Ingredient ${ingredient.ingredient_id} has invalid sodium risk`);
    assert(ingredient.purchase_state && Number(ingredient.purchase_multiplier) > 0, `Ingredient ${ingredient.ingredient_id} has invalid purchase conversion`);
    assert(typeof ingredient.purchase_conversion_reviewed === "boolean", `Ingredient ${ingredient.ingredient_id} must declare whether its purchase conversion is reviewed`);
    assert(!/\b(pork|bacon|ham|lard|alcohol)\b/i.test(`${ingredient.ingredient_id} ${ingredient.name_en} ${(ingredient.avoid_tags || []).join(" ")}`), `Ingredient ${ingredient.ingredient_id} violates halal policy`);
    for (const key of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]) assert(Number.isFinite(Number(ingredient.nutrition_per_100g[key])), `Ingredient ${ingredient.ingredient_id} missing ${key}`);
  }
  return ingredients;
}

function validateMeals(ingredients) {
  const meals = readJson("data/meal_library.json");
  assert(meals.length > 0, "meal_library.json must contain meals");
  validateUniqueIds(meals, "meal_id", "meal_library");

  const counts = {};
  const ingredientLookup = new Map(ingredients.map((item) => [item.ingredient_id, item]));
  let middleEastern = 0;
  for (const meal of meals) {
    for (const field of requiredMealFields) {
      assert(meal[field] !== undefined, `Meal ${meal.meal_id} missing ${field}`);
    }
    validateArrayField(meal, "goal_tags", "Meal");
    validateArrayField(meal, "diet_tags", "Meal");
    validateArrayField(meal, "ingredients", "Meal");
    validateArrayField(meal, "recipe_specific_steps", "Meal");
    validateArrayField(meal, "fiber_sources", "Meal");
    validateArrayField(meal, "sodium_source_ids", "Meal");
    validateArrayField(meal, "required_core_ingredients", "Meal");
    validateArrayField(meal, "optional_ingredients", "Meal");
    validateArrayField(meal, "required_spices", "Meal");
    validateArrayField(meal, "scalable_ingredients", "Meal");
    validateArrayField(meal, "non_scalable_ingredients", "Meal");
    validateArrayField(meal, "allergens", "Meal");
    validateArrayField(meal, "avoid_tags", "Meal");
    validateArrayField(meal, "approved_substitutions", "Meal");
    assert(["breakfast", "lunch", "dinner", "snack"].includes(meal.meal_type), `Meal ${meal.meal_id} has invalid meal_type`);
    assert(meal.diet_tags.includes("halal"), `Meal ${meal.meal_id} must be halal`);
    assert(meal.editorial_status === "fitnet_reviewed", `Meal ${meal.meal_id} is not editorially reviewed`);
    assert(meal.recipe_version === "rich_recipe_library_v2", `Meal ${meal.meal_id} is not using the v2 recipe definition`);
    assert(["authentic", "inspired", "generic"].includes(meal.authenticity_level), `Meal ${meal.meal_id} has invalid authenticity_level`);
    assert(["low", "moderate", "high"].includes(meal.sodium_risk), `Meal ${meal.meal_id} has invalid sodium_risk`);
    assert(Array.isArray(meal.cooking_method) && meal.cooking_method.length >= 3 && meal.cooking_method.length <= 6, `Meal ${meal.meal_id} must have 3-6 cooking steps`);
    assert(JSON.stringify(meal.recipe_specific_steps) === JSON.stringify(meal.cooking_method), `Meal ${meal.meal_id} recipe steps do not match runtime cooking steps`);
    assert(!meal.cooking_method.some((step) => /cook or warm the main ingredients|arrange the ingredients in a bowl or snack box|season with the listed herbs and spices|chop or warm .* as appropriate/i.test(step)), `Meal ${meal.meal_id} still uses generic cooking instructions`);
    assert(!meal.cooking_method.some((step) => /warm the (plain greek yogurt|cottage cheese|labneh|smoked salmon|tuna)/i.test(step)), `Meal ${meal.meal_id} incorrectly warms a cold ingredient`);
    assert(meal.cooking_method.some((step) => step.toLowerCase().includes(meal.meal_name.toLowerCase()) || meal.ingredients.some((item) => step.toLowerCase().includes(item.name.toLowerCase()))), `Meal ${meal.meal_id} instructions are not recipe-specific`);
    assert(Number(meal.min_serving_multiplier) > 0 && Number(meal.max_serving_multiplier) >= Number(meal.min_serving_multiplier), `Meal ${meal.meal_id} has invalid serving multipliers`);
    assert(meal.calories > 0, `Meal ${meal.meal_id} must have calories`);
    assert(meal.protein_g >= 0 && meal.carbs_g >= 0 && meal.fat_g >= 0 && meal.fiber_g >= 0, `Meal ${meal.meal_id} macros must be non-negative`);
    for (const ingredient of meal.ingredients) {
      assert(ingredient.ingredient_id && ingredientLookup.has(ingredient.ingredient_id), `Meal ${meal.meal_id} has unknown ingredient_id ${ingredient.ingredient_id}`);
      assert(ingredient.name && ingredient.quantity_g > 0 && ingredient.household_quantity, `Meal ${meal.meal_id} has invalid ingredient`);
      assert(["primary_protein", "secondary_protein", "carb_base", "fat_source", "vegetable", "leafy_vegetable", "fruit", "legume", "sauce", "seasoning", "garnish"].includes(ingredient.ingredient_role), `Meal ${meal.meal_id} has invalid ingredient role`);
      assert(ingredient.household_quantity === portionPolicy.formatHouseholdQuantity(ingredient.quantity_g, ingredientLookup.get(ingredient.ingredient_id)), `Meal ${meal.meal_id} has inconsistent household quantity for ${ingredient.ingredient_id}`);
    }
    const mealIngredientIds = new Set(meal.ingredients.map((item) => item.ingredient_id));
    const joinedIngredientIds = [...mealIngredientIds].join(" ");
    for (const [namePattern, ingredientPattern] of recipeNameRequirements) {
      if (namePattern.test(meal.meal_name)) assert(ingredientPattern.test(joinedIngredientIds), `Meal ${meal.meal_id} name claims an ingredient it does not contain`);
    }
    for (const field of ["required_core_ingredients", "required_spices", "scalable_ingredients", "non_scalable_ingredients", "fiber_sources"]) {
      assert(meal[field].every((id) => mealIngredientIds.has(id)), `Meal ${meal.meal_id} has ${field} outside its ingredient list`);
    }
    assert(meal.sodium_source_ids.every((id) => mealIngredientIds.has(id) && ingredientLookup.get(id).sodium_risk !== "low"), `Meal ${meal.meal_id} has invalid sodium source metadata`);
    assert(mealIngredientIds.has(meal.primary_protein), `Meal ${meal.meal_id} primary_protein is not an ingredient`);
    assert(meal.ingredients.find((item) => item.ingredient_id === meal.primary_protein)?.ingredient_role === "primary_protein", `Meal ${meal.meal_id} primary protein role is inconsistent`);
    assert(meal.carb_base === null || mealIngredientIds.has(meal.carb_base), `Meal ${meal.meal_id} carb_base is not an ingredient`);
    assert(meal.fat_source === null || mealIngredientIds.has(meal.fat_source), `Meal ${meal.meal_id} fat_source is not an ingredient`);
    assert(meal.required_core_ingredients.length >= 2, `Meal ${meal.meal_id} needs at least two core ingredients`);
    assert(new Set([...meal.scalable_ingredients, ...meal.non_scalable_ingredients]).size === mealIngredientIds.size, `Meal ${meal.meal_id} scaling metadata does not cover every ingredient`);
    assert(meal.ingredients.filter((item) => meal.scalable_ingredients.includes(item.ingredient_id)).every((item) => !["seasoning", "sauce", "garnish"].includes(item.ingredient_role)), `Meal ${meal.meal_id} scales a finishing ingredient`);
    if (/shawarma/i.test(meal.meal_name)) assert(meal.required_spices.includes("shawarma_spice"), `Meal ${meal.meal_id} shawarma identity is unsupported`);
    if (/kofta|kafta/i.test(meal.meal_name)) assert(meal.required_spices.includes("kofta_spice"), `Meal ${meal.meal_id} kofta identity is unsupported`);
    if (/kabsa/i.test(meal.meal_name)) assert(meal.required_spices.includes("kabsa_spice"), `Meal ${meal.meal_id} kabsa identity is unsupported`);
    assert(!/molokhia|freekeh|harra|sayadiya|musakhan/i.test(meal.meal_name), `Meal ${meal.meal_id} claims an unsupported recipe identity`);
    const calculated = calculateMealNutrition(meal.ingredients, ingredientLookup);
    for (const key of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]) assert(Math.abs(Number(meal[key]) - Number(calculated[key])) <= 2, `Meal ${meal.meal_id} ${key} is not ingredient-calculated`);
    if (meal.meal_type === "breakfast") {
      assert(meal.suitable_for_breakfast === true, `Breakfast ${meal.meal_id} must be suitable_for_breakfast`);
      assert(meal.savory_breakfast === true, `Breakfast ${meal.meal_id} must be savory`);
      assert(meal.contains_sweet_food === false, `Breakfast ${meal.meal_id} must not contain sweet food`);
      assert(meal.contains_breakfast_carbs === false, `Breakfast ${meal.meal_id} must not contain a carbohydrate base`);
      assert(meal.carb_base === null, `Breakfast ${meal.meal_id} must not define a carbohydrate base`);
      assert(meal.ingredients.every((item) => !["carb_base", "fruit", "legume"].includes(item.ingredient_role)), `Breakfast ${meal.meal_id} contains a restricted carbohydrate or fruit`);
      assert(meal.calories <= portionPolicy.mealCalorieLimit("breakfast"), `Breakfast ${meal.meal_id} exceeds the calorie cap`);
    }
    counts[meal.meal_type] = (counts[meal.meal_type] || 0) + 1;
    if (meal.cuisine_style === "Middle Eastern") middleEastern += 1;
  }

  for (const type of ["breakfast", "lunch", "dinner", "snack"]) {
    assert((counts[type] || 0) === 25, `meal_library.json needs exactly 25 ${type} meals`);
  }
  assert(meals.length === 100, `meal_library.json needs exactly 100 meals, received ${meals.length}`);
  assert(middleEastern === 40, `meal_library.json needs exactly 40 Middle Eastern meals, received ${middleEastern}`);

  return meals.length;
}

try {
  const exerciseCount = validateExercises();
  const foodCount = validateFoods();
  const ingredients = validateIngredients();
  const mealCount = validateMeals(ingredients);
  console.log(`Validated ${exerciseCount} exercises, ${foodCount} foods, ${ingredients.length} ingredients, and ${mealCount} meals`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
