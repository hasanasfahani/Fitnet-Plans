const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const portionPolicy = require("../lib/nutrition-portion-policy");
const { generateNutritionPlanV2 } = require("../lib/nutrition-engine");

const root = path.join(__dirname, "..");
const python = process.env.FITNET_PYTHON || "/Users/hasanasfahani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const mealLookup = new Map(meals.map((meal) => [meal.meal_id, meal]));
const ingredientLookup = new Map(ingredients.map((ingredient) => [ingredient.ingredient_id, ingredient]));
const scenarios = [
  scenario("low_calorie_fat_loss", "Lose Weight", "Female", 45, 150, 3),
  scenario("high_calorie_muscle_gain", "Build Muscle", "Male", 105, 190, 4, { dietStyle: "High Protein", activityLevel: "Lightly active" }),
  scenario("three_meals", "Improve Fitness", "Female", 62, 165, 3),
  scenario("four_meals", "Lose Weight", "Male", 80, 178, 4),
  scenario("five_meals", "Gain Strength", "Male", 85, 182, 5),
  scenario("no_eggs", "Lose Weight", "Female", 68, 168, 4, { allergies: ["Eggs"] }),
  scenario("no_dairy", "Build Muscle", "Male", 82, 180, 4, { allergies: ["Dairy"] }),
  scenario("budget_friendly", "Improve Fitness", "Female", 65, 166, 4, { budget: "Low" }),
  scenario("high_protein", "Build Muscle", "Male", 90, 185, 4, { dietStyle: "High Protein" }),
  scenario("general_health_lower_protein", "Improve Fitness", "Female", 60, 164, 4),
  scenario("middle_eastern_preference", "Improve Fitness", "Male", 78, 177, 4, { preferences: ["Middle Eastern"] }),
  scenario("international_preference", "Improve Fitness", "Female", 67, 169, 4, { preferences: ["International"] })
];

let daysChecked = 0;
let portionsChecked = 0;
let groceryItemsChecked = 0;
let minimumQualityScore = 100;
let middleEasternMeals = 0;
let internationalMeals = 0;
const generatedByName = new Map();

