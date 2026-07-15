const fs = require("fs");
const path = require("path");
const { generateWorkoutPlan, generateWorkoutPlanV2, validateWorkoutPlanV2 } = require("../lib/workout-engine");
const { generateNutritionPlan, generateNutritionPlanV2, validateNutritionPlanV2 } = require("../lib/nutrition-engine");
const {
  HARD_ID_RULE,
  REPAIR_RULE,
  buildWorkoutSelectionPrompt,
  buildWorkoutSelectionPromptV2,
  buildNutritionSelectionPrompt,
  buildNutritionSelectionPromptV2,
  buildRepairPrompt,
  canonicalizeWorkoutPlan,
  canonicalizeNutritionPlan,
  canonicalizeWorkoutPlanV2,
  canonicalizeNutritionPlanV2,
  validateWorkoutContract,
  validateNutritionContract,
  collectAllowedCandidateIds
} = require("../lib/plan-contracts");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const foods = JSON.parse(fs.readFileSync(path.join(root, "data", "food_library.json"), "utf8"));
const meals = JSON.parse(fs.readFileSync(path.join(root, "data", "meal_library.json"), "utf8"));
const ingredients = JSON.parse(fs.readFileSync(path.join(root, "data", "ingredient_library.json"), "utf8"));
const workoutSchema = JSON.parse(fs.readFileSync(path.join(root, "data/contracts/workout-output.schema.json"), "utf8"));
const nutritionSchema = JSON.parse(fs.readFileSync(path.join(root, "data/contracts/nutrition-output.schema.json"), "utf8"));

const workoutInput = {
  goal: "Build Muscle",
  profile: { experience: "Intermediate" },
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const workout = generateWorkoutPlan(workoutInput, exercises, { includeNames: true });
const nutrition = generateNutritionPlan(nutritionInput, foods, { includeNames: true });
const workoutV2 = generateWorkoutPlanV2(workoutInput, exercises, { includeNames: true });
const nutritionV2 = generateNutritionPlanV2(nutritionInput, meals, { includeNames: true, ingredientLibrary: ingredients });

const workoutContractPlan = canonicalizeWorkoutPlan(workout.plan);
const nutritionContractPlan = canonicalizeNutritionPlan(nutrition.plan);
const workoutContract = validateWorkoutContract(workoutContractPlan, workout.skeleton, workout.candidate_map);
const nutritionContract = validateNutritionContract(nutritionContractPlan, nutrition.skeleton, nutrition.candidate_map);

assert(workoutContract.valid, `Workout contract invalid: ${workoutContract.errors.join(", ")}`);
assert(nutritionContract.valid, `Nutrition contract invalid: ${nutritionContract.errors.join(", ")}`);
const workoutV2Plan = canonicalizeWorkoutPlanV2(workoutV2.plan);
const nutritionV2Plan = canonicalizeNutritionPlanV2(nutritionV2.plan);
const workoutV2Contract = validateWorkoutPlanV2(workoutV2Plan, workoutV2.skeleton, workoutV2.candidate_map, workoutV2.normalized_input);
const nutritionV2Contract = validateNutritionPlanV2(
  nutritionV2Plan,
  nutritionV2.skeleton,
  nutritionV2.candidate_map,
  nutritionV2.normalized_input,
  meals,
  ingredients
);
assert(workoutV2Contract.valid, `Workout v2 contract invalid: ${workoutV2Contract.errors.join(", ")}`);
assert(nutritionV2Contract.valid, `Nutrition v2 contract invalid: ${nutritionV2Contract.errors.join(", ")}`);
assert(!workoutV2Plan.weeks, "Workout v2 must not generate weeks");
assert(workoutV2Plan.plan_days.length === workoutV2.normalized_input.days, "Workout v2 day count mismatch");
assert(workoutV2Plan.repeat_instruction.includes("Repeat this weekly plan for 4 weeks"), "Workout v2 repeat instruction missing");
assert(!nutritionV2Plan.weeks, "Nutrition v2 must not generate weeks");
assert(nutritionV2Plan.days.length === 7, "Nutrition v2 must generate exactly 7 days");
assert(nutritionV2Plan.repeat_instruction.includes("Repeat this 7-day meal plan for 4 weeks"), "Nutrition v2 repeat instruction missing");

const workoutPrompt = buildWorkoutSelectionPrompt({
  normalizedInput: workout.normalized_input,
  skeleton: workout.skeleton,
  candidateMap: workout.candidate_map
});
const nutritionPrompt = buildNutritionSelectionPrompt({
  normalizedInput: nutrition.normalized_input,
  skeleton: nutrition.skeleton,
  candidateMap: nutrition.candidate_map
});
const workoutV2Prompt = buildWorkoutSelectionPromptV2({
  normalizedInput: workoutV2.normalized_input,
  coachingStrategy: workoutV2.coaching_strategy,
  skeleton: workoutV2.skeleton,
  candidateMap: workoutV2.candidate_map
});
const nutritionV2Prompt = buildNutritionSelectionPromptV2({
  normalizedInput: nutritionV2.normalized_input,
  skeleton: nutritionV2.skeleton,
  candidateMap: nutritionV2.candidate_map
});

const repairPrompt = buildRepairPrompt({
  planType: "workout",
  validationErrors: ["exercise_id_not_in_slot_candidates:day1_slot1:999999"],
  invalidJson: { plan_days: [] },
  allowedCandidateIds: collectAllowedCandidateIds(workout.candidate_map, "exercise_id")
});

assert(workoutPrompt.system.includes(HARD_ID_RULE), "Workout prompt missing hard ID rule");
assert(nutritionPrompt.system.includes(HARD_ID_RULE), "Nutrition prompt missing hard ID rule");
assert(workoutV2Prompt.user.includes("fitnet.workout.output.v3"), "Workout coaching prompt missing v3 schema id");
assert(workoutV2Prompt.prompt_version === "workout_program_v3_1", "Workout coaching prompt version mismatch");
assert(nutritionV2Prompt.user.includes("fitnet.nutrition.selection.v1"), "Nutrition selection prompt missing schema id");
assert(!nutritionV2Prompt.user.includes('"ingredients"'), "Nutrition selection prompt exposed recipe ingredients");
assert(!nutritionV2Prompt.user.includes('"cooking_method"'), "Nutrition selection prompt exposed cooking instructions");
assert(repairPrompt.system.includes(REPAIR_RULE), "Repair prompt missing repair rule");
assert(workoutSchema.$id === "fitnet.workout.output.v1", "Workout schema id mismatch");
assert(nutritionSchema.$id === "fitnet.nutrition.output.v1", "Nutrition schema id mismatch");

console.log(
  JSON.stringify(
    {
      status: "valid",
      schemas: [workoutSchema.$id, nutritionSchema.$id],
      workout_prompt_version: workoutPrompt.prompt_version,
      nutrition_prompt_version: nutritionPrompt.prompt_version,
      repair_prompt_version: repairPrompt.prompt_version,
      workout_days: workoutContractPlan.plan_days.length,
      nutrition_meals: nutritionContractPlan.nutrition_days[0].meals.length,
      workout_v2_days: workoutV2Plan.plan_days.length,
      workout_coaching_prompt_version: workoutV2Prompt.prompt_version,
      workout_v2_repeat_instruction: workoutV2Plan.repeat_instruction,
      nutrition_v2_days: nutritionV2Plan.days.length,
      nutrition_v2_repeat_instruction: nutritionV2Plan.repeat_instruction
    },
    null,
    2
  )
);
