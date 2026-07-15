const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const GENERATOR_VERSION = "fitnet_generator_v5";
const VALIDATION_POLICY_VERSION = "fitnet_quality_policy_v2";
const WORKOUT_PROMPT_VERSION = "fitnet_workout_selection_v3";
const NUTRITION_PROMPT_VERSION = "fitnet_nutrition_selection_v1";

function contentRevision(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function sourceBuildId(root) {
  if (process.env.FITNET_BUILD_ID) return String(process.env.FITNET_BUILD_ID);
  if (process.env.VERCEL_GIT_COMMIT_SHA) return String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 12);
  const files = [
    "lib/api-core.js",
    "lib/workout-engine.js",
    "lib/nutrition-engine.js",
    "lib/generation-quality.js",
    "scripts/render_plan_pdf.py"
  ];
  const hash = crypto.createHash("sha256");
  for (const relativePath of files) {
    const filePath = path.join(root, relativePath);
    hash.update(relativePath);
    hash.update(fs.readFileSync(filePath));
  }
  return `local-${hash.digest("hex").slice(0, 12)}`;
}

function buildGenerationProvenance({ root, exerciseRevision, nutritionRevision }) {
  return {
    build_id: sourceBuildId(root),
    generator_version: GENERATOR_VERSION,
    validation_policy_version: VALIDATION_POLICY_VERSION,
    workout_prompt_version: WORKOUT_PROMPT_VERSION,
    nutrition_prompt_version: NUTRITION_PROMPT_VERSION,
    exercise_library_revision: exerciseRevision,
    nutrition_library_revision: nutritionRevision
  };
}

function compareProvenance(stored, active, planType = "") {
  if (!stored) return { compatible: false, reasons: ["missing_generation_provenance"] };
  const keys = ["build_id", "generator_version", "validation_policy_version"];
  if (/workout/i.test(planType)) keys.push("workout_prompt_version", "exercise_library_revision");
  if (/nutrition/i.test(planType)) keys.push("nutrition_prompt_version", "nutrition_library_revision");
  const reasons = keys
    .filter((key) => !stored[key] || stored[key] !== active[key])
    .map((key) => `stale_${key}:${stored[key] || "missing"}:${active[key]}`);
  return { compatible: reasons.length === 0, reasons };
}

function validateRecipeSemantics(meal) {
  const errors = [];
  const mealId = meal.meal_id || "unknown";
  const steps = Array.isArray(meal.cooking_method) ? meal.cooking_method : [meal.cooking_method || ""];
  const text = steps.join(" ").toLowerCase();
  const ingredientRows = meal.ingredients || [];
  const ingredientIds = new Set(ingredientRows.map((row) => String(row.ingredient_id || "")));

  const incompatiblePatterns = [
    [/\b(?:warm|heat|cook)\s+(?:the\s+)?(?:whey protein|greek yogurt|labneh|cottage cheese|almonds|walnuts|avocado|lettuce|mixed salad|berries)\b/i, "heats_cold_or_ready_ingredient"],
    [/\bcut\s+(?:the\s+)?(?:mixed berries|berries|yogurt|whey protein|almonds|walnuts)\b/i, "cuts_incompatible_ingredient"],
    [/\bspoon over\s+(?:almonds|walnuts|avocado)\b/i, "spoons_solid_ingredient"]
  ];
  for (const [pattern, code] of incompatiblePatterns) {
    if (pattern.test(text)) errors.push(`recipe_semantic:${code}:${mealId}`);
  }

  const animalProteinRules = [
    [["chicken_breast_cooked", "chicken_thigh_cooked", "turkey_breast_cooked"], /74\s*(?:degrees?\s*)?c\b/i, "poultry_safe_temperature_missing"],
    [["beef_lean_cooked", "lamb_lean_cooked"], /71\s*(?:degrees?\s*)?c\b/i, "meat_safe_temperature_missing"],
    [["salmon_cooked", "white_fish_cooked"], /63\s*(?:degrees?\s*)?c\b/i, "fish_safe_temperature_missing"],
    [["shrimp_cooked"], /opaque/i, "shellfish_doneness_missing"]
  ];
  for (const [ids, pattern, code] of animalProteinRules) {
    if (ids.some((id) => ingredientIds.has(id)) && !pattern.test(text)) {
      errors.push(`recipe_semantic:${code}:${mealId}`);
    }
  }
  if (/\b(?:warm|reheat)\b[^.]{0,50}\b(?:chicken|turkey|beef|lamb|salmon|white fish|shrimp)\b/i.test(text)) {
    errors.push(`recipe_semantic:raw_protein_described_as_reheated:${mealId}`);
  }

  for (const row of ingredientRows) {
    const grams = Number(row.quantity_g || 0);
    if (["vegetable", "leafy_vegetable"].includes(row.ingredient_role) && grams < 30) {
      errors.push(`recipe_semantic:impractical_vegetable_quantity:${mealId}:${row.ingredient_id}:${grams}`);
    }
    if (row.ingredient_role === "sauce" && row.ingredient_id !== "tomato_sauce" && grams > 45) {
      errors.push(`recipe_semantic:oversized_sauce_quantity:${mealId}:${row.ingredient_id}:${grams}`);
    }
  }
  if (Array.isArray(meal.cooking_method)) {
    if (meal.quality_metadata_version !== "nutrition_recipe_quality_v1") errors.push(`recipe_semantic:missing_quality_metadata:${mealId}`);
    if (!meal.cooking_technique || !meal.richness_level) errors.push(`recipe_semantic:incomplete_quality_metadata:${mealId}`);
  }
  return errors;
}

function validateNutritionPlanSemantics(plan) {
  const errors = [];
  for (const day of plan?.days || []) {
    for (const meal of day.meals || []) {
      errors.push(...validateRecipeSemantics(meal));
    }
  }
  return errors;
}

function validateWorkoutPlanSemantics(plan) {
  const errors = [];
  for (const day of plan?.plan_days || []) {
    let isolationSeen = false;
    let armIsolationSeen = false;
    for (const exercise of day.exercises || []) {
      const category = String(exercise.exercise_type || exercise.exercise_category || "").toLowerCase();
      const name = String(exercise.exercise_name || "");
      const muscleGroup = String(exercise.muscle_group || "");
      if (category === "isolation") isolationSeen = true;
      if (category === "compound" && isolationSeen) errors.push(`workout_semantic:compound_after_isolation:${day.day_index}:${exercise.slot_id}`);
      if (["Biceps", "Triceps", "Forearms"].includes(muscleGroup)) armIsolationSeen = true;
      if (armIsolationSeen && ["Chest", "Back", "Shoulders", "Legs"].includes(muscleGroup)) {
        errors.push(`workout_semantic:torso_or_leg_after_arm_isolation:${day.day_index}:${exercise.slot_id}`);
      }
      if (/(?:barbell|plate-loaded|machine)\s+deadlift/i.test(name) && Number(String(exercise.rest || "0").match(/\d+/)?.[0] || 0) < 90) {
        errors.push(`workout_semantic:deadlift_rest_too_short:${day.day_index}:${exercise.slot_id}`);
      }
    }
  }
  return errors;
}

module.exports = {
  GENERATOR_VERSION,
  VALIDATION_POLICY_VERSION,
  WORKOUT_PROMPT_VERSION,
  NUTRITION_PROMPT_VERSION,
  contentRevision,
  buildGenerationProvenance,
  compareProvenance,
  validateRecipeSemantics,
  validateNutritionPlanSemantics,
  validateWorkoutPlanSemantics
};
