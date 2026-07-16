const fs = require("fs");
const path = require("path");
const portionPolicy = require("../lib/nutrition-portion-policy");

const root = path.join(__dirname, "..");

function ingredient(id, name, category, state, calories, protein, carbs, fat, fiber, options = {}) {
  return {
    ingredient_id: id,
    name_en: name,
    aliases: options.aliases || [],
    category,
    default_state: state,
    nutrition_per_100g: {
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: fiber,
      sugar_g: options.sugar_g || 0,
      sodium_mg: options.sodium_mg || 0
    },
    source: options.source || {
      type: "fitnet_curated_reference",
      external_id: null,
      source_name: "Fitnet reviewed standard food reference"
    },
    allergens: options.allergens || [],
    avoid_tags: options.avoid_tags || [],
    diet_tags: options.diet_tags || [],
    halal_status: options.halal_status || "inherently_halal",
    sodium_risk: options.sodium_risk || (Number(options.sodium_mg || 0) >= 600 ? "high" : Number(options.sodium_mg || 0) >= 200 ? "moderate" : "low"),
    purchase_state: options.purchase_state || state,
    purchase_multiplier: Number(options.purchase_multiplier || 1),
    purchase_conversion_reviewed: Number(options.purchase_multiplier || 1) !== 1,
    grocery_category: options.grocery_category || category,
    household_unit: options.household_unit || "serving",
    household_unit_grams: options.household_unit_grams || 100,
    verified_by_fitnet: true,
    notes: options.notes || "Nutrition values use the listed preparation state."
  };
}

