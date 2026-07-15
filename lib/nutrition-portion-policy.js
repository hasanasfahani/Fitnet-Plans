(function attachNutritionPortionPolicy(root) {
  const animalProteins = new Set([
    "chicken_breast_cooked", "chicken_thigh_cooked", "turkey_breast_cooked",
    "beef_lean_cooked", "lamb_lean_cooked", "salmon_cooked",
    "white_fish_cooked", "shrimp_cooked"
  ]);
  const cookedGrains = new Set([
    "rice_brown_cooked", "rice_basmati_cooked", "quinoa_cooked",
    "bulgur_cooked", "couscous_cooked"
  ]);
  const leafyVegetables = new Set(["spinach", "lettuce", "mixed_salad"]);
  const seasoningIds = new Set([
    "zaatar", "herbs_spices", "shawarma_spice", "kofta_spice",
    "kabsa_spice", "fajita_spice", "italian_herbs", "cumin_coriander_spice"
  ]);

  function portionRange(ingredientId, role, mealSlot) {
    const slot = String(mealSlot || "lunch");
    if (animalProteins.has(ingredientId)) {
      if (slot === "breakfast") return [80, 180];
      if (slot === "snack") return [50, 120];
      return [100, 220];
    }
    if (ingredientId === "smoked_salmon") return slot === "snack" ? [40, 80] : [60, 120];
    if (ingredientId === "tuna_water_drained") return slot === "snack" ? [60, 100] : [80, 140];
    if (["egg_whole_cooked", "egg_white_cooked"].includes(ingredientId)) return slot === "snack" ? [50, 120] : [100, 200];
    if (ingredientId === "whey_halal") return [20, 40];
    if (ingredientId === "tofu_firm") return slot === "snack" ? [70, 180] : [100, 300];
    if (["lentils_cooked", "chickpeas_cooked"].includes(ingredientId)) return slot === "snack" ? [70, 160] : [100, 200];
    if (["greek_yogurt_plain", "cottage_cheese", "labneh", "halloumi"].includes(ingredientId)) {
      return slot === "snack" ? [50, 180] : [60, 250];
    }
    if (cookedGrains.has(ingredientId)) return [100, 300];
    if (ingredientId === "pasta_wholewheat_cooked") return [120, 300];
    if (["potato_roasted", "sweet_potato_cooked"].includes(ingredientId)) return [150, 300];
    if (ingredientId === "corn_tortilla") return [28, 112];
    if (ingredientId === "pita_wholewheat") return [30, 120];
    if (ingredientId === "olive_oil") return [5, 15];
    if (["tahini", "hummus"].includes(ingredientId)) return [15, 45];
    if (["almonds", "walnuts"].includes(ingredientId)) return [15, 40];
    if (ingredientId === "avocado") return [30, 120];
    if (ingredientId === "dates") return [16, 50];
    if (leafyVegetables.has(ingredientId)) return slot === "snack" ? [30, 120] : [30, 150];
    if (role === "vegetable") return slot === "snack" ? [40, 180] : [50, 250];
    if (role === "fruit") return [80, 220];
    if (seasoningIds.has(ingredientId) || role === "seasoning") return [2, 6];
    if (role === "sauce") return ingredientId === "tomato_sauce" ? [15, 80] : [15, 45];
    return [5, 350];
  }

  function clampQuantity(grams, ingredientId, role, mealSlot) {
    const [minimum, maximum] = portionRange(ingredientId, role, mealSlot);
    return roundQuantity(Math.min(Math.max(Number(grams || 0), minimum), maximum));
  }

  function roundQuantity(grams) {
    const value = Number(grams || 0);
    if (value < 10) return Math.max(1, Math.round(value));
    return Math.max(5, Math.round(value / 5) * 5);
  }

  function isScalableRole(role) {
    return [
      "primary_protein", "secondary_protein", "carb_base", "fat_source",
      "vegetable", "leafy_vegetable", "fruit", "legume"
    ].includes(role);
  }

  function mealCalorieLimit(mealSlot, dailyCalorieTarget = 0, requestedMealsPerDay = 0) {
    if (mealSlot === "snack") return 450;
    if (mealSlot === "breakfast") return 650;
    if (["lunch", "dinner"].includes(mealSlot)) return Number(dailyCalorieTarget || 0) >= 2900 || Number(requestedMealsPerDay || 0) === 2 ? 1000 : 900;
    return 900;
  }

  function formatHouseholdQuantity(grams, ingredient) {
    const value = Number(grams || 0);
    const unitGrams = Number(ingredient?.household_unit_grams || 0);
    const unit = String(ingredient?.household_unit || "").trim();
    if (!value || !unitGrams || !unit) return `${Math.round(value)} g`;

    let quantity = value / unitGrams;
    let displayUnit = unit;
    let displayUnitGrams = unitGrams;
    let increment = 0.5;

    if (unit === "tablespoon" && quantity < 1) {
      quantity *= 3;
      displayUnit = "teaspoon";
      displayUnitGrams /= 3;
      increment = 0.25;
    } else if (unit === "cup" && quantity < 0.25) {
      quantity *= 16;
      displayUnit = "tablespoon";
      displayUnitGrams /= 16;
      increment = 0.25;
    } else if (["cup", "tablespoon", "teaspoon", "small handful", "serving"].includes(unit)) {
      increment = 0.25;
    } else if (["egg", "egg white", "slice", "date", "spear"].includes(unit)) {
      increment = 1;
    } else if (unit === "avocado") {
      increment = 0.25;
    } else if (["fillet", "can", "block", "pita", "tortilla", "scoop"].includes(unit)) {
      increment = quantity < 1 ? 0.25 : 0.5;
    }

    const rounded = Math.max(increment, Math.round(quantity / increment) * increment);
    const impliedGrams = rounded * displayUnitGrams;
    if (Math.abs(impliedGrams - value) > Math.max(12, value * 0.25)) return `${Math.round(value)} g`;
    return `${formatFraction(rounded)} ${pluralizeHouseholdUnit(displayUnit, rounded)}`;
  }

  function formatFraction(value) {
    const whole = Math.floor(value);
    const fraction = Math.round((value - whole) * 4);
    const labels = { 1: "1/4", 2: "1/2", 3: "3/4" };
    if (fraction === 0) return String(whole);
    if (fraction === 4) return String(whole + 1);
    return whole ? `${whole} ${labels[fraction]}` : labels[fraction];
  }

  function pluralizeHouseholdUnit(unit, quantity) {
    if (quantity <= 1) return unit;
    const irregular = {
      "medium tomato": "medium tomatoes",
      "medium potato": "medium potatoes",
      "half avocado": "half avocados"
    };
    return irregular[unit] || `${unit}s`;
  }

  const api = {
    version: "fitnet.nutrition.portions.v1",
    portionRange,
    clampQuantity,
    roundQuantity,
    isScalableRole,
    mealCalorieLimit,
    formatHouseholdQuantity
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FitnetNutritionPortionPolicy = api;
})(typeof window !== "undefined" ? window : globalThis);