for (const test of scenarios) {
  const generated = generateNutritionPlanV2(test.input, meals, { ingredientLibrary: ingredients });
  generatedByName.set(test.name, generated);
  assert(generated.validation.valid, `${test.name}: ${generated.validation.errors.join(", ")}`);
  assert(generated.validation.quality_score.passed, `${test.name}: quality gate did not pass`);
  minimumQualityScore = Math.min(minimumQualityScore, generated.validation.quality_score.score);
  const normalized = generated.normalized_input;
  const selectedMetadata = generated.plan.days.flatMap((day) => day.meals).map((meal) => mealLookup.get(meal.meal_id));
  assert(generated.plan.days.every((day) => day.meals.length === normalized.meals_per_day), `${test.name}: incorrect meal count`);

  for (const day of generated.plan.days) {
    const totals = day.daily_totals;
    assert(totals.calories >= normalized.quality_calorie_range[0] && totals.calories <= normalized.quality_calorie_range[1], `${test.name}/day${day.day_index}: calories`);
    assert(totals.protein_g >= normalized.macro_targets.protein_g * 0.9 && totals.protein_g <= Math.ceil(normalized.macro_targets.protein_g * 1.1), `${test.name}/day${day.day_index}: protein`);
    assert(totals.protein_g <= normalized.protein_ceiling_g, `${test.name}/day${day.day_index}: protein ceiling`);
    assert(inRange(totals.carbs_g, normalized.macro_targets.carbs_g, 0.85, 1.15), `${test.name}/day${day.day_index}: carbohydrates`);
    assert(inRange(totals.fat_g, normalized.macro_targets.fat_g, 0.85, 1.15), `${test.name}/day${day.day_index}: fat`);
    assert(totals.fiber_g >= normalized.fiber_target_g, `${test.name}/day${day.day_index}: fiber`);
    let dailyHighSodium = 0;
    for (const meal of day.meals) {
      const metadata = mealLookup.get(meal.meal_id);
      assert(metadata && metadata.diet_tags.includes("halal"), `${test.name}: non-halal meal`);
      if (metadata.sodium_risk === "high") dailyHighSodium += 1;
      if (test.input.nutrition.budget === "Low") assert(metadata.budget_level !== "high", `${test.name}: high-budget meal selected`);
      for (const row of meal.ingredients) {
        const ingredient = ingredientLookup.get(row.ingredient_id);
        const [minimum, maximum] = portionPolicy.portionRange(row.ingredient_id, row.ingredient_role, meal.meal_slot);
        assert(ingredient, `${test.name}: unknown ingredient ${row.ingredient_id}`);
        assert(["inherently_halal", "requires_halal_certified_source", "verified_halal_product"].includes(ingredient.halal_status), `${test.name}: unapproved halal status`);
        assert(!/\b(pork|bacon|ham|lard|alcohol)\b/i.test(`${ingredient.ingredient_id} ${ingredient.name_en} ${(ingredient.avoid_tags || []).join(" ")}`), `${test.name}: forbidden halal ingredient`);
        assert(row.quantity_g >= minimum && row.quantity_g <= maximum, `${test.name}: unrealistic portion ${row.ingredient_id}`);
        assert(row.household_quantity === portionPolicy.formatHouseholdQuantity(row.quantity_g, ingredient), `${test.name}: household mismatch ${row.ingredient_id}`);
        assert(!/\d+\.\d+/.test(row.household_quantity), `${test.name}: decimal household measurement`);
        assert(!normalized.allergy_tags.some((tag) => (ingredient.allergens || []).includes(tag)), `${test.name}: allergen leaked`);
        portionsChecked += 1;
      }
    }
    assert(dailyHighSodium <= 1 || day.meals.some((meal) => meal.sodium_reason), `${test.name}/day${day.day_index}: sodium stacking`);
    daysChecked += 1;
  }

  const uniqueRecipes = new Set(generated.plan.days.flatMap((day) => day.meals.map((meal) => meal.meal_id)));
  const proteinFamilies = new Set(selectedMetadata.map((meal) => meal.protein_family).filter(Boolean));
  assert(uniqueRecipes.size >= 10, `${test.name}: insufficient recipe diversity`);
  for (const slot of new Set(generated.plan.days.flatMap((day) => day.meals.map((meal) => meal.meal_slot)))) {
    const slotRecipes = new Set(generated.plan.days.flatMap((day) => day.meals).filter((meal) => meal.meal_slot === slot).map((meal) => meal.meal_id));
    const availableSlotRecipes = new Set(generated.skeleton.flatMap((day) => day.meals).filter((meal) => meal.meal_slot === slot).flatMap((meal) => (generated.candidate_map[meal.slot_id] || []).map((candidate) => candidate.meal_id)));
    if (slotRecipes.size < Math.min(2, availableSlotRecipes.size)) {
      const repeated = generated.plan.days.flatMap((day) => day.meals).filter((meal) => meal.meal_slot === slot);
      assert(repeated.some((meal) => /did not preserve daily nutrition targets/i.test(meal.duplicate_reason || "")), `${test.name}: insufficient ${slot} diversity without a constrained-target reason`);
    }
  }
  assert(proteinFamilies.size >= 3, `${test.name}: insufficient protein-family diversity`);

  const groceryItems = generated.plan.weekly_grocery_list.flatMap((group) => group.items);
  const groceryIds = groceryItems.map((item) => item.ingredient_id);
  assert(new Set(groceryIds).size === groceryIds.length, `${test.name}: duplicate grocery ingredient`);
  assert(groceryItems.every((item) => item.quantity_g > 0 && item.quantity_label), `${test.name}: unusable grocery quantity`);
  groceryItemsChecked += groceryItems.length;

  if (test.name === "general_health_lower_protein") {
    assert(normalized.macro_targets.protein_g / normalized.body_weight_kg <= 1.6, "General-health protein target is too high");
  }
  if (test.name === "low_calorie_fat_loss") assert(normalized.calorie_target <= 1800, "Low-calorie scenario did not exercise a low target");
  if (test.name === "high_calorie_muscle_gain") assert(normalized.calorie_target >= 3000, "High-calorie scenario did not exercise a high target");
  if (test.name === "no_eggs") {
    assert(generated.plan.days.flatMap((day) => day.meals).flatMap((meal) => meal.ingredients).every((row) => !row.ingredient_id.includes("egg")), "Egg-allergy scenario contains egg ingredients");
  }
  if (test.name === "no_dairy") {
    assert(generated.plan.days.flatMap((day) => day.meals).flatMap((meal) => meal.ingredients).every((row) => !(ingredientLookup.get(row.ingredient_id).allergens || []).includes("dairy")), "Dairy-allergy scenario contains dairy ingredients");
  }
  if (test.name === "middle_eastern_preference") {
    middleEasternMeals = selectedMetadata.filter((meal) => meal.cuisine_style === "Middle Eastern").length;
    assert(middleEasternMeals >= 10, "Middle Eastern preference did not materially influence selection");
    assert(generated.validation.quality_score.categories.preference_match > 0, "Middle Eastern preference was not scored");
  }
  if (test.name === "international_preference") {
    internationalMeals = selectedMetadata.filter((meal) => meal.cuisine_style === "International").length;
    const nonMiddleEasternCuisines = new Set(selectedMetadata.map((meal) => meal.cuisine_style).filter((cuisine) => cuisine !== "Middle Eastern"));
    assert(internationalMeals >= 7, "International preference did not materially influence selection");
    assert(nonMiddleEasternCuisines.size >= 4, "International preference did not preserve mixed cuisine variety");
    assert(generated.validation.quality_score.categories.preference_match > 0, "International preference was not scored");
  }
}