const meat = { halal_status: "requires_halal_certified_source", grocery_category: "Protein", household_unit: "fillet", household_unit_grams: 170, purchase_state: "raw", purchase_multiplier: 1.33 };
const dairy = { allergens: ["dairy"], grocery_category: "Dairy", household_unit: "cup", household_unit_grams: 240 };
const fish = { allergens: ["fish"], grocery_category: "Protein", household_unit: "fillet", household_unit_grams: 170, purchase_state: "raw", purchase_multiplier: 1.25 };
const gluten = { allergens: ["gluten"], grocery_category: "Carbohydrates", household_unit: "cup", household_unit_grams: 180 };
const ingredients = [
  ingredient("egg_whole_cooked", "Cooked eggs", "Protein", "cooked", 155, 13, 1.1, 11, 0, { allergens: ["egg"], aliases: ["eggs", "boiled eggs"], grocery_category: "Protein", household_unit: "egg", household_unit_grams: 50, purchase_state: "raw" }),
  ingredient("egg_white_cooked", "Cooked egg whites", "Protein", "cooked", 52, 11, 0.7, 0.2, 0, { allergens: ["egg"], aliases: ["egg whites"], grocery_category: "Protein", household_unit: "egg white", household_unit_grams: 33, purchase_state: "raw" }),
  ingredient("chicken_breast_cooked", "Halal chicken breast", "Protein", "cooked", 165, 31, 0, 3.6, 0, { ...meat, aliases: ["chicken breast", "cooked chicken breast"] }),
  ingredient("chicken_thigh_cooked", "Halal chicken thigh", "Protein", "cooked", 209, 26, 0, 10.9, 0, meat),
  ingredient("turkey_breast_cooked", "Halal turkey breast", "Protein", "cooked", 147, 30, 0, 2.1, 0, { ...meat, aliases: ["turkey slices", "turkey breast"] }),
  ingredient("beef_lean_cooked", "Halal lean beef", "Protein", "cooked", 217, 27, 0, 11.8, 0, { ...meat, aliases: ["lean beef steak", "lean beef strips", "lean beef mince", "lean beef kofta"], avoid_tags: ["red_meat"] }),
  ingredient("lamb_lean_cooked", "Halal lean lamb", "Protein", "cooked", 206, 28, 0, 9.2, 0, { ...meat, avoid_tags: ["red_meat"] }),
  ingredient("salmon_cooked", "Cooked salmon", "Protein", "cooked", 206, 22, 0, 12, 0, fish),
  ingredient("smoked_salmon", "Smoked salmon", "Protein", "ready_to_eat", 117, 18, 0, 4.3, 0, { ...fish, household_unit: "slice", household_unit_grams: 30, sodium_mg: 670, sodium_risk: "high", purchase_state: "ready_to_eat", purchase_multiplier: 1 }),
  ingredient("tuna_water_drained", "Tuna in water", "Protein", "drained", 116, 26, 0, 0.8, 0, { ...fish, aliases: ["tuna in water"], household_unit: "can", household_unit_grams: 130, sodium_risk: "moderate", purchase_state: "packaged", purchase_multiplier: 1 }),
  ingredient("white_fish_cooked", "Cooked white fish", "Protein", "cooked", 128, 26, 0, 2.7, 0, fish),
  ingredient("shrimp_cooked", "Cooked shrimp", "Protein", "cooked", 99, 24, 0.2, 0.3, 0, { allergens: ["shellfish"], grocery_category: "Protein", household_unit: "cup", household_unit_grams: 150, purchase_state: "raw", purchase_multiplier: 1.2 }),
  ingredient("tofu_firm", "Firm tofu", "Protein", "ready_to_cook", 144, 17, 2.8, 8.7, 2.3, { allergens: ["soy"], diet_tags: ["vegetarian"], grocery_category: "Protein", household_unit: "block", household_unit_grams: 300 }),
  ingredient("lentils_cooked", "Cooked lentils", "Protein", "cooked", 116, 9, 20, 0.4, 7.9, { diet_tags: ["vegetarian"], grocery_category: "Carbohydrates", household_unit: "cup", household_unit_grams: 198, purchase_state: "dry", purchase_multiplier: 0.4 }),
  ingredient("chickpeas_cooked", "Cooked chickpeas", "Protein", "cooked", 164, 8.9, 27.4, 2.6, 7.6, { diet_tags: ["vegetarian"], grocery_category: "Carbohydrates", household_unit: "cup", household_unit_grams: 164, purchase_state: "dry", purchase_multiplier: 0.4 }),
  ingredient("greek_yogurt_plain", "Plain Greek yogurt", "Protein", "ready_to_eat", 73, 10, 3.9, 1.9, 0, dairy),
  ingredient("cottage_cheese", "Cottage cheese", "Protein", "ready_to_eat", 98, 11.1, 3.4, 4.3, 0, { ...dairy, sodium_risk: "moderate" }),
  ingredient("labneh", "Labneh", "Protein", "ready_to_eat", 152, 9, 6, 10, 0, { ...dairy, household_unit: "tablespoon", household_unit_grams: 15, sodium_risk: "moderate" }),
  ingredient("halloumi", "Halal halloumi", "Protein", "ready_to_cook", 321, 21, 2.2, 25, 0, { ...dairy, halal_status: "requires_halal_certified_source", household_unit: "slice", household_unit_grams: 30, sodium_risk: "high" }),
  ingredient("whey_halal", "Halal whey protein", "Protein", "powder", 375, 75, 9, 6, 0, { allergens: ["dairy"], halal_status: "requires_halal_certified_source", grocery_category: "Protein", household_unit: "scoop", household_unit_grams: 32 }),
  ingredient("rice_brown_cooked", "Cooked brown rice", "Carbohydrates", "cooked", 123, 2.7, 25.6, 1, 1.6, { household_unit: "cup", household_unit_grams: 195, purchase_state: "dry", purchase_multiplier: 0.35 }),
  ingredient("rice_basmati_cooked", "Cooked basmati rice", "Carbohydrates", "cooked", 130, 2.7, 28, 0.3, 0.4, { aliases: ["cooked rice"], household_unit: "cup", household_unit_grams: 186, purchase_state: "dry", purchase_multiplier: 0.35 }),
  ingredient("quinoa_cooked", "Cooked quinoa", "Carbohydrates", "cooked", 120, 4.4, 21.3, 1.9, 2.8, { household_unit: "cup", household_unit_grams: 185, purchase_state: "dry", purchase_multiplier: 0.33 }),
  ingredient("bulgur_cooked", "Cooked bulgur", "Carbohydrates", "cooked", 83, 3.1, 18.6, 0.2, 4.5, { ...gluten, purchase_state: "dry", purchase_multiplier: 0.34 }),
  ingredient("couscous_cooked", "Cooked couscous", "Carbohydrates", "cooked", 112, 3.8, 23.2, 0.2, 1.4, { ...gluten, purchase_state: "dry", purchase_multiplier: 0.4 }),
  ingredient("pasta_wholewheat_cooked", "Cooked whole-wheat pasta", "Carbohydrates", "cooked", 149, 6, 30, 1.7, 3.9, { ...gluten, household_unit_grams: 140, purchase_state: "dry", purchase_multiplier: 0.45 }),
  ingredient("potato_roasted", "Roasted potatoes", "Carbohydrates", "cooked", 149, 2.5, 25, 4.8, 2.2, { household_unit: "cup", household_unit_grams: 150, purchase_state: "raw", purchase_multiplier: 1.1 }),
  ingredient("sweet_potato_cooked", "Cooked sweet potato", "Carbohydrates", "cooked", 90, 2, 20.7, 0.2, 3.3, { household_unit: "medium potato", household_unit_grams: 180, purchase_state: "raw", purchase_multiplier: 1.1 }),
  ingredient("corn_tortilla", "Corn tortilla", "Carbohydrates", "ready_to_eat", 218, 5.7, 44.6, 2.9, 6.3, { household_unit: "tortilla", household_unit_grams: 28 }),
  ingredient("pita_wholewheat", "Whole-wheat pita", "Carbohydrates", "ready_to_eat", 266, 9.8, 55, 2.6, 7.4, { ...gluten, household_unit: "pita", household_unit_grams: 60 }),
  ingredient("cucumber", "Cucumber", "Vegetables", "raw", 15, 0.7, 3.6, 0.1, 0.5, { aliases: ["cucumber rounds", "cucumber sticks"], household_unit: "small cucumber", household_unit_grams: 100 }),
  ingredient("tomato", "Tomato", "Vegetables", "raw", 18, 0.9, 3.9, 0.2, 1.2, { aliases: ["cherry tomatoes"], household_unit: "medium tomato", household_unit_grams: 123 }),
  ingredient("spinach", "Spinach", "Vegetables", "raw", 23, 2.9, 3.6, 0.4, 2.2, { household_unit: "cup", household_unit_grams: 30 }),
  ingredient("lettuce", "Lettuce", "Vegetables", "raw", 15, 1.4, 2.9, 0.2, 1.3, { aliases: ["lettuce leaves", "lettuce cups", "romaine lettuce"], household_unit: "cup", household_unit_grams: 47 }),
  ingredient("mushrooms", "Mushrooms", "Vegetables", "raw", 22, 3.1, 3.3, 0.3, 1, { household_unit: "cup", household_unit_grams: 70 }),
  ingredient("broccoli", "Broccoli", "Vegetables", "cooked", 35, 2.4, 7.2, 0.4, 3.3, { household_unit: "cup", household_unit_grams: 156 }),
  ingredient("zucchini", "Zucchini", "Vegetables", "cooked", 17, 1.2, 3.1, 0.3, 1, { household_unit: "cup", household_unit_grams: 180 }),
  ingredient("bell_pepper", "Bell pepper", "Vegetables", "raw", 31, 1, 6, 0.3, 2.1, { aliases: ["bell peppers"], household_unit: "pepper", household_unit_grams: 120 }),
  ingredient("onion", "Onion", "Vegetables", "raw", 40, 1.1, 9.3, 0.1, 1.7, { household_unit: "small onion", household_unit_grams: 70 }),
  ingredient("green_beans", "Green beans", "Vegetables", "cooked", 35, 1.9, 7.9, 0.3, 3.2, { household_unit: "cup", household_unit_grams: 125 }),
  ingredient("cauliflower", "Cauliflower", "Vegetables", "cooked", 23, 1.8, 4.1, 0.5, 2.3, { household_unit: "cup", household_unit_grams: 124 }),
  ingredient("eggplant", "Eggplant", "Vegetables", "cooked", 35, 0.8, 8.7, 0.2, 2.5, { household_unit: "cup", household_unit_grams: 99 }),
  ingredient("carrot", "Carrot", "Vegetables", "raw", 41, 0.9, 9.6, 0.2, 2.8, { household_unit: "medium carrot", household_unit_grams: 61 }),
  ingredient("mixed_vegetables", "Mixed vegetables", "Vegetables", "cooked", 65, 3, 12, 0.5, 4, { aliases: ["grilled vegetables", "stir-fry vegetables", "zucchini and peppers"], household_unit: "cup", household_unit_grams: 160 }),
  ingredient("mixed_salad", "Mixed salad", "Vegetables", "raw", 25, 1.2, 4.5, 0.3, 2, { aliases: ["side salad", "cucumber tomato salad", "leafy greens"], household_unit: "cup", household_unit_grams: 100 }),
  ingredient("avocado", "Avocado", "Fats", "raw", 160, 2, 8.5, 14.7, 6.7, { household_unit: "avocado", household_unit_grams: 150 }),
  ingredient("olive_oil", "Olive oil", "Fats", "ready_to_use", 884, 0, 0, 100, 0, { household_unit: "tablespoon", household_unit_grams: 14 }),
  ingredient("almonds", "Almonds", "Fats", "ready_to_eat", 579, 21.2, 21.6, 49.9, 12.5, { allergens: ["nuts"], household_unit: "small handful", household_unit_grams: 28 }),
  ingredient("walnuts", "Walnuts", "Fats", "ready_to_eat", 654, 15.2, 13.7, 65.2, 6.7, { allergens: ["nuts"], household_unit: "small handful", household_unit_grams: 28 }),
  ingredient("tahini", "Tahini", "Fats", "ready_to_use", 595, 17, 21, 54, 9.3, { allergens: ["sesame"], household_unit: "tablespoon", household_unit_grams: 15 }),
  ingredient("hummus", "Hummus", "Fats", "ready_to_eat", 166, 7.9, 14.3, 9.6, 6, { allergens: ["sesame"], diet_tags: ["vegetarian"], household_unit: "tablespoon", household_unit_grams: 15, sodium_risk: "moderate" }),
  ingredient("tomato_sauce", "Tomato sauce", "Pantry", "cooked", 38, 1.4, 7.3, 0.4, 1.5, { household_unit: "cup", household_unit_grams: 245, sodium_risk: "moderate" }),
  ingredient("yogurt_cucumber_sauce", "Yogurt cucumber sauce", "Dairy", "ready_to_use", 75, 4.5, 5, 4, 0.3, { ...dairy, household_unit: "tablespoon", household_unit_grams: 15, sodium_risk: "moderate" }),
  ingredient("soy_free_stir_sauce", "Soy-free stir-fry sauce", "Pantry", "ready_to_use", 80, 1, 14, 2, 0.5, { household_unit: "tablespoon", household_unit_grams: 15, sodium_risk: "high" }),
  ingredient("light_caesar_dressing", "Light Caesar dressing", "Dairy", "ready_to_use", 180, 3, 10, 14, 0, { allergens: ["dairy", "egg"], household_unit: "tablespoon", household_unit_grams: 15, sodium_risk: "high" }),
  ingredient("lemon_juice", "Lemon juice", "Pantry", "raw", 22, 0.4, 6.9, 0.2, 0.3, { household_unit: "tablespoon", household_unit_grams: 15 }),
  ingredient("zaatar", "Za'atar", "Pantry", "dry", 250, 10, 35, 12, 20, { allergens: ["sesame"], household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("herbs_spices", "Herbs and spices", "Pantry", "dry", 100, 4, 18, 2, 8, { aliases: ["seasoning"], household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("garlic", "Garlic", "Pantry", "raw", 149, 6.4, 33.1, 0.5, 2.1, { household_unit: "clove", household_unit_grams: 3 }),
  ingredient("ground_cumin", "Ground cumin", "Pantry", "dry", 375, 17.8, 44.2, 22.3, 10.5, { household_unit: "teaspoon", household_unit_grams: 2 }),
  ingredient("paprika", "Paprika", "Pantry", "dry", 282, 14.1, 54, 12.9, 34.9, { household_unit: "teaspoon", household_unit_grams: 2 }),
  ingredient("black_pepper", "Black pepper", "Pantry", "dry", 251, 10.4, 64, 3.3, 25.3, { household_unit: "teaspoon", household_unit_grams: 2 }),
  ingredient("parsley", "Fresh parsley", "Pantry", "raw", 36, 3, 6.3, 0.8, 3.3, { household_unit: "tablespoon", household_unit_grams: 4 }),
  ingredient("mint", "Fresh mint", "Pantry", "raw", 44, 3.3, 8.4, 0.7, 6.8, { household_unit: "tablespoon", household_unit_grams: 3 }),
  ingredient("shawarma_spice", "Shawarma spice blend", "Pantry", "dry", 100, 4, 18, 2, 8, { household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("kofta_spice", "Kofta spice blend", "Pantry", "dry", 100, 4, 18, 2, 8, { household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("kabsa_spice", "Kabsa spice blend", "Pantry", "dry", 100, 4, 18, 2, 8, { household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("fajita_spice", "Fajita spice blend", "Pantry", "dry", 100, 4, 18, 2, 8, { household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("italian_herbs", "Italian herb blend", "Pantry", "dry", 100, 4, 18, 2, 8, { household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("cumin_coriander_spice", "Cumin and coriander blend", "Pantry", "dry", 100, 4, 18, 2, 8, { household_unit: "teaspoon", household_unit_grams: 3 }),
  ingredient("berries", "Mixed berries", "Fruit", "raw", 50, 0.7, 12, 0.3, 4, { household_unit: "cup", household_unit_grams: 140 }),
  ingredient("apple", "Apple", "Fruit", "raw", 52, 0.3, 13.8, 0.2, 2.4, { household_unit: "medium apple", household_unit_grams: 182 }),
  ingredient("banana", "Banana", "Fruit", "raw", 89, 1.1, 22.8, 0.3, 2.6, { household_unit: "medium banana", household_unit_grams: 118 }),
  ingredient("dates", "Dates", "Fruit", "dried", 282, 2.5, 75, 0.4, 8, { household_unit: "date", household_unit_grams: 8 }),
  ingredient("pickles", "Pickles", "Vegetables", "ready_to_eat", 12, 0.5, 2.4, 0.3, 1, { household_unit: "spear", household_unit_grams: 35, sodium_mg: 800, sodium_risk: "high" })
];

const ingredientById = new Map(ingredients.map((item) => [item.ingredient_id, item]));
const M = "Middle Eastern";

const breakfastBlueprints = [
  ["Spinach Egg Tomato Skillet", M, "egg_whole_cooked", null, "spinach", "tomato"],
  ["Turkey Labneh Cucumber Plate", M, "turkey_breast_cooked", null, "cucumber", "labneh"],
  ["Halloumi Egg Tomato Skillet", M, "egg_whole_cooked", null, "tomato", "halloumi"],
  ["Za'atar Cottage Cheese Cucumber Bowl", M, "cottage_cheese", null, "cucumber", "zaatar"],
  ["Spiced Beef Tomato Tahini Plate", M, "beef_lean_cooked", null, "tomato", "tahini"],
  ["Chicken Labneh Avocado Plate", M, "chicken_breast_cooked", null, "cucumber", "labneh", "avocado"],
  ["Tuna Tahini Morning Plate", M, "tuna_water_drained", null, "tomato", "tahini"],
  ["Mushroom Egg-White Tomato Skillet", M, "egg_white_cooked", null, "mushrooms", "tomato"],
  ["Egg Spinach Pepper Scramble", M, "egg_whole_cooked", null, "spinach", "bell_pepper"],
  ["Smoked Salmon Labneh Plate", M, "smoked_salmon", null, "cucumber", "labneh"],
  ["Turkey Avocado Cucumber Plate", "American", "turkey_breast_cooked", null, "cucumber", "avocado"],
  ["Mushroom Spinach Omelet", "European", "egg_whole_cooked", null, "mushrooms", "spinach"],
  ["Savory Cottage Cheese Cucumber Bowl", "European", "cottage_cheese", null, "cucumber", "tomato"],
  ["Chicken Egg Breakfast Skillet", "American", "chicken_breast_cooked", null, "bell_pepper", "egg_whole_cooked"],
  ["Tuna Avocado Lettuce Cups", "International", "tuna_water_drained", null, "lettuce", "avocado"],
  ["Tofu Mushroom Spinach Skillet", "Asian", "tofu_firm", null, "mushrooms", "spinach"],
  ["Salmon Egg Breakfast Plate", "Nordic", "salmon_cooked", null, "cucumber", "egg_whole_cooked"],
  ["Herbed Greek Yogurt Cucumber Bowl", "Greek", "greek_yogurt_plain", null, "cucumber", "herbs_spices"],
  ["Turkey Mushroom Egg-White Skillet", "American", "turkey_breast_cooked", null, "mushrooms", "egg_white_cooked"],
  ["Halloumi Avocado Tomato Plate", "Mediterranean", "halloumi", null, "tomato", "avocado"],
  ["Chicken Spinach Breakfast Bowl", "International", "chicken_breast_cooked", null, "spinach", "tomato"],
  ["Egg Cottage Cheese Pepper Bowl", "European", "egg_whole_cooked", null, "bell_pepper", "cottage_cheese"],
  ["Smoked Salmon Avocado Cups", "Nordic", "smoked_salmon", null, "lettuce", "avocado"],
  ["Herbed Tofu Cucumber Avocado Plate", "Asian", "tofu_firm", null, "cucumber", "avocado"],
  ["Beef Spinach Breakfast Skillet", "International", "beef_lean_cooked", null, "spinach", "tomato"]
];

const lunchBlueprints = [
  ["Chicken Chickpea Shawarma Rice Bowl", M, "chicken_breast_cooked", "rice_basmati_cooked", "chickpeas_cooked", "mixed_salad", "tahini"],
  ["Lean Beef Kofta Bulgur Bowl", M, "beef_lean_cooked", "bulgur_cooked", "tomato", "yogurt_cucumber_sauce"],
  ["Lemon Salmon Salad Bowl", M, "salmon_cooked", null, "mixed_salad", "lemon_juice"],
  ["Spiced Chicken Avocado Salad Bowl", M, "chicken_breast_cooked", null, "mixed_salad", "avocado"],
  ["Spiced Lentil Rice Bowl", M, "lentils_cooked", "rice_basmati_cooked", "onion", "greek_yogurt_plain"],
  ["Spiced Turkey Quinoa Bowl", M, "turkey_breast_cooked", "quinoa_cooked", "mixed_salad", "tahini"],
  ["Lemon Shrimp Onion Rice", M, "shrimp_cooked", "rice_basmati_cooked", "onion", "lemon_juice"],
  ["Herbed Chicken Bulgur Bowl", M, "chicken_breast_cooked", "bulgur_cooked", "mixed_vegetables", "herbs_spices"],
  ["Halloumi Chickpea Salad", M, "halloumi", "chickpeas_cooked", "mixed_salad", "lemon_juice"],
  ["Tuna Hummus Corn-Tortilla Plate", M, "tuna_water_drained", "corn_tortilla", "mixed_salad", "hummus"],
  ["Soy-Free Chicken Stir-Fry Rice Bowl", "Asian", "chicken_breast_cooked", "rice_brown_cooked", "broccoli", "soy_free_stir_sauce"],
  ["Mediterranean Salmon Quinoa Salad", "Mediterranean", "salmon_cooked", "quinoa_cooked", "mixed_salad", "lemon_juice"],
  ["Lean Beef Sweet Potato Bowl", "American", "beef_lean_cooked", "sweet_potato_cooked", "green_beans", "herbs_spices"],
  ["Turkey Pasta Primavera", "Italian", "turkey_breast_cooked", "pasta_wholewheat_cooked", "mixed_vegetables", "tomato_sauce"],
  ["Greek Chicken Couscous Bowl", "Greek", "chicken_breast_cooked", "couscous_cooked", "cucumber", "yogurt_cucumber_sauce"],
  ["Tofu Chickpea Quinoa Bowl", "International", "tofu_firm", "quinoa_cooked", "chickpeas_cooked", "mixed_vegetables", "lemon_juice"],
  ["Shrimp Brown Rice Stir-Fry", "Asian", "shrimp_cooked", "rice_brown_cooked", "mixed_vegetables", "soy_free_stir_sauce"],
  ["Chicken Caesar Potato Bowl", "American", "chicken_breast_cooked", "potato_roasted", "lettuce", "light_caesar_dressing"],
  ["Tuna Sweet Potato Salad", "International", "tuna_water_drained", "sweet_potato_cooked", "mixed_salad", "lemon_juice"],
  ["White Fish Tomato Rice Bowl", "Mediterranean", "white_fish_cooked", "rice_basmati_cooked", "tomato", "herbs_spices"],
  ["Turkey Avocado Quinoa Salad", "International", "turkey_breast_cooked", "quinoa_cooked", "mixed_salad", "avocado"],
  ["Lentil Roasted Vegetable Bowl", "Mediterranean", "lentils_cooked", null, "mixed_vegetables", "tahini"],
  ["Beef Broccoli Brown Rice", "Asian", "beef_lean_cooked", "rice_brown_cooked", "broccoli", "soy_free_stir_sauce"],
  ["Salmon Potato Green Bean Plate", "European", "salmon_cooked", "potato_roasted", "green_beans", "lemon_juice"],
  ["Chicken Avocado Corn Tacos", "Mexican", "chicken_breast_cooked", "corn_tortilla", "lettuce", "avocado"]
];

const dinnerBlueprints = [
  ["Grilled Chicken Cauliflower Tahini Plate", M, "chicken_breast_cooked", null, "cauliflower", "tahini"],
  ["Spiced Lamb Roasted Potato Plate", M, "lamb_lean_cooked", "potato_roasted", "tomato", "yogurt_cucumber_sauce"],
  ["Baked Fish Pepper Tahini Plate", M, "white_fish_cooked", null, "bell_pepper", "tahini"],
  ["Chicken Kabsa-Inspired Bowl", M, "chicken_thigh_cooked", "rice_basmati_cooked", "mixed_vegetables", "herbs_spices"],
  ["Beef Shawarma Quinoa Plate", M, "beef_lean_cooked", "quinoa_cooked", "mixed_salad", "tahini"],
  ["Lentil Eggplant Tomato Bowl", M, "lentils_cooked", null, "eggplant", "tomato_sauce"],
  ["Spiced Turkey Couscous Plate", M, "turkey_breast_cooked", "couscous_cooked", "mixed_salad", "yogurt_cucumber_sauce"],
  ["Salmon Tahini Green Bean Plate", M, "salmon_cooked", "sweet_potato_cooked", "green_beans", "tahini"],
  ["Lemon Chicken Spinach Rice", M, "chicken_breast_cooked", "rice_basmati_cooked", "spinach", "lemon_juice"],
  ["Chickpea Halloumi Vegetable Bake", M, "chickpeas_cooked", null, "mixed_vegetables", "halloumi"],
  ["Herb Salmon Sweet Potato Plate", "Nordic", "salmon_cooked", "sweet_potato_cooked", "broccoli", "lemon_juice"],
  ["Chicken Tomato Whole-Wheat Pasta", "Italian", "chicken_breast_cooked", "pasta_wholewheat_cooked", "zucchini", "tomato_sauce"],
  ["Lean Beef Mushroom Rice Bowl", "International", "beef_lean_cooked", "rice_brown_cooked", "mushrooms", "herbs_spices"],
  ["Shrimp Quinoa Vegetable Skillet", "Mediterranean", "shrimp_cooked", "quinoa_cooked", "mixed_vegetables", "lemon_juice"],
  ["Turkey Tomato Pepper Rice Bowl", "European", "turkey_breast_cooked", "rice_basmati_cooked", "bell_pepper", "tomato_sauce"],
  ["Tofu Lentil Brown Rice Bowl", "Asian", "tofu_firm", "rice_brown_cooked", "lentils_cooked", "broccoli", "soy_free_stir_sauce"],
  ["White Fish Potato Tray Bake", "European", "white_fish_cooked", "potato_roasted", "green_beans", "lemon_juice"],
  ["Chicken Fajita Corn-Tortilla Plate", "Mexican", "chicken_breast_cooked", "corn_tortilla", "bell_pepper", "avocado"],
  ["Beef Bolognese Whole-Wheat Pasta", "Italian", "beef_lean_cooked", "pasta_wholewheat_cooked", "tomato", "tomato_sauce"],
  ["Salmon Cauliflower Herb Bowl", "International", "salmon_cooked", null, "cauliflower", "lemon_juice"],
  ["Turkey Sweet Potato Green Bean Plate", "American", "turkey_breast_cooked", "sweet_potato_cooked", "green_beans", "herbs_spices"],
  ["Chicken Mediterranean Couscous", "Mediterranean", "chicken_breast_cooked", "couscous_cooked", "mixed_vegetables", "lemon_juice"],
  ["Lentil Tomato Quinoa Bowl", "International", "lentils_cooked", "quinoa_cooked", "spinach", "tomato_sauce"],
  ["Shrimp Avocado Rice Bowl", "International", "shrimp_cooked", "rice_basmati_cooked", "cucumber", "avocado"],
  ["Beef Roasted Vegetable Potato Plate", "European", "beef_lean_cooked", "potato_roasted", "mixed_vegetables", "herbs_spices"]
];

const snackBlueprints = [
  ["Labneh Cucumber Za'atar Cup", M, "labneh", "cucumber", "zaatar"],
  ["Hummus Cucumber Crunch Cup", M, "hummus", "cucumber", "bell_pepper"],
  ["Halloumi Tomato Bites", M, "halloumi", "tomato", "herbs_spices"],
  ["Turkey Labneh Avocado Roll-Ups", M, "turkey_breast_cooked", "labneh", "cucumber", "avocado"],
  ["Tuna Tahini Cucumber Cups", M, "tuna_water_drained", "tahini", "cucumber"],
  ["Egg Za'atar Tomato Plate", M, "egg_whole_cooked", "tomato", "zaatar"],
  ["Chickpea Tahini Snack Bowl", M, "chickpeas_cooked", "tahini", "cucumber"],
  ["Smoked Salmon Labneh Bites", M, "smoked_salmon", "labneh", "cucumber"],
  ["Chicken Hummus Lettuce Cups", M, "chicken_breast_cooked", "hummus", "lettuce"],
  ["Cottage Cheese Za'atar Bowl", M, "cottage_cheese", "zaatar", "cucumber"],
  ["Greek Yogurt Berry Cup", "Greek", "greek_yogurt_plain", "berries", "almonds"],
  ["Cottage Cheese Apple Bowl", "European", "cottage_cheese", "apple", "walnuts"],
  ["Turkey Avocado Roll-Ups", "American", "turkey_breast_cooked", "avocado", "lettuce"],
  ["Tuna Cucumber Snack Box", "International", "tuna_water_drained", "cucumber", "pickles"],
  ["Whey Berry Yogurt Cup", "International", "whey_halal", "greek_yogurt_plain", "berries"],
  ["Egg Avocado Snack Plate", "American", "egg_whole_cooked", "avocado", "tomato"],
  ["Almond Date Protein Pair", "International", "almonds", "dates", "whey_halal"],
  ["Chicken Cucumber Snack Box", "International", "chicken_breast_cooked", "cucumber", "yogurt_cucumber_sauce"],
  ["Tofu Pepper Snack Bowl", "Asian", "tofu_firm", "bell_pepper", "soy_free_stir_sauce"],
  ["Smoked Salmon Avocado Bites", "Nordic", "smoked_salmon", "avocado", "cucumber"],
  ["Greek Yogurt Banana Protein Cup", "International", "greek_yogurt_plain", "banana", "whey_halal"],
  ["Cottage Cheese Berry Cup", "European", "cottage_cheese", "berries", "almonds"],
  ["Turkey Tomato Lettuce Cups", "International", "turkey_breast_cooked", "tomato", "lettuce"],
  ["Hummus Vegetable Snack Box", "Mediterranean", "hummus", "carrot", "cucumber"],
  ["Whey Apple Almond Shake Bowl", "International", "whey_halal", "apple", "almonds"]
];

const proteinFamilies = {
  egg_whole_cooked: "eggs",
  egg_white_cooked: "eggs",
  chicken_breast_cooked: "poultry",
  chicken_thigh_cooked: "poultry",
  turkey_breast_cooked: "poultry",
  beef_lean_cooked: "beef",
  lamb_lean_cooked: "lamb",
  salmon_cooked: "fish",
  smoked_salmon: "fish",
  tuna_water_drained: "fish",
  white_fish_cooked: "fish",
  shrimp_cooked: "seafood",
  tofu_firm: "plant_based",
  lentils_cooked: "legumes",
  chickpeas_cooked: "legumes",
  greek_yogurt_plain: "dairy",
  cottage_cheese: "dairy",
  labneh: "dairy",
  halloumi: "dairy",
  whey_halal: "dairy"
};
const nonScalableSauces = new Set([
  "tomato_sauce", "yogurt_cucumber_sauce", "soy_free_stir_sauce",
  "light_caesar_dressing", "lemon_juice"
]);
const seasoningIngredientIds = new Set([
  "zaatar", "herbs_spices", "shawarma_spice", "kofta_spice", "kabsa_spice",
  "fajita_spice", "italian_herbs", "cumin_coriander_spice", "garlic",
  "ground_cumin", "paprika", "black_pepper", "parsley", "mint"
]);

function ingredientRole(id, primaryProtein, carbBase) {
  const item = ingredientById.get(id);
  if (id === primaryProtein) return "primary_protein";
  if (proteinFamilies[id]) return ["lentils_cooked", "chickpeas_cooked", "hummus"].includes(id) ? "legume" : "secondary_protein";
  if (id === carbBase) return "carb_base";
  if (seasoningIngredientIds.has(id)) return "seasoning";
  if (nonScalableSauces.has(id)) return "sauce";
  if (["spinach", "lettuce", "mixed_salad"].includes(id)) return "leafy_vegetable";
  if (item.category === "Vegetables") return "vegetable";
  if (item.category === "Fruit") return "fruit";
  if (item.category === "Fats") return "fat_source";
  return "garnish";
}

function seasoningFor(mealName, cuisine) {
  if (/shawarma/i.test(mealName)) return "shawarma_spice";
  if (/kofta|kafta/i.test(mealName)) return "kofta_spice";
  if (/kabsa/i.test(mealName)) return "kabsa_spice";
  if (/fajita/i.test(mealName)) return "fajita_spice";
  if (/pasta|bolognese|primavera/i.test(mealName) || cuisine === "Italian") return "italian_herbs";
  if (/lentil|chickpea|mujaddara/i.test(mealName)) return "cumin_coriander_spice";
  if (cuisine === M) return "ground_cumin";
  if (["Mediterranean", "Greek"].includes(cuisine)) return "parsley";
  if (cuisine === "Asian") return "garlic";
  if (["American", "International", "Mexican"].includes(cuisine)) return "paprika";
  return "black_pepper";
}

function supportingSeasoningFor(cuisine, primarySeasoning) {
  if (primarySeasoning === "garlic") return "black_pepper";
  if ([M, "Mediterranean", "Greek"].includes(cuisine)) return "garlic";
  if (cuisine === "Italian") return "garlic";
  return "black_pepper";
}

function userIngredientName(item) {
  return String(item?.name_en || "Ingredient").replace(/^Halal\s+/i, "").replace(/^Cooked\s+/i, "").replace(/^Roasted\s+/i, "");
}

function preparationStyle(mealName, mealType) {
  if (mealType === "snack") {
    if (/roll-up|cups|bites/i.test(mealName)) return "assemble";
    if (/shake/i.test(mealName)) return "blend";
    return "mix";
  }
  if (/omelet|scramble|skillet|shakshuka|stir-fry/i.test(mealName)) return "stovetop";
  if (/bake|baked|roasted|tray/i.test(mealName)) return "oven";
  if (/taco/i.test(mealName)) return "assemble";
  if (/salad|bowl|plate|rice|pasta|couscous|quinoa|bulgur/i.test(mealName)) return "bowl";
  return "stovetop";
}

function recipeSteps(mealName, mealType, rows, style, spiceIds) {
  const label = (id) => userIngredientName(ingredientById.get(id)).toLowerCase();
  const primary = rows[0];
  const carb = rows.find((row) => row.ingredient_role === "carb_base");
  const produce = rows.filter((row) => ["vegetable", "leafy_vegetable", "fruit"].includes(row.ingredient_role));
  const freshProduceIds = new Set(["cucumber", "lettuce", "mixed_salad", "avocado", "berries", "apple", "banana", "dates"]);
  const rawProduce = produce.filter((row) => freshProduceIds.has(row.ingredient_id));
  const warmProduce = produce.filter((row) => !rawProduce.includes(row));
  const secondary = rows.filter((row) => ["secondary_protein", "legume"].includes(row.ingredient_role));
  const coldSecondaryIds = new Set(["greek_yogurt_plain", "cottage_cheese", "labneh", "smoked_salmon", "tuna_water_drained"]);
  const coldSecondary = secondary.filter((row) => coldSecondaryIds.has(row.ingredient_id));
  const warmSecondary = secondary.filter((row) => !coldSecondary.includes(row));
  const cookingOil = ["stovetop", "oven"].includes(style) ? rows.find((row) => row.ingredient_id === "olive_oil") : null;
  const sauces = rows.filter((row) => ["sauce", "fat_source"].includes(row.ingredient_role) && row !== cookingOil);
  const seasonings = rows.filter((row) => spiceIds.includes(row.ingredient_id));
  const list = (items) => items.map((row) => label(row.ingredient_id)).join(" and ");
  const seasoningText = list(seasonings) || "the listed seasoning";
  const coldPrimary = ["greek_yogurt_plain", "cottage_cheese", "labneh", "smoked_salmon", "tuna_water_drained"].includes(primary.ingredient_id);
  const animalProteinTemperatures = {
    chicken_breast_cooked: "74 C",
    chicken_thigh_cooked: "74 C",
    turkey_breast_cooked: "74 C",
    beef_lean_cooked: "71 C",
    lamb_lean_cooked: "71 C",
    salmon_cooked: "63 C",
    white_fish_cooked: "63 C"
  };
  const animalProteinTemperature = animalProteinTemperatures[primary.ingredient_id];
  const shrimpPrimary = primary.ingredient_id === "shrimp_cooked";
  const oilText = cookingOil ? " in the olive oil" : "";
  const steps = [];

  if (mealType === "snack") {
    if (style === "blend") {
      steps.push(`Blend the ${label(primary.ingredient_id)} until smooth, adding water if needed.`);
      if (produce.length) steps.push(`Add the ${list(produce)}; blend briefly.`);
      if (sauces.length) steps.push(`Top with ${list(sauces)}.`);
      steps.push("Serve immediately.");
      return steps;
    }
    if (["greek_yogurt_plain", "cottage_cheese", "labneh"].includes(primary.ingredient_id)) {
      steps.push(`Spoon the ${label(primary.ingredient_id)} into a bowl.`);
      if (produce.length) steps.push(`Add the ${list(produce)} and fold gently.`);
      if (sauces.length) steps.push(`Add ${list(sauces)} before serving.`);
      steps.push("Serve chilled.");
      return steps;
    }
    if (animalProteinTemperature) {
      steps.push(`Season the ${label(primary.ingredient_id)}, then cook it until the center reaches ${animalProteinTemperature}.`);
      steps.push("Let it rest briefly, then portion it for serving.");
    } else if (shrimpPrimary) {
      steps.push("Cook the shrimp until opaque and firm, then let them cool briefly.");
    } else if (primary.ingredient_id === "whey_halal") {
      const yogurt = rows.find((row) => row.ingredient_id === "greek_yogurt_plain");
      steps.push(yogurt ? "Whisk the whey protein into the Greek yogurt until smooth." : "Shake the whey protein with cold water until smooth.");
    } else if (coldPrimary) {
      steps.push(`Drain the ${label(primary.ingredient_id)} if needed.`);
    } else {
      steps.push(`Portion the ${label(primary.ingredient_id)} for serving.`);
    }
    if (produce.length) steps.push(`Add the ${list(produce)}.`);
    steps.push("Arrange the ingredients for serving.");
    if (sauces.length) steps.push(`Add ${list(sauces)} before serving.`);
    return steps;
  }

  if (style === "oven") {
    steps.push("Preheat the oven to 200 C and line a baking tray.");
    steps.push(`Season the ${label(primary.ingredient_id)} with ${seasoningText}, then place it on the tray${warmProduce.length ? ` with the ${list(warmProduce)}` : ""}.`);
    if (animalProteinTemperature) steps.push(`Bake until fully cooked and the center reaches ${animalProteinTemperature}.`);
    else if (shrimpPrimary) steps.push("Bake until the shrimp are opaque and firm.");
    else steps.push("Bake until fully cooked and lightly browned.");
    if (carb) steps.push(`Reheat the ${label(carb.ingredient_id)} separately.`);
    if (rawProduce.length) steps.push(`Keep the ${list(rawProduce)} fresh and add after baking.`);
    if (sauces.length) steps.push(`Finish with ${list(sauces)} after plating.`);
    return steps.slice(0, 6);
  }

  if (coldPrimary) {
    steps.push(`Keep the ${label(primary.ingredient_id)} chilled.`);
  } else if (primary.ingredient_id === "tofu_firm") {
    steps.push(`Season the tofu with ${seasoningText}; sear it${oilText} until golden.`);
  } else if (primary.ingredient_id.includes("egg")) {
    steps.push(`Cook the eggs${oilText} with ${seasoningText} until set.`);
  } else if (animalProteinTemperature) {
    steps.push(`Season the ${label(primary.ingredient_id)} with ${seasoningText}, then cook it${oilText} until the center reaches ${animalProteinTemperature}.`);
  } else if (shrimpPrimary) {
    steps.push(`Season the shrimp with ${seasoningText}, then cook them${oilText} until opaque and firm.`);
  } else {
    steps.push(`Season the ${label(primary.ingredient_id)} with ${seasoningText}; cook until ready.`);
  }

  if (warmSecondary.length) steps.push(`Warm the ${list(warmSecondary)} with the main protein.`);

  if (carb) {
    const action = ["corn_tortilla", "pita_wholewheat"].includes(carb.ingredient_id) ? "Warm" : "Reheat";
    steps.push(`${action} the ${label(carb.ingredient_id)} separately.`);
  }
  if (warmProduce.length || rawProduce.length) {
    const actions = [];
    if (warmProduce.length) actions.push(`heat ${list(warmProduce)} until tender`);
    if (rawProduce.length) {
      const leafy = rawProduce.filter((row) => ["mixed_salad", "lettuce"].includes(row.ingredient_id));
      const chop = rawProduce.filter((row) => !leafy.includes(row));
      if (chop.length) actions.push(`chop ${list(chop)} for serving`);
      if (leafy.length) actions.push(`keep ${list(leafy)} chilled until plating`);
    }
    const produceInstruction = `${actions.join("; ")}.`;
    steps.push(produceInstruction[0].toUpperCase() + produceInstruction.slice(1));
  }

  const warmComponents = [primary, carb, ...warmSecondary, ...warmProduce].filter(Boolean);
  const coldComponents = [...coldSecondary, ...rawProduce].filter(Boolean);
  if (warmComponents.length) steps.push(`Serve the ${list(warmComponents)} together${coldComponents.length ? `, then add the ${list(coldComponents)}` : ""}.`);
  else if (coldComponents.length) steps.push(`Arrange the ${list(coldComponents)} for serving.`);
  if (sauces.length) steps.push(`Add ${list(sauces)} after plating.`);
  return steps.slice(0, 6);
}

function amountFor(id, mealType, position) {
  const item = ingredientById.get(id);
  if (!item) throw new Error(`Unknown ingredient ${id}`);
  if (mealType === "snack") {
    if (item.category === "Protein") return ["whey_halal"].includes(id) ? 32 : ["egg_whole_cooked"].includes(id) ? 100 : 130;
    if (item.category === "Fats") return ["avocado"].includes(id) ? 60 : 30;
    if (item.category === "Fruit") return id === "dates" ? 32 : 150;
    return 120;
  }
  if (mealType === "breakfast") {
    if (position === 0) return id.includes("egg") ? 200 : 160;
    if (item.category === "Protein") return 100;
    if (item.category === "Fats") return id === "avocado" ? 70 : 25;
    if (item.category === "Pantry") return 30;
    return 100;
  }
  if (position === 0) return ["lentils_cooked", "chickpeas_cooked", "tofu_firm"].includes(id) ? 220 : 180;
  if (position === 1 && item.category === "Carbohydrates") return id === "corn_tortilla" ? 84 : 180;
  if (item.category === "Fats") return id === "avocado" ? 70 : 20;
  if (item.category === "Dairy" || item.category === "Pantry") return 35;
  return 150;
}

function household(item, grams) {
  return portionPolicy.formatHouseholdQuantity(grams, item);
}

function calculate(items) {
  const totals = items.reduce((sum, row) => {
    const ingredient = ingredientById.get(row.ingredient_id);
    const n = ingredient.nutrition_per_100g;
    const factor = row.quantity_g / 100;
    for (const key of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]) sum[key] += Number(n[key] || 0) * factor;
    return sum;
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value)]));
}

function applyMealCalorieLimit(rows, mealType) {
  const maximum = portionPolicy.mealCalorieLimit(mealType);
  for (let attempt = 0; attempt < 3 && calculate(rows).calories > maximum; attempt += 1) {
    const factor = maximum / calculate(rows).calories;
    for (const row of rows) {
      if (!portionPolicy.isScalableRole(row.ingredient_role)) continue;
      row.quantity_g = portionPolicy.clampQuantity(row.quantity_g * factor, row.ingredient_id, row.ingredient_role, mealType);
      row.household_quantity = household(ingredientById.get(row.ingredient_id), row.quantity_g);
    }
  }
  return rows;
}

function buildRecipe(blueprint, mealType, index) {
  const [mealName, cuisine, ...componentIds] = blueprint;
  const ids = componentIds.filter(Boolean);
  const spiceId = seasoningFor(mealName, cuisine);
  const supportingSpiceId = supportingSeasoningFor(cuisine, spiceId);
  if (spiceId !== "herbs_spices" && ids.includes("herbs_spices")) ids[ids.indexOf("herbs_spices")] = spiceId;
  if (mealType !== "snack" && !ids.includes("olive_oil")) ids.push("olive_oil");
  if (mealType !== "snack" && !ids.some((id) => ["zaatar", "herbs_spices", "shawarma_spice", "kofta_spice", "kabsa_spice", "fajita_spice", "italian_herbs", "cumin_coriander_spice", "garlic", "ground_cumin", "paprika", "black_pepper", "parsley", "mint"].includes(id))) ids.push(spiceId);
  if (mealType !== "snack" && supportingSpiceId !== spiceId && !ids.includes(supportingSpiceId)) ids.push(supportingSpiceId);
  const rows = ids.map((id, position) => {
    const item = ingredientById.get(id);
    const quantity = id === "olive_oil" ? 7 : ingredientById.get(id).category === "Pantry" && /spice|herb|zaatar|garlic|cumin|paprika|pepper|parsley|mint/.test(id) ? Number(item.household_unit_grams || 3) : amountFor(id, mealType, position);
    return {
      ingredient_id: id,
      name: userIngredientName(item),
      quantity_g: quantity,
      household_quantity: household(item, quantity),
      category: item.grocery_category
    };
  });
  const carbBase = rows.find((row) => ingredientById.get(row.ingredient_id).category === "Carbohydrates")?.ingredient_id
    || rows.find((row) => ["lentils_cooked", "chickpeas_cooked"].includes(row.ingredient_id))?.ingredient_id
    || null;
  const primaryProtein = rows
    .filter((row) => proteinFamilies[row.ingredient_id])
    .sort((a, b) => {
      const protein = (row) => Number(ingredientById.get(row.ingredient_id).nutrition_per_100g.protein_g || 0) * row.quantity_g;
      return protein(b) - protein(a);
    })[0]?.ingredient_id || rows[0].ingredient_id;
  rows.forEach((row) => {
    row.ingredient_role = ingredientRole(row.ingredient_id, primaryProtein, carbBase);
    row.quantity_g = portionPolicy.clampQuantity(row.quantity_g, row.ingredient_id, row.ingredient_role, mealType);
    row.household_quantity = household(ingredientById.get(row.ingredient_id), row.quantity_g);
  });
  applyMealCalorieLimit(rows, mealType);
  const totals = calculate(rows);
  const allergens = [...new Set(rows.flatMap((row) => ingredientById.get(row.ingredient_id).allergens))];
  const vegetarian = rows.every((row) => {
    const item = ingredientById.get(row.ingredient_id);
    return item.halal_status === "inherently_halal" && !["fish", "shellfish"].some((tag) => item.allergens.includes(tag));
  });
  const dietTags = ["halal", "balanced"];
  if (totals.protein_g >= (mealType === "snack" ? 14 : 28)) dietTags.push("high_protein");
  if (totals.carbs_g <= (mealType === "snack" ? 20 : 30)) dietTags.push("low_carb");
  if (vegetarian) dietTags.push("vegetarian");
  if (!allergens.includes("dairy")) dietTags.push("dairy_free");
  if (!allergens.includes("gluten")) dietTags.push("gluten_free");
  if (cuisine === M || ["Mediterranean", "Greek"].includes(cuisine)) dietTags.push("mediterranean");
  const style = preparationStyle(mealName, mealType);
  const spiceIds = rows.filter((row) => row.ingredient_role === "seasoning").map((row) => row.ingredient_id);
  const cookingMethod = recipeSteps(mealName, mealType, rows, style, spiceIds);
  const fatSource = rows.find((row) => row.ingredient_role === "fat_source")?.ingredient_id || null;
  const fiberSources = rows.filter((row) => Number(ingredientById.get(row.ingredient_id).nutrition_per_100g.fiber_g || 0) >= 2).map((row) => row.ingredient_id);
  const requiredSpices = spiceIds;
  const nonScalableIngredients = rows.filter((row) => ["seasoning", "sauce", "garnish"].includes(row.ingredient_role)).map((row) => row.ingredient_id);
  const scalableIngredients = rows.map((row) => row.ingredient_id).filter((id) => !nonScalableIngredients.includes(id));
  const sodiumMg = rows.reduce((total, row) => total + Number(ingredientById.get(row.ingredient_id).nutrition_per_100g.sodium_mg || 0) * row.quantity_g / 100, 0);
  const sodiumSourceIds = rows.filter((row) => ingredientById.get(row.ingredient_id).sodium_risk !== "low").map((row) => row.ingredient_id);
  const ingredientSodiumRisks = rows.map((row) => ingredientById.get(row.ingredient_id).sodium_risk);
  const sodiumRisk = ingredientSodiumRisks.includes("high") || ingredientSodiumRisks.filter((risk) => risk === "moderate").length >= 2
    ? "high"
    : ingredientSodiumRisks.includes("moderate") || sodiumMg >= 200 ? "moderate" : "low";
  const servingMultipliers = { minimum: mealType === "snack" ? 0.8 : 0.75, maximum: mealType === "snack" ? 1.2 : 1.25 };
  const practicalCalories = (multiplier) => calculate(applyMealCalorieLimit(rows.map((row) => ({
    ...row,
    quantity_g: portionPolicy.clampQuantity(
      row.quantity_g * (scalableIngredients.includes(row.ingredient_id) ? multiplier : 1),
      row.ingredient_id,
      row.ingredient_role,
      mealType
    )
  })), mealType)).calories;
  return {
    meal_id: `${mealType}_${String(index + 1).padStart(3, "0")}`,
    meal_name: mealName,
    meal_type: mealType,
    cuisine_style: cuisine,
    authenticity_level: /inspired|style/i.test(mealName) ? "inspired" : cuisine === "International" ? "generic" : "inspired",
    editorial_status: "fitnet_reviewed",
    recipe_version: "rich_recipe_library_v2",
    quality_metadata_version: "nutrition_recipe_quality_v1",
    review_method: "deterministic_quality_review",
    goal_tags: ["fat_loss", "muscle_gain", "strength", "general_fitness"],
    diet_tags: [...new Set(dietTags)],
    ingredients: rows,
    calories: totals.calories,
    protein_g: totals.protein_g,
    carbs_g: totals.carbs_g,
    fat_g: totals.fat_g,
    fiber_g: totals.fiber_g,
    prep_time_minutes: mealType === "snack" ? 5 : 10,
    cooking_time_minutes: mealType === "snack" ? 0 : ids.some((id) => /chicken|beef|lamb|fish|salmon|shrimp|turkey|tofu/.test(id)) ? 20 : 12,
    total_time_minutes: mealType === "snack" ? 5 : 30,
    cooking_method: cookingMethod,
    recipe_specific_steps: cookingMethod,
    preparation_style: style,
    cooking_technique: style === "oven" ? "bake" : style === "stovetop" ? "saute" : style === "blend" ? "blend" : "assemble",
    richness_level: totals.fat_g / Math.max(1, totals.calories) >= 0.055 ? "rich" : totals.fat_g / Math.max(1, totals.calories) >= 0.035 ? "moderate" : "light",
    sauce_limit_g: mealType === "snack" ? 45 : 45,
    primary_protein: primaryProtein,
    protein_family: proteinFamilies[primaryProtein] || "plant_based",
    carb_base: carbBase,
    fat_source: fatSource,
    fiber_sources: fiberSources,
    sodium_risk: sodiumRisk,
    sodium_source_ids: sodiumSourceIds,
    required_core_ingredients: rows.map((row) => row.ingredient_id).filter((id) => !requiredSpices.includes(id)),
    optional_ingredients: [],
    required_spices: requiredSpices,
    scalable_ingredients: scalableIngredients,
    non_scalable_ingredients: nonScalableIngredients,
    min_serving_multiplier: servingMultipliers.minimum,
    max_serving_multiplier: servingMultipliers.maximum,
    min_practical_calories: practicalCalories(servingMultipliers.minimum),
    max_practical_calories: practicalCalories(servingMultipliers.maximum),
    difficulty: "easy",
    budget_level: ids.some((id) => /salmon|shrimp|lamb|halloumi/.test(id)) ? "high" : ids.some((id) => /lentils|chickpeas|egg|tuna|tofu/.test(id)) ? "low" : "medium",
    allergens,
    restrictions: allergens.filter((tag) => ["dairy", "gluten"].includes(tag)),
    avoid_tags: [...new Set(rows.flatMap((row) => ingredientById.get(row.ingredient_id).avoid_tags))],
    suitable_for_breakfast: mealType === "breakfast",
    savory_breakfast: mealType === "breakfast",
    contains_sweet_food: false,
    contains_breakfast_carbs: false,
    protein_source: rows[0].ingredient_id,
    approved_substitutions: []
  };
}

const meals = [
  ...breakfastBlueprints.map((item, index) => buildRecipe(item, "breakfast", index)),
  ...lunchBlueprints.map((item, index) => buildRecipe(item, "lunch", index)),
  ...dinnerBlueprints.map((item, index) => buildRecipe(item, "dinner", index)),
  ...snackBlueprints.map((item, index) => buildRecipe(item, "snack", index))
];

if (meals.length !== 100) throw new Error(`Expected 100 recipes, received ${meals.length}`);
for (const type of ["breakfast", "lunch", "dinner", "snack"]) {
  const count = meals.filter((meal) => meal.meal_type === type).length;
  if (count !== 25) throw new Error(`Expected 25 ${type} recipes, received ${count}`);
}
const middleEasternCount = meals.filter((meal) => meal.cuisine_style === M).length;
if (middleEasternCount !== 40) throw new Error(`Expected 40 Middle Eastern recipes, received ${middleEasternCount}`);

fs.writeFileSync(path.join(root, "data", "ingredient_library.json"), `${JSON.stringify(ingredients, null, 2)}\n`);
fs.writeFileSync(path.join(root, "data", "meal_library.json"), `${JSON.stringify(meals, null, 2)}\n`);
console.log(JSON.stringify({ ingredients: ingredients.length, meals: meals.length, middle_eastern: middleEasternCount }, null, 2));
