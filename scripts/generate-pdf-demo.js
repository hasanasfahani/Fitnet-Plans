const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { generateWorkoutPlanV3, validateWorkoutPlanV3 } = require("../lib/workout-engine");
const { generateNutritionPlanV2, validateNutritionPlanV2 } = require("../lib/nutrition-engine");
const {
  canonicalizeWorkoutPlanV3,
  canonicalizeNutritionPlanV2
} = require("../lib/plan-contracts");

const root = path.join(__dirname, "..");
const python = process.env.FITNET_PYTHON || "/Users/hasanasfahani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const exercisePath = path.join(root, "data", "exercise_library.json");
const foodPath = path.join(root, "data", "food_library.json");
const mealPath = path.join(root, "data", "meal_library.json");
const ingredientPath = path.join(root, "data", "ingredient_library.json");
const outputDir = path.join(root, "output", "pdf");
const tmpDir = path.join(root, "tmp", "pdfs");
const exercises = JSON.parse(fs.readFileSync(exercisePath, "utf8"));
const foods = JSON.parse(fs.readFileSync(foodPath, "utf8"));
const meals = JSON.parse(fs.readFileSync(mealPath, "utf8"));
const ingredients = JSON.parse(fs.readFileSync(ingredientPath, "utf8"));

const profile = {
  goal: "Lose Weight",
  gender: "Male",
  age_range: "25-34",
  height_range: "175-184 cm",
  weight_range: "80-94 kg",
  experience: "Intermediate"
};

const workoutInput = {
  goal: profile.goal,
  profile,
  workout: {
    days: "4",
    duration: "60 minutes",
    place: "Gym",
    split: "Upper/Lower",
    focusAreas: ["Back", "Chest"],
    equipment: ["Dumbbells", "Barbell", "Cable machine", "Machines", "Bench"],
    injuries: ["None"],
    dislikedExercises: []
  }
};

const nutritionInput = {
  goal: "Lose Weight",
  profile,
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makePlans() {
  const workout = generateWorkoutPlanV3(workoutInput, exercises);
  const nutrition = generateNutritionPlanV2(nutritionInput, meals, { ingredientLibrary: ingredients });
  const workoutPlan = canonicalizeWorkoutPlanV3(workout.plan);
  const nutritionPlan = canonicalizeNutritionPlanV2(nutrition.plan);
  const workoutContract = validateWorkoutPlanV3(workoutPlan, workout.skeleton, workout.candidate_map, workout.normalized_input, workout.coaching_strategy);
  const nutritionContract = validateNutritionPlanV2(nutritionPlan, nutrition.skeleton, nutrition.candidate_map, nutrition.normalized_input, meals, ingredients);

  assert(workout.validation.valid, `Workout engine invalid: ${workout.validation.errors.join(", ")}`);
  assert(nutrition.validation.valid, `Nutrition engine invalid: ${nutrition.validation.errors.join(", ")}`);
  assert(workoutContract.valid, `Workout contract invalid: ${workoutContract.errors.join(", ")}`);
  assert(nutritionContract.valid, `Nutrition contract invalid: ${nutritionContract.errors.join(", ")}`);

  return { workoutPlan, nutritionPlan };
}

function renderPdf(payload, filename) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const payloadPath = path.join(tmpDir, `${filename}.json`);
  const outputPath = path.join(outputDir, `${filename}.pdf`);
  fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);

  const result = spawnSync(
    python,
    [
      path.join(root, "scripts", "render_plan_pdf.py"),
      "--payload",
      payloadPath,
      "--output",
      outputPath,
      "--exercises",
      exercisePath,
      "--foods",
      foodPath
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `PDF render failed for ${filename}`);
  }

  return outputPath;
}

function main() {
  const { workoutPlan, nutritionPlan } = makePlans();
  const base = {
    profile,
    prompt_version: "pdf_demo_v1"
  };

  const outputs = [
    renderPdf(
      {
        ...base,
        plan_type: "Workout Only",
        workout_plan: workoutPlan
      },
      "fitnet-workout-plan-demo"
    ),
    renderPdf(
      {
        ...base,
        plan_type: "Nutrition Only",
        nutrition_plan: nutritionPlan
      },
      "fitnet-nutrition-plan-demo"
    ),
    renderPdf(
      {
        ...base,
        plan_type: "Workout + Nutrition",
        workout_plan: workoutPlan,
        nutrition_plan: nutritionPlan
      },
      "fitnet-combined-plan-demo"
    )
  ];

  console.log(JSON.stringify({ status: "rendered", outputs }, null, 2));
}

main();