const renderedPdfs = [
  renderScenarioPdf("low", scenarios[0], generatedByName.get("low_calorie_fat_loss")),
  renderScenarioPdf("high", scenarios[1], generatedByName.get("high_calorie_muscle_gain"))
];
for (const pdf of renderedPdfs) {
  assert(pdf.pages === pdf.expectedPages, `${pdf.name}: PDF is ${pdf.pages} pages; expected ${pdf.expectedPages}`);
  assert(pdf.text.includes("Day 1") && pdf.text.includes("Day 7") && /weekly grocery list/i.test(pdf.text), `${pdf.name}: incomplete PDF`);
  assert(!/Available equipment|Injuries or pain limitations|Stop any exercise/.test(pdf.text), `${pdf.name}: workout wording leaked into nutrition PDF`);
  assert(!/\bhalal\b/i.test(pdf.text), `${pdf.name}: redundant halal wording leaked into nutrition PDF`);
}

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.scenario_matrix.v1",
  scenarios_checked: scenarios.length,
  days_checked: daysChecked,
  portions_checked: portionsChecked,
  grocery_items_checked: groceryItemsChecked,
  minimum_quality_score: minimumQualityScore,
  middle_eastern_preferred_meals: middleEasternMeals,
  international_preferred_meals: internationalMeals,
  representative_pdf_pages: Object.fromEntries(renderedPdfs.map((pdf) => [pdf.name, pdf.pages]))
}, null, 2));

function scenario(name, goal, gender, weight, height, mealCount, overrides = {}) {
  return {
    name,
    input: {
      goal,
      profile: { gender, birth_date: "1992-01-01", height_cm: height, weight_kg: weight },
      nutrition: {
        meals: String(mealCount),
        activityLevel: overrides.activityLevel || "Mostly sitting",
        safetyFlags: ["None"],
        dietStyle: overrides.dietStyle || "Balanced",
        allergies: overrides.allergies || ["None"],
        restrictions: ["None"],
        cookingTime: overrides.cookingTime || "Flexible",
        budget: overrides.budget || "Flexible",
        preferences: overrides.preferences || [],
        foodsToAvoid: []
      }
    }
  };
}

function renderScenarioPdf(name, test, generated) {
  const directory = path.join(root, "tmp", "pdfs", "nutrition-scenarios");
  fs.mkdirSync(directory, { recursive: true });
  const payloadPath = path.join(directory, `${name}.json`);
  const outputPath = path.join(directory, `${name}.pdf`);
  fs.writeFileSync(payloadPath, JSON.stringify({
    profile: { ...test.input.profile, goal: test.input.goal },
    plan_type: "Nutrition Only",
    nutrition_plan: generated.plan
  }));
  const rendered = spawnSync(python, [
    path.join(root, "scripts", "render_plan_pdf.py"),
    "--payload", payloadPath,
    "--output", outputPath,
    "--exercises", path.join(root, "data", "exercise_library.json"),
    "--foods", path.join(root, "data", "food_library.json")
  ], { encoding: "utf8" });
  assert(rendered.status === 0, rendered.stderr || `${name}: PDF render failed`);
  const inspected = spawnSync(python, ["-c", [
    "import json, sys",
    "from pypdf import PdfReader",
    "r=PdfReader(sys.argv[1])",
    "print(json.dumps({'pages':len(r.pages),'text':'\\n'.join((p.extract_text() or '') for p in r.pages)}))"
  ].join("; "), outputPath], { encoding: "utf8" });
  assert(inspected.status === 0, inspected.stderr || `${name}: PDF inspection failed`);
  const dayPages = generated.plan.days.reduce((total, day) => total + Math.max(1, Math.ceil(day.meals.length / 4)), 0);
  const groceryItems = generated.plan.weekly_grocery_list.flatMap((group) => group.items || []).length;
  const groceryPages = Math.max(1, Math.ceil(groceryItems / 50));
  const fixedPages = 5; // Cover, summary, app promo, guidance, and final CTA.
  return { name, expectedPages: fixedPages + dayPages + groceryPages, ...JSON.parse(inspected.stdout) };
}

function inRange(value, target, minimum, maximum) {
  return value >= target * minimum && value <= target * maximum;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
