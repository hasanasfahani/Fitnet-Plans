const fs = require("fs");
const path = require("path");
const { generateNutritionPlan } = require("../lib/nutrition-engine");

const root = path.join(__dirname, "..");
const foodLibrary = JSON.parse(fs.readFileSync(path.join(root, "data", "food_library.json"), "utf8"));

const demoInput = {
  goal: "Lose Weight",
  profile: {
    gender: "Male",
    age_range: "25-34",
    height_range: "175-184 cm",
    weight_range: "80-94 kg"
  },
  nutrition: {
    meals: "4",
    dietStyle: "High Protein",
    restrictions: ["None"],
    allergies: ["None"],
    cookingTime: "Moderate",
    budget: "Medium",
    preferences: ["Chicken", "Rice"]
  }
};

const result = generateNutritionPlan(demoInput, foodLibrary, { includeNames: true });

if (!result.validation.valid) {
  console.error(JSON.stringify(result.validation, null, 2));
  process.exit(1);
}

const day = result.plan.nutrition_days[0];
const summary = {
  status: result.status,
  calorie_target: result.normalized_input.calorie_target,
  meals: day.meals.length,
  daily_totals: day.daily_totals,
  first_meal: day.meals[0]
};

console.log(JSON.stringify(summary, null, 2));
