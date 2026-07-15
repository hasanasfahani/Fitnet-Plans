const meals = require("../data/meal_library.json");
const ingredients = require("../data/ingredient_library.json");
const { generateNutritionPlanV2 } = require("../lib/nutrition-engine");

const ingredientLookup = new Map(ingredients.map((ingredient) => [ingredient.ingredient_id, ingredient]));
const generated = generateNutritionPlanV2({
  goal: "Lose Weight",
  profile: { gender: "Male", birth_date: "1995-01-01", height_cm: 178, weight_kg: 80 },
  nutrition: {
    meals: "4",
    dietStyle: "Balanced",
    allergies: ["None"],
    restrictions: ["None"],
    cookingTime: "Flexible",
    budget: "Flexible",
    preferences: [],
    foodsToAvoid: []
  }
}, meals, { ingredientLibrary: ingredients });

assert(generated.validation.valid, generated.validation.errors.join(", "));

const consumedTotals = new Map();
for (const day of generated.plan.days) {
  for (const meal of day.meals) {
    for (const row of meal.ingredients) {
      consumedTotals.set(row.ingredient_id, Number(consumedTotals.get(row.ingredient_id) || 0) + Number(row.quantity_g || 0));
    }
  }
}

const groceryItems = generated.plan.weekly_grocery_list.flatMap((group) => group.items);
const ids = groceryItems.map((item) => item.ingredient_id);
assert(new Set(ids).size === ids.length, "Grocery list contains duplicate canonical ingredient IDs");
assert(ids.length === consumedTotals.size, "Grocery list does not contain exactly one row per consumed ingredient");

let reviewedConversions = 0;
let rawConversions = 0;
let dryConversions = 0;
let countableLabels = 0;

for (const item of groceryItems) {
  const ingredient = ingredientLookup.get(item.ingredient_id);
  assert(ingredient, `Unknown grocery ingredient ${item.ingredient_id}`);
  const consumedGrams = consumedTotals.get(item.ingredient_id);
  const expectedPurchaseGrams = Math.round(consumedGrams * (ingredient.purchase_conversion_reviewed ? ingredient.purchase_multiplier : 1));
  assert(item.quantity_g === expectedPurchaseGrams, `${item.ingredient_id} purchase quantity does not match its reviewed conversion`);
  assert(item.purchase_state === ingredient.purchase_state, `${item.ingredient_id} purchase state is incorrect`);
  assert(item.conversion_applied === ingredient.purchase_conversion_reviewed, `${item.ingredient_id} conversion flag is incorrect`);
  assert(typeof item.quantity_label === "string" && item.quantity_label.length > 1, `${item.ingredient_id} lacks a useful purchase quantity`);
  assert(!Object.prototype.hasOwnProperty.call(item, "household_quantity"), `${item.ingredient_id} repeats quantity in a household column`);
  assert(!/\b(bottle|bag|pack|package|box)\b/i.test(item.quantity_label), `${item.ingredient_id} invents a package size`);
  if (!/\b(g|kg)\b/.test(item.quantity_label)) {
    assert(/^\d+\s/.test(item.quantity_label), `${item.ingredient_id} uses a fractional countable shopping quantity`);
  }
  if (ingredient.purchase_conversion_reviewed) {
    reviewedConversions += 1;
    if (ingredient.purchase_state === "raw") rawConversions += 1;
    if (ingredient.purchase_state === "dry") dryConversions += 1;
  }
  if (!/\b(g|kg)\b/.test(item.quantity_label)) countableLabels += 1;
}

assert(reviewedConversions > 0, "No reviewed purchase conversions were exercised");
assert(rawConversions > 0, "No cooked-to-raw conversion was exercised");
assert(dryConversions > 0, "No cooked-to-dry conversion was exercised");
assert(countableLabels > 0, "Countable produce or pantry quantities were not formatted for shopping");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.grocery_list.v1",
  canonical_items: groceryItems.length,
  duplicate_ids: 0,
  reviewed_conversions: reviewedConversions,
  raw_conversions: rawConversions,
  dry_conversions: dryConversions,
  countable_quantity_labels: countableLabels,
  repeated_household_column: false,
  invented_package_sizes: false
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
