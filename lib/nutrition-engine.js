(function attachNutritionEngine(root) {
  const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack", "snack_2", "snack_3"];
  const PORTION_POLICY = typeof module !== "undefined" && module.exports
    ? require("./nutrition-portion-policy")
    : root.FitnetNutritionPortionPolicy;
  const NUTRITION_QUALITY_THRESHOLD = 85;
  const CALORIE_CALCULATION_VERSION = "fitnet.calorie_target.v2";
  const ACTIVITY_MULTIPLIERS = {
    "Mostly sitting": 1.2,
    "Lightly active": 1.35,
    "Moderately active": 1.5,
    "Very active": 1.7
  };
  const NUTRITION_QUALITY_WEIGHTS = {
    macro_balance: 25,
    portion_realism: 15,
    weekly_variety: 15,
    sodium_awareness: 10,
    fiber_compliance: 10,
    recipe_authenticity: 10,
    grocery_practicality: 10,
    preference_match: 5
  };

  const DIET_TAG_MAP = {
    Balanced: "balanced",
    "High Protein": "high_protein",
    "Low Carb": "low_carb",
    Mediterranean: "mediterranean",
    Vegetarian: "vegetarian"
  };

  const ALLERGY_TAG_MAP = {
    Nuts: "nuts",
    Shellfish: "shellfish",
    Eggs: "eggs",
    Dairy: "dairy",
    Soy: "soy",
    Fish: "fish",
    Gluten: "gluten"
  };

  const RESTRICTION_TAG_MAP = {
    "Gluten-free": "gluten",
    "Dairy-free": "dairy",
    "No red meat": "red_meat"
  };
  const SUPPORTED_RESTRICTIONS = new Set(["None", ...Object.keys(RESTRICTION_TAG_MAP)]);

  function generateNutritionPlan(input, foodLibrary, options = {}) {
    const normalized = normalizeNutritionInput(input);
    const skeleton = buildNutritionSkeleton(normalized);
    const candidateMap = filterFoodCandidates(skeleton, normalized, foodLibrary);
    const initialPlan = selectNutritionMeals(skeleton, candidateMap, normalized, options);
    const validation = validateNutritionPlan(initialPlan, skeleton, candidateMap, normalized);

    if (validation.valid) {
      return {
        status: "valid",
        normalized_input: normalized,
        skeleton,
        candidate_map: candidateMap,
        validation,
        plan: initialPlan
      };
    }

    const repairedPlan = repairNutritionPlan(initialPlan, skeleton, candidateMap, validation.errors, normalized);
    const repairedValidation = validateNutritionPlan(repairedPlan, skeleton, candidateMap, normalized);

    if (repairedValidation.valid) {
      return {
        status: "repaired",
        normalized_input: normalized,
        skeleton,
        candidate_map: candidateMap,
        validation: repairedValidation,
        repair_errors: validation.errors,
        plan: repairedPlan
      };
    }

    const fallbackPlan = buildFallbackNutritionPlan(skeleton, candidateMap, normalized);
    const fallbackValidation = validateNutritionPlan(fallbackPlan, skeleton, candidateMap, normalized);

    return {
      status: fallbackValidation.valid ? "fallback" : "failed",
      normalized_input: normalized,
      skeleton,
      candidate_map: candidateMap,
      validation: fallbackValidation,
      repair_errors: [...validation.errors, ...repairedValidation.errors],
      plan: fallbackPlan
    };
  }

  function generateNutritionPlanV2(input, foodLibrary, options = {}) {
    const mealLibrary = normalizeMealLibrary(foodLibrary);
    const normalized = normalizeNutritionInput(input);
    const skeleton = buildSevenDayNutritionSkeleton(normalized);
    const candidateMap = filterMealCandidates(skeleton, normalized, mealLibrary);
    const plan = buildFallbackNutritionPlanV2(skeleton, candidateMap, normalized, mealLibrary, options);
    const validation = validateNutritionPlanV2(plan, skeleton, candidateMap, normalized, mealLibrary, options.ingredientLibrary || []);

    return {
      status: validation.valid ? "valid_v2" : "failed",
      normalized_input: normalized,
      skeleton,
      candidate_map: candidateMap,
      validation,
      plan
    };
  }

  function normalizeNutritionInput(input) {
    const nutrition = input.nutrition || input;
    const goal = input.goal || "Improve Fitness";
    const eligibility = assessNutritionEligibility(input.profile || {}, nutrition, goal);
    if (!eligibility.eligible) {
      const unsupportedRestriction = eligibility.reasons.some((reason) => reason.startsWith("unsupported_dietary_restriction:"));
      const error = new Error(unsupportedRestriction
        ? "Please select dietary restrictions from the supported options."
        : "This automated nutrition plan is not suitable for the supplied profile. Please consult a qualified healthcare professional.");
      error.code = unsupportedRestriction ? "unsupported_dietary_restriction" : "nutrition_safety_referral_required";
      error.reasons = eligibility.reasons;
      throw error;
    }
    const requestedMealsPerDay = clamp(Number(nutrition.meals || 3), 2, 6);
    const calorieCalculation = calculateCalorieTarget(input.profile || {}, goal, nutrition.activityLevel);
    const calorieTarget = calorieCalculation.daily_calorie_target;
    const bodyWeightKg = input.profile?.weight_kg ? Number(input.profile.weight_kg) : weightBandValue(input.profile?.weight_range);
    const minimumTwoMealSnacks = Math.max(2, Math.ceil((calorieTarget * 0.95 - 2000) / 450));
    const addedSnacks = requestedMealsPerDay === 2
      ? clamp(minimumTwoMealSnacks, 2, 3)
      : requestedMealsPerDay === 4 && calorieTarget >= 3000
      ? 1
      : 0;
    const mealsPerDay = requestedMealsPerDay + addedSnacks;
    const macroTargets = estimateMacros(calorieTarget, goal, nutrition.dietStyle || "Balanced", bodyWeightKg, requestedMealsPerDay !== 2);
    const allergyTags = normalizeNoneList(nutrition.allergies).map((item) => ALLERGY_TAG_MAP[item] || item.toLowerCase());
    const restrictionTags = normalizeNoneList(nutrition.restrictions).map((item) => RESTRICTION_TAG_MAP[item]).filter(Boolean);

    return {
      goal,
      meals_per_day: mealsPerDay,
      requested_meals_per_day: requestedMealsPerDay,
      calorie_aware_snacks: addedSnacks,
      diet_style: nutrition.dietStyle || "Balanced",
      diet_tag: DIET_TAG_MAP[nutrition.dietStyle] || "balanced",
      dietary_restrictions: normalizeNoneList(nutrition.restrictions),
      allergy_tags: [...new Set([...allergyTags, ...restrictionTags])],
      cooking_time: nutrition.cookingTime || "Flexible",
      budget: nutrition.budget || "Flexible",
      food_preferences: Array.isArray(nutrition.preferences) ? nutrition.preferences : [],
      food_avoid: normalizeAvoidList(nutrition.food_avoid || nutrition.foodsToAvoid, nutrition.foodAvoidOther),
      calorie_target: calorieTarget,
      calorie_calculation: calorieCalculation,
      activity_level: calorieCalculation.activity_level,
      calorie_range: [Math.round(calorieTarget * 0.9), Math.round(calorieTarget * 1.1)],
      quality_calorie_range: [Math.ceil(calorieTarget * 0.95), Math.floor(calorieTarget * 1.05)],
      macro_targets: macroTargets,
      protein_ceiling_g: Math.round(bodyWeightKg * 2.2),
      body_weight_kg: bodyWeightKg,
      fiber_target_g: clamp(Math.round(calorieTarget / 100), 22, 40),
      halal_required: true
    };
  }

  function assessNutritionEligibility(profile = {}, nutrition = {}, goal = "Improve Fitness") {
    const reasons = [];
    const age = ageValue(profile);
    const height = profile.height_cm ? Number(profile.height_cm) : heightBandValue(profile.height_range);
    const weight = profile.weight_kg ? Number(profile.weight_kg) : weightBandValue(profile.weight_range);
    const safetyFlags = Array.isArray(nutrition.safetyFlags) ? nutrition.safetyFlags.filter((flag) => flag && flag !== "None") : [];
    const unsupportedRestrictions = (Array.isArray(nutrition.restrictions) ? nutrition.restrictions : [])
      .filter((restriction) => restriction && !SUPPORTED_RESTRICTIONS.has(restriction));

    if (age < 18) reasons.push("adult_only");
    if (!Number.isFinite(height) || height < 120 || height > 230) reasons.push("height_outside_supported_range");
    if (!Number.isFinite(weight) || weight < 35 || weight > 300) reasons.push("weight_outside_supported_range");
    if (safetyFlags.length) reasons.push(...safetyFlags.map((flag) => `clinical_referral:${normalizeToken(flag)}`));
    if (unsupportedRestrictions.length) {
      reasons.push(...unsupportedRestrictions.map((restriction) => `unsupported_dietary_restriction:${normalizeToken(restriction)}`));
    }

    if (!reasons.length) {
      const calculation = calculateCalorieTarget(profile, goal, nutrition.activityLevel);
      const applied = calculation.applied_goal_adjustment_calories;
      if (goal === "Lose Weight" && (applied >= 0 || applied < -500)) reasons.push("safe_deficit_not_available");
      if (goal === "Build Muscle" && (applied < 150 || applied > 250)) reasons.push("safe_surplus_not_available");
      if (goal === "Gain Strength" && (applied < 100 || applied > 200)) reasons.push("safe_surplus_not_available");
      if (["Improve Fitness", "Improve Body Shape"].includes(goal) && applied !== 0) reasons.push("maintenance_target_outside_supported_range");
    }

    return { eligible: reasons.length === 0, reasons };
  }

  function calculateCalorieTarget(profile, goal, requestedActivityLevel) {
    const age = ageValue(profile);
    const heightBase = profile.height_cm ? Number(profile.height_cm) : heightBandValue(profile.height_range);
    const weightBase = profile.weight_kg ? Number(profile.weight_kg) : weightBandValue(profile.weight_range);
    const activityLevel = ACTIVITY_MULTIPLIERS[requestedActivityLevel] ? requestedActivityLevel : "Mostly sitting";
    const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel];
    const sexAdjustment = profile.gender === "Female" ? -161 : profile.gender === "Male" ? 5 : -78;
    const estimatedBmr = Math.round(10 * weightBase + 6.25 * heightBase - 5 * age + sexAdjustment);
    const estimatedMaintenance = roundToTwentyFive(estimatedBmr * activityMultiplier);
    let intendedAdjustment = 0;

    if (goal === "Lose Weight") intendedAdjustment = -clamp(roundToTwentyFive(estimatedMaintenance * 0.15), 250, 500);
    if (goal === "Build Muscle") intendedAdjustment = clamp(roundToTwentyFive(estimatedMaintenance * 0.08), 150, 250);
    if (goal === "Gain Strength") intendedAdjustment = clamp(roundToTwentyFive(estimatedMaintenance * 0.04), 100, 200);

    const minimumCalories = profile.gender === "Female" ? 1200 : 1500;
    const unrestrictedTarget = estimatedMaintenance + intendedAdjustment;
    const dailyCalorieTarget = clamp(roundToTwentyFive(unrestrictedTarget), minimumCalories, 3200);

    return {
      calculation_version: CALORIE_CALCULATION_VERSION,
      target_is_estimate: true,
      estimated_resting_calories: estimatedBmr,
      activity_level: activityLevel,
      activity_multiplier: activityMultiplier,
      activity_source: ACTIVITY_MULTIPLIERS[requestedActivityLevel] ? "user_selected" : "legacy_default",
      estimated_maintenance_calories: estimatedMaintenance,
      intended_goal_adjustment_calories: intendedAdjustment,
      applied_goal_adjustment_calories: dailyCalorieTarget - estimatedMaintenance,
      minimum_calorie_guard: minimumCalories,
      target_was_limited: dailyCalorieTarget !== roundToTwentyFive(unrestrictedTarget),
      daily_calorie_target: dailyCalorieTarget
    };
  }

  function estimateCalories(profile, goal, activityLevel) {
    return calculateCalorieTarget(profile, goal, activityLevel).daily_calorie_target;
  }

  function ageValue(profile) {
    if (profile.birth_date) {
      const birthDate = new Date(profile.birth_date);
      if (!Number.isNaN(birthDate.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const birthdayPassed = monthDiff > 0 || (monthDiff === 0 && today.getDate() >= birthDate.getDate());
        if (!birthdayPassed) {
          age -= 1;
        }
        return clamp(age, 13, 90);
      }
    }

    return ageBandValue(profile.age_range);
  }

  function estimateMacros(calories, goal, dietStyle, bodyWeightKg, carbFreeBreakfast = false) {
    let proteinPerKg = goal === "Improve Fitness" ? 1.6 : 1.8;
    if (dietStyle === "High Protein") proteinPerKg += 0.2;
    if (dietStyle === "Vegetarian") proteinPerKg = Math.min(proteinPerKg, 1.5);
    proteinPerKg = clamp(proteinPerKg, 1.2, 2.2);
    const proteinG = Math.round(Number(bodyWeightKg || 70) * proteinPerKg);
    const proteinCalories = proteinG * 4;
    const fatRatio = dietStyle === "Low Carb" ? null : dietStyle === "Vegetarian" ? 0.35 : carbFreeBreakfast ? 0.405 : 0.35;
    const carbsG = dietStyle === "Low Carb"
      ? Math.round((calories * 0.25) / 4)
      : Math.round((calories - proteinCalories - calories * fatRatio) / 4);
    const fatG = Math.round((calories - proteinCalories - carbsG * 4) / 9);

    return { protein_g: proteinG, carbs_g: Math.max(80, carbsG), fat_g: Math.max(45, fatG) };
  }

  function buildNutritionSkeleton(normalized) {
    const slotNames = nutritionSlotNames(normalized);
    const calorieWeights = weightsForSlots(slotNames, normalized);

    return [
      {
        day_index: 1,
        meals: slotNames.map((slot, index) => {
          const calories = Math.round(normalized.calorie_target * calorieWeights[index]);
          const protein = Math.round(normalized.macro_targets.protein_g * calorieWeights[index]);
          const carbs = Math.round(normalized.macro_targets.carbs_g * calorieWeights[index]);
          const fat = Math.round(normalized.macro_targets.fat_g * calorieWeights[index]);

          return {
            meal_slot: slot,
            slot_id: `day1_${slot}_${index + 1}`,
            calorie_range: [Math.round(calories * 0.75), Math.round(calories * 1.25)],
            macro_targets: {
              protein_g: protein,
              carbs_g: carbs,
              fat_g: fat
            },
            order: index + 1
          };
        })
      }
    ];
  }

  function nutritionSlotNames(normalized) {
    const requested = Number(normalized.requested_meals_per_day || normalized.meals_per_day);
    if (requested === 2) return ["lunch", "dinner", ...Array.from({ length: Number(normalized.calorie_aware_snacks || 0) }, () => "snack")];
    if (requested === 3) return ["breakfast", "lunch", "dinner", ...Array.from({ length: Number(normalized.calorie_aware_snacks || 0) }, () => "snack")];
    if (requested === 4) return ["breakfast", "lunch", "dinner", "snack", ...Array.from({ length: Number(normalized.calorie_aware_snacks || 0) }, () => "snack")];
    if (requested === 5) return ["breakfast", "lunch", "dinner", "snack", "snack"];
    return ["breakfast", "lunch", "dinner", "snack", "snack", "snack"];
  }

  function buildFourWeekNutritionSkeleton(normalized) {
    const base = Array.from({ length: 7 }, (_, dayOffset) => {
      const day = buildNutritionSkeleton(normalized)[0];
      return {
        day_index: dayOffset + 1,
        meals: day.meals.map((meal) => ({
          ...meal,
          slot_id: `day${dayOffset + 1}_${meal.meal_slot}_${meal.order}`
        }))
      };
    });
    const themes = ["Baseline adherence", "Repeat meals with small variety", "Portion awareness", "Adjustment and consistency"];
    return themes.map((theme, index) => ({
      week_index: index + 1,
      week_theme: theme,
      days: base
    }));
  }

  function buildSevenDayNutritionSkeleton(normalized) {
    return Array.from({ length: 7 }, (_, dayOffset) => {
      const day = buildNutritionSkeleton(normalized)[0];
      return {
        day_index: dayOffset + 1,
        day_name: `Day ${dayOffset + 1}`,
        meals: day.meals.map((meal) => ({
          ...meal,
          slot_id: `day${dayOffset + 1}_${meal.meal_slot}_${meal.order}`
        }))
      };
    });
  }

  function weightsForSlots(slots, normalized = {}) {
    if (Number(normalized.requested_meals_per_day) === 2 && slots.length === 3) return [0.3, 0.45, 0.25];
    if (Number(normalized.requested_meals_per_day) === 2 && slots.length === 4) return [0.325, 0.325, 0.175, 0.175];
    if (Number(normalized.requested_meals_per_day) === 2 && slots.length === 5) return [0.3, 0.3, 0.134, 0.133, 0.133];
    if (slots.length === 2) return [0.45, 0.55];
    if (slots.length === 3) return [0.28, 0.36, 0.36];
    if (Number(normalized.requested_meals_per_day) === 3 && slots.length === 4) return [0.22, 0.31, 0.31, 0.16];
    if (slots.length === 4) return [0.25, 0.32, 0.33, 0.1];
    if (slots.length === 5) return [0.22, 0.29, 0.31, 0.09, 0.09];
    return [0.2, 0.26, 0.28, 0.09, 0.08, 0.09];
  }

  function filterFoodCandidates(skeleton, normalized, foodLibrary) {
    const map = {};

    for (const day of skeleton) {
      for (const slot of day.meals) {
        const candidates = foodLibrary
          .filter((food) => isFoodAllowed(food, slot, normalized))
          .sort((a, b) => scoreFood(b, slot, normalized) - scoreFood(a, slot, normalized))
          .slice(0, 10);

        map[slot.slot_id] = candidates;
      }
    }

    return map;
  }

  function isFoodAllowed(food, slot, normalized) {
    if (!food || !food.food_id) return false;
    if (normalized.halal_required && food.halal_status && food.halal_status !== "halal") return false;
    if (!food.meal_type?.includes(slot.meal_slot)) return false;
    if ((food.allergy_tags || []).some((tag) => normalized.allergy_tags.includes(tag))) return false;
    if (normalized.food_avoid.some((item) => food.name.toLowerCase().includes(item))) return false;
    if (normalized.diet_tag === "vegetarian" && !(food.diet_tags || []).includes("vegetarian")) return false;
    return true;
  }

  function scoreFood(food, slot, normalized) {
    let score = 0;

    if ((food.diet_tags || []).includes(normalized.diet_tag)) score += 10;
    if ((food.meal_type || []).includes(slot.meal_slot)) score += 8;
    if (normalized.food_preferences.some((pref) => food.name.toLowerCase().includes(pref.toLowerCase()))) score += 6;
    if (normalized.diet_tag === "high_protein" && food.protein_g >= 15) score += 5;
    if (normalized.diet_tag === "low_carb" && food.carbs_g <= 10) score += 5;
    if (normalized.cooking_time === "Minimal" && ["Greek Yogurt", "Banana", "Blueberries", "Almonds", "Whey Protein Shake"].includes(food.name)) score += 4;
    if (normalized.budget === "Low" && ["Boiled Eggs", "Cooked Basmati Rice", "Rolled Oats", "Banana", "Steamed Broccoli"].includes(food.name)) score += 4;
    score -= Math.abs(food.calories - slot.calorie_range[0]) / 200;

    return score;
  }

  function selectNutritionMeals(skeleton, candidateMap, normalized, options = {}) {
    const meals = skeleton[0].meals.map((slot) => buildMeal(slot, candidateMap[slot.slot_id] || [], normalized, options));
    const dailyTotals = sumMeals(meals);

    return {
      nutrition_days: [
        {
          day_index: 1,
          meals,
          daily_totals: dailyTotals
        }
      ]
    };
  }

  function buildMeal(slot, candidates, normalized, options = {}) {
    const selected = pickFoodsForSlot(slot, candidates, normalized);
    const baseTotals = sumFoods(selected);
    const targetCalories = Math.round((slot.calorie_range[0] + slot.calorie_range[1]) / 2);
    const multiplier = baseTotals.calories > 0 ? clamp(targetCalories / baseTotals.calories, 0.75, 3.5) : 1;
    const totals = scaleTotals(baseTotals, multiplier);

    return {
      meal_slot: slot.meal_slot,
      meal_name: nameMeal(slot.meal_slot, selected),
      food_ids: selected.map((food) => Number(food.food_id)),
      portions: selected.map((food) => ({
        food_id: Number(food.food_id),
        serving_multiplier: Number(multiplier.toFixed(2))
      })),
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      notes: noteForMeal(slot, normalized),
      _food_names: options.includeNames ? selected.map((food) => food.name) : undefined
    };
  }

  function pickFoodsForSlot(slot, candidates, normalized) {
    const selected = [];
    const protein = candidates.find((food) => food.category === "protein");
    const carb = candidates.find((food) => food.category === "carbohydrate");
    const fat = candidates.find((food) => food.category === "fat");
    const produce = candidates.find((food) => food.category === "vegetable" || food.category === "fruit");

    if (protein) selected.push(protein);
    if (slot.meal_slot !== "snack" && normalized.diet_tag !== "low_carb" && carb) selected.push(carb);
    if (slot.meal_slot !== "snack" && produce) selected.push(produce);
    if (fat && selected.length < 3) selected.push(fat);

    if (!selected.length && candidates[0]) selected.push(candidates[0]);

    return selected.slice(0, slot.meal_slot === "snack" ? 2 : 4);
  }

  function validateNutritionPlan(plan, skeleton, candidateMap, normalized) {
    const errors = [];
    const expectedSlots = skeleton.flatMap((day) => day.meals);
    const expectedMealSlots = new Set(expectedSlots.map((slot) => slot.meal_slot));

    if (!plan || !Array.isArray(plan.nutrition_days)) {
      return { valid: false, errors: ["invalid_nutrition_days"] };
    }

    const day = plan.nutrition_days[0];
    if (!day || !Array.isArray(day.meals)) {
      return { valid: false, errors: ["missing_meals"] };
    }

    const seenSlots = new Set();

    for (const meal of day.meals) {
      if (!expectedMealSlots.has(meal.meal_slot)) {
        errors.push(`extra_meal:${meal.meal_slot}`);
        continue;
      }

      if (seenSlots.has(meal.meal_slot)) {
        errors.push(`duplicate_meal:${meal.meal_slot}`);
      }

      seenSlots.add(meal.meal_slot);
      const slot = expectedSlots.find((item) => item.meal_slot === meal.meal_slot);
      const candidates = candidateMap[slot.slot_id] || [];

      for (const foodId of meal.food_ids || []) {
        const food = candidates.find((candidate) => Number(candidate.food_id) === Number(foodId));

        if (!food) {
          errors.push(`invented_or_disallowed_food:${meal.meal_slot}:${foodId}`);
          continue;
        }

        const conflict = (food.allergy_tags || []).find((tag) => normalized.allergy_tags.includes(tag));
        if (conflict) {
          errors.push(`allergy_conflict:${meal.meal_slot}:${foodId}:${conflict}`);
        }
      }

      if (meal.calories < slot.calorie_range[0] || meal.calories > slot.calorie_range[1]) {
        errors.push(`meal_calories_out_of_range:${meal.meal_slot}`);
      }
    }

    for (const slot of expectedMealSlots) {
      if (!seenSlots.has(slot)) {
        errors.push(`missing_meal:${slot}`);
      }
    }

    const totals = day.daily_totals || sumMeals(day.meals);
    const calories = totals.calories || 0;

    if (calories < normalized.calorie_range[0] || calories > normalized.calorie_range[1]) {
      errors.push("daily_calories_outside_allowed_range");
    }

    if ((totals.protein_g || 0) < normalized.macro_targets.protein_g * 0.65) {
      errors.push("daily_protein_too_low");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  function repairNutritionPlan(plan, skeleton, candidateMap, errors, normalized) {
    const repaired = buildFallbackNutritionPlan(skeleton, candidateMap, normalized);
    repaired.repair_notes = errors.slice(0, 8);
    return repaired;
  }

  function buildFallbackNutritionPlan(skeleton, candidateMap, normalized) {
    return selectNutritionMeals(skeleton, candidateMap, normalized);
  }

  function normalizeMealLibrary(mealLibrary = []) {
    return mealLibrary
      .filter((meal) => meal && meal.meal_id && meal.meal_type)
      .map((meal) => ({
        ...meal,
        meal_id: String(meal.meal_id),
        meal_name: String(meal.meal_name || meal.name || "Fitnet Meal"),
        calories: Number(meal.calories || 0),
        protein_g: Number(meal.protein_g || 0),
        carbs_g: Number(meal.carbs_g || 0),
        fat_g: Number(meal.fat_g || 0),
        fiber_g: Number(meal.fiber_g || 0),
        ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
        approved_substitutions: Array.isArray(meal.approved_substitutions) ? meal.approved_substitutions.map(String) : []
      }));
  }

  function normalizeIngredientLibrary(ingredientLibrary = []) {
    return ingredientLibrary.filter((item) => item?.ingredient_id).map((item) => ({
      ...item,
      ingredient_id: String(item.ingredient_id),
      nutrition_per_100g: item.nutrition_per_100g || {},
      allergens: Array.isArray(item.allergens) ? item.allergens : [],
      avoid_tags: Array.isArray(item.avoid_tags) ? item.avoid_tags : []
    }));
  }

  function filterMealCandidates(skeleton, normalized, mealLibrary) {
    const usedByType = {};
    const map = {};

    for (const day of skeleton) {
      for (const slot of day.meals) {
        const mealType = slot.meal_slot === "snack" ? "snack" : slot.meal_slot;
        const allowed = mealLibrary
          .filter((meal) => isMealAllowed(meal, slot, normalized))
          .sort((a, b) => scoreMeal(b, slot, normalized, usedByType[mealType] || new Set()) - scoreMeal(a, slot, normalized, usedByType[mealType] || new Set()));
        const practical = allowed.filter((meal) => practicalCaloriesFitSlot(meal, slot));
        const minimumPracticalCandidates = Number(normalized.requested_meals_per_day) === 2 ? 1 : 3;
        const candidates = (practical.length >= minimumPracticalCandidates ? practical : allowed).slice(0, 12);

        map[slot.slot_id] = candidates;
      }
    }

    return map;
  }

  function practicalCaloriesFitSlot(meal, slot) {
    const practicalMinimum = Number(meal.min_practical_calories || Number(meal.calories || 0) * 0.75);
    const practicalMaximum = Number(meal.max_practical_calories || Number(meal.calories || 0) * 1.25);
    return practicalMaximum >= Number(slot.calorie_range[0] || 0)
      && practicalMinimum <= Number(slot.calorie_range[1] || Number.MAX_SAFE_INTEGER);
  }

  function isMealAllowed(meal, slot, normalized) {
    if (!meal || !meal.meal_id) return false;
    const mealType = slot.meal_slot === "snack" ? "snack" : slot.meal_slot;
    if (meal.meal_type !== mealType) return false;
    if (normalized.halal_required && !(meal.diet_tags || []).includes("halal")) return false;
    if (normalized.diet_tag === "vegetarian" && !(meal.diet_tags || []).includes("vegetarian")) return false;
    if (normalized.diet_tag === "low_carb" && meal.carbs_g > slot.macro_targets.carbs_g * 1.6) return false;
    if (normalized.cooking_time === "Minimal" && Number(meal.cooking_time_minutes || 0) > 20) return false;
    if (normalized.budget === "Low" && meal.budget_level === "high") return false;

    const allergyTags = expandAllergyTags(normalized.allergy_tags);
    const mealConflicts = [...(meal.allergens || []), ...(meal.restrictions || []), ...(meal.avoid_tags || [])]
      .map((tag) => normalizeToken(tag));
    if (mealConflicts.some((tag) => allergyTags.has(tag))) return false;

    const searchable = [meal.meal_name, ...(meal.ingredients || []).map((ingredient) => ingredient.name)]
      .join(" ")
      .toLowerCase();
    if (normalized.food_avoid.some((avoid) => searchable.includes(avoid))) return false;

    if (mealType === "breakfast") {
      if (!meal.suitable_for_breakfast || !meal.savory_breakfast) return false;
      if (meal.contains_sweet_food) return false;
      if (breakfastHasRestrictedCarbs(meal)) return false;
      if (/(cereal|granola|honey|jam|pancake|sweetened yogurt)/i.test(searchable)) return false;
    }

    return true;
  }

  function breakfastHasRestrictedCarbs(meal) {
    if (meal.carb_base || meal.contains_breakfast_carbs) return true;
    return (meal.ingredients || []).some((ingredient) => ["carb_base", "fruit", "legume"].includes(ingredient.ingredient_role));
  }

  function scoreMeal(meal, slot, normalized, usedIds = new Set()) {
    let score = 0;
    if ((meal.goal_tags || []).includes(goalTag(normalized.goal))) score += 12;
    if ((meal.diet_tags || []).includes(normalized.diet_tag)) score += 10;
    if ((meal.diet_tags || []).includes("high_protein") && normalized.macro_targets.protein_g >= 120) score += 4;
    if (meal.protein_g >= slot.macro_targets.protein_g * 0.8) score += 8;
    if (meal.fiber_g >= 4) score += 3;
    if (normalized.cooking_time === "Minimal" && Number(meal.total_time_minutes || meal.cooking_time_minutes || 0) <= 15) score += 6;
    if (normalized.budget === "Low" && meal.budget_level === "low") score += 5;
    if (normalized.food_preferences.some((pref) => mealMatchesPreference(meal, pref))) score += 4;
    const practicalMinimum = Number(meal.min_practical_calories || Number(meal.calories || 0) * 0.75);
    const practicalMaximum = Number(meal.max_practical_calories || Number(meal.calories || 0) * 1.25);
    if (practicalMaximum < Number(slot.calorie_range[0] || 0)) score -= (Number(slot.calorie_range[0]) - practicalMaximum) / 8;
    if (practicalMinimum > Number(slot.calorie_range[1] || Number.MAX_SAFE_INTEGER)) score -= (practicalMinimum - Number(slot.calorie_range[1])) / 8;
    score -= Math.abs(meal.calories - midpoint(slot.calorie_range)) / 45;
    score -= Math.abs(meal.protein_g - slot.macro_targets.protein_g) / 3;
    score -= Math.abs(meal.carbs_g - slot.macro_targets.carbs_g) / 4;
    score -= Math.abs(meal.fat_g - slot.macro_targets.fat_g) / 2;
    if (meal.sodium_risk === "high") score -= 8;
    if (meal.sodium_risk === "moderate") score -= 2;
    if (usedIds.has(meal.meal_id)) score -= 25;
    return score;
  }

  function buildFallbackNutritionPlanV2(skeleton, candidateMap, normalized, mealLibrary, options = {}) {
    const usedMealIds = new Set();
    const days = skeleton.map((day) => {
      const meals = day.meals.map((slot, slotIndex) => {
        const candidates = candidateMap[slot.slot_id] || [];
        const candidateIndex = candidates.length ? (Number(day.day_index || 1) - 1 + slotIndex) % Math.min(candidates.length, 5) : 0;
        const selected = candidates[candidateIndex] || candidates[0] || mealLibrary.find((meal) => meal.meal_type === slot.meal_slot);
        const duplicateReason = selected && usedMealIds.has(selected.meal_id)
          ? "Repeated because it was the best approved option for the daily nutrition targets."
          : null;
        if (selected) usedMealIds.add(selected.meal_id);
        return materializeMeal(slot, selected, normalized, duplicateReason, options);
      });

      repairDayWithOneMealReplacement(meals, day, candidateMap, normalized, options.ingredientLibrary || [], options);
      if (dayQualityPenalty(sumMealsV2(meals), normalized) !== 0) {
        for (let index = 0; index < day.meals.length; index += 1) {
          const slot = day.meals[index];
          const selected = (candidateMap[slot.slot_id] || [])[0];
          meals[index] = materializeMeal(slot, selected, normalized, null, options);
        }
        balanceMaterializedDay(meals, normalized, options.ingredientLibrary || []);
      }

      return {
        day_index: day.day_index,
        day_name: day.day_name || `Day ${day.day_index}`,
        meals,
        daily_totals: sumMealsV2(meals)
      };
    });
    optimizeNutritionWeek(days, skeleton, candidateMap, normalized, mealLibrary, options.ingredientLibrary || [], options);
    improveWeeklyVariety(days, skeleton, candidateMap, normalized, mealLibrary, options.ingredientLibrary || [], options);
    improveWeeklySodium(days, skeleton, candidateMap, normalized, mealLibrary, options.ingredientLibrary || [], options);
    enforceWeeklyRecipeFrequency(days, skeleton, candidateMap, normalized, mealLibrary, options.ingredientLibrary || [], options);
    repairInvalidNutritionDays(days, skeleton, candidateMap, normalized, options.ingredientLibrary || [], options);
    improveWeeklySodium(days, skeleton, candidateMap, normalized, mealLibrary, options.ingredientLibrary || [], options);
    for (const day of days) {
      balanceMaterializedDay(day.meals, normalized, options.ingredientLibrary || []);
      day.daily_totals = sumMealsV2(day.meals);
    }
    repairInvalidNutritionDays(days, skeleton, candidateMap, normalized, options.ingredientLibrary || [], options);
    improveWeeklySodium(days, skeleton, candidateMap, normalized, mealLibrary, options.ingredientLibrary || [], options);
    markConstrainedNutritionVariety(days, mealLibrary);
    markConstrainedSodium(days, mealLibrary);
    markNutritionDuplicateReasons(days);

    return {
      program_version: "fitnet.nutrition.output.v2",
      nutrition_summary: {
        goal: normalized.goal,
        daily_calorie_target: normalized.calorie_target,
        ...calorieCalculationSummary(normalized),
        daily_macro_targets: {
          protein_g: normalized.macro_targets.protein_g,
          carbs_g: normalized.macro_targets.carbs_g,
          fat_g: normalized.macro_targets.fat_g,
          fiber_g: normalized.fiber_target_g
        },
        meals_per_day: normalized.meals_per_day,
        nutrition_rationale: nutritionRationale(normalized)
      },
      days,
      weekly_grocery_list: buildMealGroceryList(days, options.ingredientLibrary || []),
      repeat_instruction: "Repeat this 7-day meal plan for 4 weeks. Keep portions consistent unless Fitnet updates the plan inside the app.",
      safety_notes: [
        "This plan is general nutrition guidance and is not medical advice.",
        "Do not consume any meal that conflicts with an allergy or dietary restriction.",
        "For diabetes, pregnancy, kidney disease, eating disorder history, or medical nutrition needs, consult a qualified clinician."
      ]
    };
  }

  function calorieCalculationSummary(normalized) {
    const calculation = normalized.calorie_calculation || {};
    return {
      calculation_version: calculation.calculation_version || CALORIE_CALCULATION_VERSION,
      target_is_estimate: true,
      estimated_resting_calories: Number(calculation.estimated_resting_calories || 0),
      estimated_maintenance_calories: Number(calculation.estimated_maintenance_calories || 0),
      activity_level: String(calculation.activity_level || normalized.activity_level || "Mostly sitting"),
      goal_adjustment_calories: Number(calculation.applied_goal_adjustment_calories || 0)
    };
  }

  function nutritionRationale(normalized) {
    const calculation = normalized.calorie_calculation || {};
    const adjustment = Number(calculation.applied_goal_adjustment_calories || 0);
    const adjustmentText = adjustment > 0 ? `+${adjustment}` : String(adjustment);
    return `This 7-day plan uses reviewed Fitnet recipes matched to the user's ${normalized.goal.toLowerCase()} goal and dietary needs. The calorie target is an estimate: approximately ${calculation.estimated_maintenance_calories} kcal maintenance, adjusted by ${adjustmentText} kcal for the selected goal, for a daily target of approximately ${normalized.calorie_target} kcal.`;
  }

  function materializeMeal(slot, meal, normalized, duplicateReason, options = {}) {
    if (!meal) {
      const calories = midpoint(slot.calorie_range);
      return {
        meal_slot: slot.meal_slot,
        meal_id: "",
        meal_name: "Approved Fitnet meal",
        ingredients: [],
        cooking_method: "Choose an approved meal from the Fitnet app.",
        calories,
        protein_g: slot.macro_targets.protein_g,
        carbs_g: slot.macro_targets.carbs_g,
        fat_g: slot.macro_targets.fat_g,
        fiber_g: Math.round(normalized.fiber_target_g / normalized.meals_per_day),
        duplicate_reason: duplicateReason
      };
    }

    const ingredientLookup = new Map(normalizeIngredientLibrary(options.ingredientLibrary || []).map((item) => [item.ingredient_id, item]));
    const baseTotals = ingredientLookup.size ? calculateMealNutrition(meal.ingredients, ingredientLookup) : {
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      fiber_g: meal.fiber_g
    };
    const targetCalories = midpoint(slot.calorie_range);
    const requestedScale = baseTotals.calories > 0 ? targetCalories / baseTotals.calories : 1;
    const scale = clamp(requestedScale, Number(meal.min_serving_multiplier || 0.75), Number(meal.max_serving_multiplier || 1.25));
    const scalableIds = new Set(meal.scalable_ingredients || []);
    const ingredients = meal.ingredients.map((ingredient) => {
      const ingredientId = String(ingredient.ingredient_id || "");
      const role = String(ingredient.ingredient_role || "garnish");
      const shouldScale = scalableIds.has(ingredientId) && PORTION_POLICY.isScalableRole(role);
      const proposedGrams = Number(ingredient.quantity_g || 0) * (shouldScale ? scale : 1);
      const quantity = PORTION_POLICY.clampQuantity(proposedGrams, ingredientId, role, slot.meal_slot);
      return {
        ingredient_id: ingredientId,
        name: userFacingIngredientName(ingredient.name || ""),
        quantity_g: quantity,
        household_quantity: householdQuantityFromGrams(quantity, ingredientLookup.get(ingredientId)),
        category: String(ingredient.category || "Pantry"),
        ingredient_role: role
      };
    });
    enforceMealCalorieLimit(ingredients, slot.meal_slot, ingredientLookup, normalized);
    const totals = ingredientLookup.size ? calculateMealNutrition(ingredients, ingredientLookup) : scaleNutritionTotals(baseTotals, scale);

    return {
      meal_slot: slot.meal_slot,
      meal_id: meal.meal_id,
      meal_name: meal.meal_name,
      ingredients,
      cooking_method: Array.isArray(meal.cooking_method)
        ? meal.cooking_method.join(" ")
        : String(meal.cooking_method || "Prepare the listed ingredients and season to taste."),
      prep_time_minutes: Number(meal.prep_time_minutes || 0),
      cooking_time_minutes: Number(meal.cooking_time_minutes || 0),
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      fiber_g: totals.fiber_g,
      duplicate_reason: duplicateReason,
      _meal_name: options.includeNames ? meal.meal_name : undefined
    };
  }

  function materializeNutritionSelectionV2(selection, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options = {}) {
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const selectedDays = Array.isArray(selection?.days) ? selection.days : [];
    const usedByType = {};
    const days = skeleton.map((day) => {
      const selectedDay = selectedDays.find((item) => Number(item.day_index) === Number(day.day_index));
      const selections = Array.isArray(selectedDay?.meals) ? selectedDay.meals : [];
      const meals = day.meals.map((slot, index) => {
        const selected = selections[index] || {};
        const candidates = candidateMap[slot.slot_id] || [];
        const candidateIds = new Set(candidates.map((meal) => String(meal.meal_id)));
        const mealId = String(selected.meal_id || "");
        const meal = candidateIds.has(mealId) ? mealLookup.get(mealId) : null;
        const mealType = slot.meal_slot === "snack" ? "snack" : slot.meal_slot;
        usedByType[mealType] = usedByType[mealType] || new Set();
        const duplicateReason = meal && usedByType[mealType].has(mealId)
          ? "Repeated because no unused approved option was selected for this meal slot."
          : null;
        if (meal) usedByType[mealType].add(mealId);
        return materializeMeal(slot, meal, normalized, duplicateReason, { ...options, ingredientLibrary });
      });
      repairDayWithOneMealReplacement(meals, day, candidateMap, normalized, ingredientLibrary, options);
      return { day_index: day.day_index, day_name: day.day_name || `Day ${day.day_index}`, meals, daily_totals: sumMealsV2(meals) };
    });
    optimizeNutritionWeek(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options);
    improveWeeklyVariety(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options);
    improveWeeklySodium(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options);
    enforceWeeklyRecipeFrequency(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options);
    repairInvalidNutritionDays(days, skeleton, candidateMap, normalized, ingredientLibrary, options);
    improveWeeklySodium(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options);
    for (const day of days) {
      balanceMaterializedDay(day.meals, normalized, ingredientLibrary);
      day.daily_totals = sumMealsV2(day.meals);
    }
    repairInvalidNutritionDays(days, skeleton, candidateMap, normalized, ingredientLibrary, options);
    improveWeeklySodium(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options);
    markConstrainedNutritionVariety(days, mealLibrary);
    markConstrainedSodium(days, mealLibrary);
    markNutritionDuplicateReasons(days);

    return {
      program_version: "fitnet.nutrition.output.v2",
      nutrition_summary: {
        goal: normalized.goal,
        daily_calorie_target: normalized.calorie_target,
        ...calorieCalculationSummary(normalized),
        daily_macro_targets: { ...normalized.macro_targets, fiber_g: normalized.fiber_target_g },
        meals_per_day: normalized.meals_per_day,
        requested_meals_per_day: normalized.requested_meals_per_day,
        calorie_aware_snacks: normalized.calorie_aware_snacks,
        nutrition_rationale: nutritionRationale(normalized)
      },
      days,
      weekly_grocery_list: buildMealGroceryList(days, ingredientLibrary),
      repeat_instruction: "Repeat this 7-day meal plan for 4 weeks. Keep portions consistent unless Fitnet updates the plan inside the app.",
      safety_notes: [
        "This plan is general nutrition guidance and is not medical advice.",
        "Do not use any meal containing an ingredient that conflicts with your allergy or dietary needs.",
        "For diabetes, pregnancy, kidney disease, eating disorder history, or medical nutrition needs, consult a qualified clinician."
      ]
    };
  }

  function calculateMealNutrition(rows, ingredientLookup) {
    const totals = rows.reduce((sum, row) => {
      const ingredient = ingredientLookup.get(String(row.ingredient_id || ""));
      if (!ingredient) return sum;
      const factor = Number(row.quantity_g || 0) / 100;
      for (const key of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]) {
        sum[key] += Number(ingredient.nutrition_per_100g?.[key] || 0) * factor;
      }
      return sum;
    }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value)]));
  }

  function enforceMealCalorieLimit(rows, mealSlot, ingredientLookup, normalized = {}) {
    const maximum = PORTION_POLICY.mealCalorieLimit(mealSlot, normalized.calorie_target, normalized.requested_meals_per_day);
    if (!Number.isFinite(maximum)) return;
    for (let attempt = 0; attempt < 8 && calculateMealNutrition(rows, ingredientLookup).calories > maximum; attempt += 1) {
      const factor = maximum / calculateMealNutrition(rows, ingredientLookup).calories;
      for (const row of rows) {
        if (!PORTION_POLICY.isScalableRole(row.ingredient_role)) continue;
        row.quantity_g = PORTION_POLICY.clampQuantity(row.quantity_g * factor, row.ingredient_id, row.ingredient_role, mealSlot);
        row.household_quantity = householdQuantityFromGrams(row.quantity_g, ingredientLookup.get(row.ingredient_id));
      }
      if (calculateMealNutrition(rows, ingredientLookup).calories <= maximum) break;
      const reducible = rows
        .filter((row) => {
          const [minimum] = PORTION_POLICY.portionRange(row.ingredient_id, row.ingredient_role, mealSlot);
          return PORTION_POLICY.isScalableRole(row.ingredient_role) && row.quantity_g > minimum;
        })
        .sort((a, b) => Number(ingredientLookup.get(b.ingredient_id)?.nutrition_per_100g?.calories || 0) - Number(ingredientLookup.get(a.ingredient_id)?.nutrition_per_100g?.calories || 0))[0];
      if (!reducible) break;
      const [minimum] = PORTION_POLICY.portionRange(reducible.ingredient_id, reducible.ingredient_role, mealSlot);
      reducible.quantity_g = Math.max(minimum, reducible.quantity_g - 5);
      reducible.household_quantity = householdQuantityFromGrams(reducible.quantity_g, ingredientLookup.get(reducible.ingredient_id));
    }
  }

  function scaleNutritionTotals(totals, scale) {
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(Number(value || 0) * scale)]));
  }

  function balanceMaterializedDay(meals, normalized, ingredientLibrary) {
    const ingredientLookup = new Map(normalizeIngredientLibrary(ingredientLibrary).map((item) => [item.ingredient_id, item]));
    if (!ingredientLookup.size) return;
    const ranges = nutritionQualityRanges(normalized);
    for (let attempt = 0; attempt < 400; attempt += 1) {
      refreshMealNutrition(meals, ingredientLookup);
      for (const meal of meals) enforceMealProteinLimit(meal, ingredientLookup);
      refreshMealNutrition(meals, ingredientLookup);
      const totals = sumMealsV2(meals);
      let changed = false;
      const actions = [];
      if (totals.protein_g > ranges.protein[1]) actions.push(() => adjustMacroPortion(meals, ingredientLookup, "protein_g", -1, normalized));
      if (totals.fat_g > ranges.fat[1]) actions.push(() => adjustMacroPortion(meals, ingredientLookup, "fat_g", -1, normalized));
      if (totals.carbs_g > ranges.carbs[1]) actions.push(() => adjustMacroPortion(meals, ingredientLookup, "carbs_g", -1, normalized));
      if (totals.calories > ranges.calories[1]) actions.push(() => reduceExcessCalories(meals, ingredientLookup, totals, normalized));
      if (totals.protein_g < ranges.protein[0]) actions.push(() => adjustMacroPortion(meals, ingredientLookup, "protein_g", 1, normalized));
      if (totals.carbs_g < ranges.carbs[0]) actions.push(() => adjustMacroPortion(meals, ingredientLookup, "carbs_g", 1, normalized));
      if (totals.fat_g < ranges.fat[0]) actions.push(() => adjustMacroPortion(meals, ingredientLookup, "fat_g", 1, normalized));
      if (totals.fiber_g < ranges.fiber[0]) actions.push(() => adjustMacroPortion(meals, ingredientLookup, "fiber_g", 1, normalized));
      if (totals.calories < ranges.calories[0]) actions.push(() => addMissingCalories(meals, ingredientLookup, totals, normalized, ranges));
      for (const action of actions) {
        if (action()) {
          changed = true;
          break;
        }
      }
      if (actions.length === 0) break;
      if (!changed) break;
    }
    for (const meal of meals) {
      enforceMealCalorieLimit(meal.ingredients || [], meal.meal_slot, ingredientLookup, normalized);
      enforceMealProteinLimit(meal, ingredientLookup);
      Object.assign(meal, calculateMealNutrition(meal.ingredients || [], ingredientLookup));
    }
  }

  function mealProteinLimit(mealSlot) {
    return mealSlot === "snack" ? 30 : 60;
  }

  function enforceMealProteinLimit(meal, ingredientLookup) {
    const maximum = mealProteinLimit(meal.meal_slot);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const totals = calculateMealNutrition(meal.ingredients || [], ingredientLookup);
      if (totals.protein_g <= maximum) break;
      const reducible = (meal.ingredients || [])
        .filter((row) => ["primary_protein", "secondary_protein", "legume"].includes(row.ingredient_role))
        .map((row) => ({ row, minimum: PORTION_POLICY.portionRange(row.ingredient_id, row.ingredient_role, meal.meal_slot)[0] }))
        .filter(({ row, minimum }) => row.quantity_g > minimum)
        .sort((a, b) => Number(ingredientLookup.get(b.row.ingredient_id)?.nutrition_per_100g?.protein_g || 0) - Number(ingredientLookup.get(a.row.ingredient_id)?.nutrition_per_100g?.protein_g || 0))[0];
      if (!reducible) break;
      reducible.row.quantity_g = Math.max(reducible.minimum, reducible.row.quantity_g - 5);
      reducible.row.household_quantity = householdQuantityFromGrams(reducible.row.quantity_g, ingredientLookup.get(reducible.row.ingredient_id));
    }
    Object.assign(meal, calculateMealNutrition(meal.ingredients || [], ingredientLookup));
  }

  function nutritionQualityRanges(normalized) {
    const proteinMaximum = Math.min(Math.ceil(normalized.macro_targets.protein_g * 1.1), normalized.protein_ceiling_g);
    return {
      calories: normalized.quality_calorie_range || [normalized.calorie_target * 0.95, normalized.calorie_target * 1.05],
      protein: [normalized.macro_targets.protein_g * 0.9, proteinMaximum],
      carbs: [normalized.macro_targets.carbs_g * 0.85, normalized.macro_targets.carbs_g * 1.15],
      fat: [normalized.macro_targets.fat_g * 0.85, normalized.macro_targets.fat_g * 1.15],
      fiber: [normalized.fiber_target_g, Number.POSITIVE_INFINITY]
    };
  }

  function repairDayWithOneMealReplacement(meals, day, candidateMap, normalized, ingredientLibrary, options = {}) {
    balanceMaterializedDay(meals, normalized, ingredientLibrary);
    let bestMeals = meals;
    let bestPenalty = dayQualityPenalty(sumMealsV2(meals), normalized);
    if (bestPenalty === 0) return;

    for (let index = 0; index < day.meals.length; index += 1) {
      const slot = day.meals[index];
      for (const candidate of (candidateMap[slot.slot_id] || []).slice(0, 8)) {
        if (candidate.meal_id === meals[index]?.meal_id) continue;
        const trial = JSON.parse(JSON.stringify(meals));
        trial[index] = materializeMeal(
          slot,
          candidate,
          normalized,
          "Adjusted to keep daily nutrition within practical targets.",
          { ...options, ingredientLibrary }
        );
        balanceMaterializedDay(trial, normalized, ingredientLibrary);
        const penalty = dayQualityPenalty(sumMealsV2(trial), normalized);
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestMeals = trial;
        }
        if (bestPenalty === 0) break;
      }
      if (bestPenalty === 0) break;
    }

    if (bestMeals !== meals) meals.splice(0, meals.length, ...bestMeals);
  }

  function repairInvalidNutritionDays(days, skeleton, candidateMap, normalized, ingredientLibrary, options = {}) {
    const weeklyCounts = days.flatMap((day) => day.meals || []).reduce((counts, meal) => {
      counts.set(meal.meal_id, Number(counts.get(meal.meal_id) || 0) + 1);
      return counts;
    }, new Map());
    for (const day of days) {
      for (const meal of day.meals || []) weeklyCounts.set(meal.meal_id, Math.max(0, Number(weeklyCounts.get(meal.meal_id) || 0) - 1));
      if (dayQualityPenalty(sumMealsV2(day.meals), normalized) === 0) {
        for (const meal of day.meals || []) weeklyCounts.set(meal.meal_id, Number(weeklyCounts.get(meal.meal_id) || 0) + 1);
        continue;
      }
      const skeletonDay = skeleton.find((item) => Number(item.day_index) === Number(day.day_index));
      if (!skeletonDay) {
        for (const meal of day.meals || []) weeklyCounts.set(meal.meal_id, Number(weeklyCounts.get(meal.meal_id) || 0) + 1);
        continue;
      }

      let bestMeals = day.meals;
      let bestScore = dayQualityPenalty(sumMealsV2(day.meals), normalized) * 100 + weeklyRepeatPenalty(day.meals, weeklyCounts);
      for (let left = 0; left < skeletonDay.meals.length; left += 1) {
        for (let right = left + 1; right < skeletonDay.meals.length; right += 1) {
          const leftSlot = skeletonDay.meals[left];
          const rightSlot = skeletonDay.meals[right];
          for (const leftCandidate of (candidateMap[leftSlot.slot_id] || []).slice(0, 5)) {
            for (const rightCandidate of (candidateMap[rightSlot.slot_id] || []).slice(0, 5)) {
              const trial = JSON.parse(JSON.stringify(day.meals));
              trial[left] = materializeMeal(leftSlot, leftCandidate, normalized, null, { ...options, ingredientLibrary });
              trial[right] = materializeMeal(rightSlot, rightCandidate, normalized, null, { ...options, ingredientLibrary });
              balanceMaterializedDay(trial, normalized, ingredientLibrary);
              const penalty = dayQualityPenalty(sumMealsV2(trial), normalized);
              const score = penalty * 100 + weeklyRepeatPenalty(trial, weeklyCounts);
              if (score < bestScore) {
                bestScore = score;
                bestMeals = trial;
              }
            }
          }
        }
      }
      if (bestMeals !== day.meals) day.meals = bestMeals;
      day.daily_totals = sumMealsV2(day.meals);
      for (const meal of day.meals || []) weeklyCounts.set(meal.meal_id, Number(weeklyCounts.get(meal.meal_id) || 0) + 1);
    }
  }

  function weeklyRepeatPenalty(meals, weeklyCounts) {
    const additions = new Map();
    for (const meal of meals || []) additions.set(meal.meal_id, Number(additions.get(meal.meal_id) || 0) + 1);
    let penalty = 0;
    for (const [mealId, count] of additions) penalty += Math.max(0, Number(weeklyCounts.get(mealId) || 0) + count - 2);
    return penalty;
  }

  function markConstrainedNutritionVariety(days, mealLibrary) {
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const weeklyCounts = new Map();
    const previousByType = {};
    for (const day of days) {
      const familyCounts = countDayProteinFamilies(day.meals || [], mealLookup);
      const familySeen = new Map();
      for (const meal of day.meals || []) {
        const type = meal.meal_slot || "meal";
        const family = mealLookup.get(meal.meal_id)?.protein_family;
        if (family) {
          familySeen.set(family, Number(familySeen.get(family) || 0) + 1);
          if (Number(familyCounts.get(family) || 0) > 2 && familySeen.get(family) > 2) {
            appendVarietyReason(meal, "Protein variety was limited because no approved alternative preserved the daily nutrition targets.");
          }
        }
        const count = Number(weeklyCounts.get(meal.meal_id) || 0);
        if (count >= 2 || previousByType[type] === meal.meal_id) {
          appendVarietyReason(meal, "Recipe frequency was limited because no approved alternative preserved daily nutrition targets.");
        }
        weeklyCounts.set(meal.meal_id, count + 1);
        previousByType[type] = meal.meal_id;
      }
    }
    const selectedCarbs = new Set(days
      .flatMap((day) => day.meals || [])
      .map((meal) => mealLookup.get(meal.meal_id)?.carb_base)
      .filter(Boolean));
    if (selectedCarbs.size < 3) {
      const meal = days.flatMap((day) => day.meals || []).find((item) => mealLookup.get(item.meal_id)?.carb_base);
      if (meal) appendVarietyReason(meal, "Carbohydrate variety was limited because no approved alternative preserved the daily nutrition targets.");
    }
  }

  function appendVarietyReason(meal, reason) {
    if (!String(meal.variety_reason || "").includes(reason)) {
      meal.variety_reason = [meal.variety_reason, reason].filter(Boolean).join(" ");
    }
  }

  function markNutritionDuplicateReasons(days) {
    const seenByType = {};
    for (const day of days) {
      for (const meal of day.meals || []) {
        const type = meal.meal_slot || "meal";
        seenByType[type] = seenByType[type] || new Set();
        if (seenByType[type].has(meal.meal_id) && !meal.duplicate_reason) {
          meal.duplicate_reason = "Repeated because it was the best approved option for the daily nutrition targets.";
        }
        seenByType[type].add(meal.meal_id);
      }
    }
  }

  function optimizeNutritionWeek(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options = {}) {
    if (!ingredientLibrary.length) return;
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const weeklyCounts = days.flatMap((day) => day.meals || []).reduce((counts, meal) => {
      counts.set(meal.meal_id, Number(counts.get(meal.meal_id) || 0) + 1);
      return counts;
    }, new Map());

    for (const day of days) {
      const skeletonDay = skeleton.find((item) => Number(item.day_index) === Number(day.day_index));
      if (!skeletonDay) continue;
      let bestMeals = day.meals;
      let bestScore = nutritionDayPreferenceScore(day.meals, normalized, mealLookup, weeklyCounts);

      for (let index = 0; index < skeletonDay.meals.length; index += 1) {
        const slot = skeletonDay.meals[index];
        const candidateLimit = normalized.calorie_target >= 2900 ? 8 : 4;
        for (const candidate of (candidateMap[slot.slot_id] || []).slice(0, candidateLimit)) {
          if (candidate.meal_id === day.meals[index]?.meal_id) continue;
          const trial = JSON.parse(JSON.stringify(day.meals));
          trial[index] = materializeMeal(slot, candidate, normalized, null, { ...options, ingredientLibrary });
          const score = nutritionDayPreferenceScore(trial, normalized, mealLookup, weeklyCounts);
          if (score + 0.01 < bestScore) {
            bestScore = score;
            bestMeals = trial;
          }
        }
      }

      if (bestMeals !== day.meals) {
        for (const meal of day.meals) weeklyCounts.set(meal.meal_id, Math.max(0, Number(weeklyCounts.get(meal.meal_id) || 0) - 1));
        day.meals = bestMeals;
        balanceMaterializedDay(day.meals, normalized, ingredientLibrary);
        for (const meal of day.meals) weeklyCounts.set(meal.meal_id, Number(weeklyCounts.get(meal.meal_id) || 0) + 1);
      }
      day.daily_totals = sumMealsV2(day.meals);
    }
  }

  function nutritionDayPreferenceScore(meals, normalized, mealLookup, weeklyCounts = new Map()) {
    const totals = sumMealsV2(meals);
    const relative = (value, target) => Math.abs(Number(value || 0) - Number(target || 0)) / Math.max(1, Number(target || 0));
    let score = relative(totals.calories, normalized.calorie_target) * 12
      + relative(totals.protein_g, normalized.macro_targets.protein_g) * 5
      + relative(totals.carbs_g, normalized.macro_targets.carbs_g) * 8
      + relative(totals.fat_g, normalized.macro_targets.fat_g) * 8;

    const mainFamilies = new Map();
    for (const meal of meals || []) {
      const metadata = mealLookup.get(meal.meal_id);
      if (["breakfast", "lunch", "dinner"].includes(meal.meal_slot) && metadata?.protein_family) {
        mainFamilies.set(metadata.protein_family, Number(mainFamilies.get(metadata.protein_family) || 0) + 1);
      }
      if (Number(meal.fat_g || 0) > (meal.meal_slot === "breakfast" ? 40 : 45)) score += 2;
      score += Math.max(0, Number(weeklyCounts.get(meal.meal_id) || 0) - 2) * 3;
      for (const ingredient of meal.ingredients || []) {
        if (ingredient.ingredient_role === "sauce" && Number(ingredient.quantity_g || 0) > 45) score += 20;
      }
    }
    for (const count of mainFamilies.values()) score += Math.max(0, count - 1) * 8;
    return score;
  }

  function improveWeeklyVariety(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options = {}) {
    if (!ingredientLibrary.length) return;
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const usedByType = {};
    const weekFamilies = new Set();
    const weekCarbs = new Set();

    for (const day of days) {
      const skeletonDay = skeleton.find((item) => Number(item.day_index) === Number(day.day_index));
      if (!skeletonDay) continue;
      for (let index = 0; index < day.meals.length; index += 1) {
        const meal = day.meals[index];
        const slot = skeletonDay.meals[index];
        const type = meal.meal_slot || slot.meal_slot;
        usedByType[type] = usedByType[type] || new Set();
        const metadata = mealLookup.get(meal.meal_id);
        if (!metadata) continue;
        const familyCounts = countDayProteinFamilies(day.meals, mealLookup);
        const duplicate = usedByType[type].has(meal.meal_id);
        const familyOverused = ["breakfast", "lunch", "dinner"].includes(type)
          ? (day.meals || []).filter((item) => ["breakfast", "lunch", "dinner"].includes(item.meal_slot) && mealLookup.get(item.meal_id)?.protein_family === metadata.protein_family).length > 1
          : Number(familyCounts.get(metadata.protein_family) || 0) > 2;
        const needsFamilyExpansion = weekFamilies.size < 3 && weekFamilies.has(metadata.protein_family);
        const needsCarbExpansion = metadata.carb_base && weekCarbs.size < 3 && weekCarbs.has(metadata.carb_base);

        if (duplicate || familyOverused || needsFamilyExpansion || needsCarbExpansion) {
          const candidates = (candidateMap[slot.slot_id] || [])
            .filter((candidate) => candidate.meal_id !== meal.meal_id)
            .sort((a, b) => {
              const aUnused = usedByType[type].has(a.meal_id) ? 0 : 1;
              const bUnused = usedByType[type].has(b.meal_id) ? 0 : 1;
              const aFamily = weekFamilies.has(a.protein_family) ? 0 : 1;
              const bFamily = weekFamilies.has(b.protein_family) ? 0 : 1;
              const aCarb = a.carb_base && !weekCarbs.has(a.carb_base) ? 1 : 0;
              const bCarb = b.carb_base && !weekCarbs.has(b.carb_base) ? 1 : 0;
              return bUnused - aUnused || bFamily - aFamily || bCarb - aCarb;
            });

          let replacement = null;
          for (const candidate of candidates) {
            if (duplicate && usedByType[type].has(candidate.meal_id)) continue;
            if (familyOverused && candidate.protein_family === metadata.protein_family) continue;
            const trialMeals = JSON.parse(JSON.stringify(day.meals));
            trialMeals[index] = materializeMeal(slot, candidate, normalized, null, { ...options, ingredientLibrary });
            balanceMaterializedDay(trialMeals, normalized, ingredientLibrary);
            if (dayQualityPenalty(sumMealsV2(trialMeals), normalized) === 0) {
              replacement = trialMeals;
              break;
            }
          }

          if (replacement) {
            day.meals = replacement;
            day.daily_totals = sumMealsV2(replacement);
          } else {
            const selectedMeal = day.meals[index];
            if (duplicate) selectedMeal.duplicate_reason = "Repeated because unused approved alternatives did not preserve daily nutrition targets.";
            if (familyOverused || needsFamilyExpansion) appendVarietyReason(selectedMeal, "Protein variety was limited because no approved alternative preserved the daily nutrition targets.");
            if (needsCarbExpansion) appendVarietyReason(selectedMeal, "Carbohydrate variety was limited because no approved alternative preserved the daily nutrition targets.");
          }
        }

        const selected = day.meals[index];
        const selectedMetadata = mealLookup.get(selected.meal_id);
        usedByType[type].add(selected.meal_id);
        if (selectedMetadata?.protein_family) weekFamilies.add(selectedMetadata.protein_family);
        if (selectedMetadata?.carb_base) weekCarbs.add(selectedMetadata.carb_base);
      }
      enforceDailyProteinFamilyLimit(day, skeletonDay, candidateMap, normalized, mealLookup, ingredientLibrary, options);
      day.daily_totals = sumMealsV2(day.meals);
    }

    const availableCarbs = new Set(Object.values(candidateMap || {}).flat().map((meal) => meal.carb_base).filter(Boolean));
    const selectedCarbs = new Set(days.flatMap((day) => day.meals || []).map((meal) => mealLookup.get(meal.meal_id)?.carb_base).filter(Boolean));
    if (selectedCarbs.size < Math.min(3, availableCarbs.size)) {
      const meal = days.flatMap((day) => day.meals || []).find((item) => mealLookup.get(item.meal_id)?.carb_base);
      if (meal && !/carbohydrate variety was limited/i.test(meal.variety_reason || "")) {
        appendVarietyReason(meal, "Carbohydrate variety was limited because no approved alternative preserved the daily nutrition targets.");
      }
    }
  }

  function enforceWeeklyRecipeFrequency(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options = {}) {
    if (!ingredientLibrary.length) return;
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const countsByType = {};
    const previousByType = {};
    const sodiumIngredientCounts = { smoked_salmon: 0, tuna_water_drained: 0 };
    const globalMealCounts = days.flatMap((day) => day.meals || []).reduce((counts, meal) => {
      counts.set(meal.meal_id, Number(counts.get(meal.meal_id) || 0) + 1);
      return counts;
    }, new Map());

    for (const day of days) {
      const skeletonDay = skeleton.find((item) => Number(item.day_index) === Number(day.day_index));
      if (!skeletonDay) continue;
      for (let index = 0; index < day.meals.length; index += 1) {
        const current = day.meals[index];
        const slot = skeletonDay.meals[index];
        const type = current.meal_slot || slot.meal_slot;
        countsByType[type] = countsByType[type] || new Map();
        const counts = countsByType[type];
        const currentCount = Number(counts.get(current.meal_id) || 0);
        const consecutive = previousByType[type] === current.meal_id;
        const needsUniqueExpansion = ["breakfast", "lunch", "dinner"].includes(type) && counts.size < 5 && currentCount > 0;
        const currentFamily = mealLookup.get(current.meal_id)?.protein_family;
        const needsFamilyRepair = currentFamily && Number(countDayProteinFamilies(day.meals, mealLookup).get(currentFamily) || 0) > 2;
        if (currentCount >= 2 || consecutive || needsUniqueExpansion || needsFamilyRepair) {
          const candidates = (candidateMap[slot.slot_id] || []).filter((candidate) =>
            candidate.meal_id !== current.meal_id &&
            Number(counts.get(candidate.meal_id) || 0) < 2 &&
            Number(globalMealCounts.get(candidate.meal_id) || 0) < 2 &&
            previousByType[type] !== candidate.meal_id &&
            (!needsUniqueExpansion || !counts.has(candidate.meal_id)) &&
            (!needsFamilyRepair || candidate.protein_family !== currentFamily)
          );
          for (const candidate of candidates) {
            if (Object.entries(sodiumIngredientCounts).some(([ingredientId, count]) => count >= 2 && mealContainsIngredient(candidate, ingredientId))) continue;
            const trial = JSON.parse(JSON.stringify(day.meals));
            trial[index] = materializeMeal(slot, candidate, normalized, null, { ...options, ingredientLibrary });
            balanceMaterializedDay(trial, normalized, ingredientLibrary);
            if (dayQualityPenalty(sumMealsV2(trial), normalized) !== 0) continue;
            if ([...countDayProteinFamilies(trial, mealLookup).values()].some((count) => count > 2)) continue;
            const highSodiumMeals = trial.filter((meal) => mealLookup.get(meal.meal_id)?.sodium_risk === "high").length;
            if (highSodiumMeals > 1) continue;
            day.meals = trial;
            break;
          }
          if (day.meals[index].meal_id === current.meal_id) {
            appendVarietyReason(
              day.meals[index],
              needsFamilyRepair
                ? "Protein variety was limited because no approved alternative preserved the daily nutrition targets."
                : "Recipe frequency was limited because no approved alternative preserved daily nutrition targets."
            );
          }
        }
        const selected = day.meals[index];
        if (selected.meal_id !== current.meal_id) {
          globalMealCounts.set(current.meal_id, Math.max(0, Number(globalMealCounts.get(current.meal_id) || 0) - 1));
          globalMealCounts.set(selected.meal_id, Number(globalMealCounts.get(selected.meal_id) || 0) + 1);
        }
        counts.set(selected.meal_id, Number(counts.get(selected.meal_id) || 0) + 1);
        previousByType[type] = selected.meal_id;
        const selectedMetadata = mealLookup.get(selected.meal_id);
        for (const ingredientId of Object.keys(sodiumIngredientCounts)) {
          if (!mealContainsIngredient(selectedMetadata, ingredientId)) continue;
          if (sodiumIngredientCounts[ingredientId] >= 2 && !selected.sodium_reason) {
            selected.sodium_reason = "No lower-sodium approved alternative preserved the daily nutrition targets.";
          }
          sodiumIngredientCounts[ingredientId] += 1;
        }
      }
      day.daily_totals = sumMealsV2(day.meals);
    }
  }

  function enforceDailyProteinFamilyLimit(day, skeletonDay, candidateMap, normalized, mealLookup, ingredientLibrary, options) {
    for (let attempt = 0; attempt < day.meals.length; attempt += 1) {
      const overused = [...countDayProteinFamilies(day.meals, mealLookup)].find(([, count]) => count > 2);
      if (!overused) return;
      const [family] = overused;
      const indexes = day.meals
        .map((meal, index) => ({ index, family: mealLookup.get(meal.meal_id)?.protein_family }))
        .filter((item) => item.family === family)
        .map((item) => item.index)
        .reverse();
      let repaired = false;
      for (const index of indexes) {
        const slot = skeletonDay.meals[index];
        for (const candidate of candidateMap[slot.slot_id] || []) {
          if (!candidate.protein_family || candidate.protein_family === family) continue;
          const trial = JSON.parse(JSON.stringify(day.meals));
          trial[index] = materializeMeal(slot, candidate, normalized, null, { ...options, ingredientLibrary });
          balanceMaterializedDay(trial, normalized, ingredientLibrary);
          if (dayQualityPenalty(sumMealsV2(trial), normalized) === 0) {
            day.meals = trial;
            repaired = true;
            break;
          }
        }
        if (repaired) break;
      }
      if (!repaired) {
        const index = indexes[0];
        appendVarietyReason(day.meals[index], "Protein variety was limited because no approved alternative preserved the daily nutrition targets.");
        return;
      }
    }
    for (const [family, count] of countDayProteinFamilies(day.meals, mealLookup)) {
      if (count <= 2) continue;
      const meal = day.meals.find((item) => mealLookup.get(item.meal_id)?.protein_family === family);
      if (meal) appendVarietyReason(meal, "Protein variety was limited because no approved alternative preserved the daily nutrition targets.");
    }
  }

  function countDayProteinFamilies(meals, mealLookup) {
    const counts = new Map();
    for (const meal of meals) {
      const family = mealLookup.get(meal.meal_id)?.protein_family;
      if (family) counts.set(family, Number(counts.get(family) || 0) + 1);
    }
    return counts;
  }

  function improveWeeklySodium(days, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary, options = {}) {
    if (!ingredientLibrary.length) return;
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const weeklyIngredientCounts = { smoked_salmon: 0, tuna_water_drained: 0 };
    const weeklyMealCounts = new Map();
    const previousByType = {};

    for (const day of days) {
      const skeletonDay = skeleton.find((item) => Number(item.day_index) === Number(day.day_index));
      if (!skeletonDay) continue;
      let highRiskMeals = 0;
      for (let index = 0; index < day.meals.length; index += 1) {
        const currentMeal = day.meals[index];
        const slot = skeletonDay.meals[index];
        let metadata = mealLookup.get(currentMeal.meal_id);
        if (!metadata) continue;
        const hasSmokedSalmon = mealContainsIngredient(metadata, "smoked_salmon");
        const hasTuna = mealContainsIngredient(metadata, "tuna_water_drained");
        const highRiskViolation = metadata.sodium_risk === "high" && highRiskMeals >= 1;
        const smokedViolation = hasSmokedSalmon && weeklyIngredientCounts.smoked_salmon >= 2;
        const tunaViolation = hasTuna && weeklyIngredientCounts.tuna_water_drained >= 2;

        if (highRiskViolation || smokedViolation || tunaViolation) {
          let replacement = null;
          for (const candidate of candidateMap[slot.slot_id] || []) {
            if (candidate.meal_id === currentMeal.meal_id) continue;
            if (Number(weeklyMealCounts.get(candidate.meal_id) || 0) >= 2) continue;
            if (previousByType[currentMeal.meal_slot] === candidate.meal_id) continue;
            if (highRiskViolation && candidate.sodium_risk === "high") continue;
            if (smokedViolation && mealContainsIngredient(candidate, "smoked_salmon")) continue;
            if (tunaViolation && mealContainsIngredient(candidate, "tuna_water_drained")) continue;
            const trial = JSON.parse(JSON.stringify(day.meals));
            trial[index] = materializeMeal(slot, candidate, normalized, null, { ...options, ingredientLibrary });
            balanceMaterializedDay(trial, normalized, ingredientLibrary);
            if (dayQualityPenalty(sumMealsV2(trial), normalized) !== 0) continue;
            if ([...countDayProteinFamilies(trial, mealLookup).values()].some((count) => count > 2)) continue;
            replacement = trial;
            break;
          }

          if (replacement) {
            day.meals = replacement;
            metadata = mealLookup.get(day.meals[index].meal_id);
          } else {
            day.meals[index].sodium_reason = "No lower-sodium approved alternative preserved the daily nutrition targets.";
          }
        }

        if (metadata?.sodium_risk === "high") highRiskMeals += 1;
        if (mealContainsIngredient(metadata, "smoked_salmon")) weeklyIngredientCounts.smoked_salmon += 1;
        if (mealContainsIngredient(metadata, "tuna_water_drained")) weeklyIngredientCounts.tuna_water_drained += 1;
        weeklyMealCounts.set(day.meals[index].meal_id, Number(weeklyMealCounts.get(day.meals[index].meal_id) || 0) + 1);
        previousByType[day.meals[index].meal_slot] = day.meals[index].meal_id;
      }
      day.daily_totals = sumMealsV2(day.meals);
    }
    for (const ingredientId of Object.keys(weeklyIngredientCounts)) {
      const occurrences = days.flatMap((day) => day.meals || []).filter((meal) => mealContainsIngredient(mealLookup.get(meal.meal_id), ingredientId));
      for (const meal of occurrences.slice(2)) {
        if (!meal.sodium_reason) meal.sodium_reason = "No lower-sodium approved alternative preserved the daily nutrition targets.";
      }
    }
  }

  function markConstrainedSodium(days, mealLibrary) {
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const weeklyIngredientCounts = { smoked_salmon: 0, tuna_water_drained: 0 };
    for (const day of days) {
      let highRiskMeals = 0;
      for (const meal of day.meals || []) {
        const metadata = mealLookup.get(meal.meal_id);
        if (metadata?.sodium_risk === "high") {
          highRiskMeals += 1;
          if (highRiskMeals > 1 && !meal.sodium_reason) {
            meal.sodium_reason = "No lower-sodium approved alternative preserved the daily nutrition targets.";
          }
        }
        for (const ingredientId of Object.keys(weeklyIngredientCounts)) {
          if (!mealContainsIngredient(metadata, ingredientId)) continue;
          weeklyIngredientCounts[ingredientId] += 1;
          if (weeklyIngredientCounts[ingredientId] > 2 && !meal.sodium_reason) {
            meal.sodium_reason = "No lower-sodium approved alternative preserved the daily nutrition targets.";
          }
        }
      }
    }
  }

  function mealContainsIngredient(meal, ingredientId) {
    return (meal?.ingredients || []).some((ingredient) => ingredient.ingredient_id === ingredientId);
  }

  function dayQualityPenalty(totals, normalized) {
    const ranges = nutritionQualityRanges(normalized);
    const outside = (value, range, target) => value < range[0]
      ? (range[0] - value) / Math.max(1, target)
      : value > range[1]
      ? (value - range[1]) / Math.max(1, target)
      : 0;
    return outside(totals.calories, ranges.calories, normalized.calorie_target) * 4
      + outside(totals.protein_g, ranges.protein, normalized.macro_targets.protein_g) * 2
      + outside(totals.carbs_g, ranges.carbs, normalized.macro_targets.carbs_g) * 2
      + outside(totals.fat_g, ranges.fat, normalized.macro_targets.fat_g) * 2
      + outside(totals.fiber_g, ranges.fiber, normalized.fiber_target_g);
  }

  function refreshMealNutrition(meals, ingredientLookup) {
    for (const meal of meals) Object.assign(meal, calculateMealNutrition(meal.ingredients || [], ingredientLookup));
  }

  function adjustMacroPortion(meals, ingredientLookup, nutrient, direction, normalized = {}) {
    const roleMap = {
      protein_g: ["primary_protein", "secondary_protein", "legume"],
      carbs_g: ["carb_base", "fruit", "legume"],
      fat_g: ["fat_source"],
      fiber_g: ["legume", "leafy_vegetable", "vegetable", "fruit", "carb_base"]
    };
    const roles = new Set(roleMap[nutrient]);
    if (nutrient === "fat_g" && direction < 0) {
      roles.add("primary_protein");
      roles.add("secondary_protein");
    }
    const candidates = [];
    for (const meal of meals) {
      for (const row of meal.ingredients || []) {
        if (!roles.has(row.ingredient_role) || !PORTION_POLICY.isScalableRole(row.ingredient_role)) continue;
        const ingredient = ingredientLookup.get(String(row.ingredient_id || ""));
        const density = Number(ingredient?.nutrition_per_100g?.[nutrient] || 0);
        const [minimum, maximum] = PORTION_POLICY.portionRange(row.ingredient_id, row.ingredient_role, meal.meal_slot);
        if (!ingredient || density <= 0 || (direction > 0 && row.quantity_g >= maximum) || (direction < 0 && row.quantity_g <= minimum)) continue;
        candidates.push({ meal, row, ingredient, density, minimum, maximum });
      }
    }
    candidates.sort((a, b) => {
      if (nutrient === "protein_g" && direction > 0) {
        const proteinDifference = Number(a.meal.protein_g || 0) - Number(b.meal.protein_g || 0);
        if (proteinDifference) return proteinDifference;
      }
      return b.density - a.density || (a.meal.meal_slot === "snack" ? 1 : -1);
    });
    for (const candidate of candidates) {
      if (nutrient === "protein_g" && direction > 0 && Number(candidate.meal.protein_g || 0) >= mealProteinLimit(candidate.meal.meal_slot)) continue;
      const step = nutrient === "fiber_g" ? 10 : 5;
      const previous = candidate.row.quantity_g;
      candidate.row.quantity_g = direction > 0
        ? Math.min(candidate.maximum, previous + step)
        : Math.max(candidate.minimum, previous - step);
      const nextCalories = calculateMealNutrition(candidate.meal.ingredients || [], ingredientLookup).calories;
      if (direction > 0 && nextCalories > PORTION_POLICY.mealCalorieLimit(candidate.meal.meal_slot, normalized.calorie_target, normalized.requested_meals_per_day)) {
        const dailyTotals = sumMealsV2(meals);
        const fatMinimum = nutritionQualityRanges(normalized).fat[0];
        const fatSource = nutrient !== "fat_g" && dailyTotals.fat_g > fatMinimum
          ? (candidate.meal.ingredients || []).find((row) => row.ingredient_role === "fat_source")
          : null;
        if (fatSource) {
          const fatIngredient = ingredientLookup.get(String(fatSource.ingredient_id || ""));
          const [fatMinimumGrams] = PORTION_POLICY.portionRange(fatSource.ingredient_id, fatSource.ingredient_role, candidate.meal.meal_slot);
          const previousFatGrams = fatSource.quantity_g;
          fatSource.quantity_g = Math.max(fatMinimumGrams, previousFatGrams - 5);
          const swappedCalories = calculateMealNutrition(candidate.meal.ingredients || [], ingredientLookup).calories;
          if (fatSource.quantity_g < previousFatGrams && swappedCalories <= PORTION_POLICY.mealCalorieLimit(candidate.meal.meal_slot, normalized.calorie_target, normalized.requested_meals_per_day)) {
            fatSource.household_quantity = householdQuantityFromGrams(fatSource.quantity_g, fatIngredient);
            candidate.row.household_quantity = householdQuantityFromGrams(candidate.row.quantity_g, candidate.ingredient);
            Object.assign(candidate.meal, calculateMealNutrition(candidate.meal.ingredients || [], ingredientLookup));
            return true;
          }
          fatSource.quantity_g = previousFatGrams;
        }
        candidate.row.quantity_g = previous;
        continue;
      }
      candidate.row.household_quantity = householdQuantityFromGrams(candidate.row.quantity_g, candidate.ingredient);
      Object.assign(candidate.meal, calculateMealNutrition(candidate.meal.ingredients || [], ingredientLookup));
      return true;
    }
    return false;
  }

  function addMissingCalories(meals, ingredientLookup, totals, normalized, ranges) {
    const deficits = [
      ["carbs_g", Math.max(0, ranges.carbs[0] - totals.carbs_g) * 4],
      ["fat_g", Math.max(0, ranges.fat[0] - totals.fat_g) * 9],
      ["protein_g", Math.max(0, ranges.protein[0] - totals.protein_g) * 4]
    ].sort((a, b) => b[1] - a[1]);
    const order = [...deficits.filter(([, deficit]) => deficit > 0).map(([nutrient]) => nutrient), "fat_g", "carbs_g", "protein_g"];
    for (const nutrient of [...new Set(order)]) {
      const range = nutrient === "protein_g" ? ranges.protein : nutrient === "carbs_g" ? ranges.carbs : ranges.fat;
      if (totals[nutrient] >= range[1]) continue;
      if (adjustMacroPortion(meals, ingredientLookup, nutrient, 1, normalized)) return true;
    }
    return false;
  }

  function reduceExcessCalories(meals, ingredientLookup, totals, normalized) {
    const excesses = [
      ["fat_g", totals.fat_g / Math.max(1, normalized.macro_targets.fat_g)],
      ["carbs_g", totals.carbs_g / Math.max(1, normalized.macro_targets.carbs_g)],
      ["protein_g", totals.protein_g / Math.max(1, normalized.macro_targets.protein_g)]
    ].sort((a, b) => b[1] - a[1]);
    for (const [nutrient] of excesses) if (adjustMacroPortion(meals, ingredientLookup, nutrient, -1, normalized)) return true;
    return false;
  }

  function householdQuantityFromGrams(grams, ingredient) {
    return PORTION_POLICY.formatHouseholdQuantity(grams, ingredient);
  }

  function validateNutritionPlanV2(plan, skeleton, candidateMap, normalized, mealLibrary, ingredientLibrary = []) {
    const errors = [];
    const mealLookup = new Map(normalizeMealLibrary(mealLibrary).map((meal) => [meal.meal_id, meal]));
    const ingredientLookup = new Map(normalizeIngredientLibrary(ingredientLibrary).map((item) => [item.ingredient_id, item]));
    const forbiddenRootFields = ["weeks", "week_1", "week_2", "week_3", "week_4", "adjustment_rules", "adherence_guidance", "monthly_plan"];
    const allowedRootFields = ["program_version", "nutrition_summary", "days", "weekly_grocery_list", "repeat_instruction", "safety_notes"];

    if (!plan || plan.program_version !== "fitnet.nutrition.output.v2" || !Array.isArray(plan.days) || plan.days.length !== 7) {
      return nutritionQualityGateResult(["schema:invalid_nutrition_v2_root"], plan, normalized, mealLookup);
    }

    for (const key of Object.keys(plan)) {
      if (forbiddenRootFields.includes(key)) errors.push(`schema:forbidden_root_field:${key}`);
      if (!allowedRootFields.includes(key)) errors.push(`schema:extra_root_field:${key}`);
    }

    if (!plan.nutrition_summary?.nutrition_rationale) errors.push("schema:missing_nutrition_rationale");
    if (!Array.isArray(plan.weekly_grocery_list) || plan.weekly_grocery_list.length === 0) errors.push("schema:missing_weekly_grocery_list");
    if (!String(plan.repeat_instruction || "").includes("7-day")) errors.push("schema:missing_repeat_instruction");
    if (!Array.isArray(plan.safety_notes) || plan.safety_notes.length === 0) errors.push("schema:missing_safety_notes");

    const usedMealIdsByType = {};
    for (const day of plan.days) {
      const skeletonDay = skeleton.find((item) => Number(item.day_index) === Number(day.day_index));
      if (!skeletonDay) {
        errors.push(`schema:unexpected_day:${day.day_index}`);
        continue;
      }
      if (!Array.isArray(day.meals) || day.meals.length !== normalized.meals_per_day) {
        errors.push(`schema:invalid_meal_count:${day.day_index}`);
        continue;
      }

      day.meals.forEach((meal, index) => {
        const slot = skeletonDay.meals[index];
        const candidates = candidateMap[slot.slot_id] || [];
        const candidateIds = new Set(candidates.map((candidate) => candidate.meal_id));
        const mealId = String(meal.meal_id || "");
        const libraryMeal = mealLookup.get(mealId);
        const mealType = slot.meal_slot === "snack" ? "snack" : slot.meal_slot;

        if (meal.meal_slot !== slot.meal_slot) errors.push(`schema:wrong_meal_slot:${day.day_index}:${meal.meal_slot}`);
        if (!candidateIds.has(mealId)) errors.push(`invented_or_disallowed_meal:${slot.slot_id}:${mealId}`);
        if (!libraryMeal) {
          errors.push(`unknown_meal_id:${mealId}`);
          return;
        }

        usedMealIdsByType[mealType] = usedMealIdsByType[mealType] || new Set();
        if (usedMealIdsByType[mealType].has(mealId) && candidates.some((candidate) => !usedMealIdsByType[mealType].has(candidate.meal_id)) && !meal.duplicate_reason) {
          errors.push(`unexplained_duplicate_meal:${mealId}`);
        }
        usedMealIdsByType[mealType].add(mealId);

        if (mealType === "breakfast" && !isMealAllowed(libraryMeal, slot, normalized)) {
          errors.push(`invalid_breakfast:${mealId}`);
        }
        if (!Array.isArray(meal.ingredients) || meal.ingredients.length === 0) errors.push(`schema:missing_ingredients:${mealId}`);
        if (!String(meal.cooking_method || "").trim()) errors.push(`schema:missing_cooking_method:${mealId}`);
        if (!Number.isFinite(Number(meal.calories)) || !Number.isFinite(Number(meal.protein_g))) errors.push(`schema:missing_macros:${mealId}`);
        if (Number(meal.calories || 0) > PORTION_POLICY.mealCalorieLimit(mealType, normalized.calorie_target, normalized.requested_meals_per_day)) errors.push(`meal_calories_above_portion_limit:${mealId}`);
        if (Number(meal.protein_g || 0) > mealProteinLimit(mealType)) errors.push(`meal_protein_above_quality_limit:${mealId}`);
        if (String(meal.cooking_method || "").length > 500) errors.push(`schema:cooking_method_too_long:${mealId}`);
        if (ingredientLookup.size) {
          const expectedIngredientIds = (libraryMeal.ingredients || []).map((item) => String(item.ingredient_id || ""));
          const actualIngredientIds = (meal.ingredients || []).map((item) => String(item.ingredient_id || ""));
          if (JSON.stringify(expectedIngredientIds) !== JSON.stringify(actualIngredientIds)) errors.push(`ingredient_set_mismatch:${mealId}`);
          for (const row of meal.ingredients || []) {
            const ingredient = ingredientLookup.get(String(row.ingredient_id || ""));
            const libraryRow = (libraryMeal.ingredients || []).find((item) => String(item.ingredient_id || "") === String(row.ingredient_id || ""));
            if (!ingredient) {
              errors.push(`unknown_ingredient_id:${mealId}:${row.ingredient_id || "missing"}`);
              continue;
            }
            if (!libraryRow || row.ingredient_role !== libraryRow.ingredient_role) {
              errors.push(`ingredient_role_mismatch:${mealId}:${row.ingredient_id || "missing"}`);
            } else {
              const [minimumPortion, maximumPortion] = PORTION_POLICY.portionRange(
                String(row.ingredient_id || ""),
                row.ingredient_role,
                meal.meal_slot
              );
              if (Number(row.quantity_g || 0) < minimumPortion || Number(row.quantity_g || 0) > maximumPortion) {
                errors.push(`portion_out_of_range:${mealId}:${row.ingredient_id}`);
              }
              if ((libraryMeal.non_scalable_ingredients || []).includes(row.ingredient_id)
                && Math.abs(Number(row.quantity_g || 0) - Number(libraryRow.quantity_g || 0)) > 1) {
                errors.push(`non_scalable_ingredient_changed:${mealId}:${row.ingredient_id}`);
              }
            }
            if (!ingredient.verified_by_fitnet) errors.push(`unverified_ingredient:${mealId}:${ingredient.ingredient_id}`);
            if (String(row.household_quantity || "") !== PORTION_POLICY.formatHouseholdQuantity(row.quantity_g, ingredient)) {
              errors.push(`household_quantity_mismatch:${mealId}:${ingredient.ingredient_id}`);
            }
            if (!["inherently_halal", "requires_halal_certified_source", "verified_halal_product"].includes(ingredient.halal_status)) {
              errors.push(`non_halal_ingredient:${mealId}:${ingredient.ingredient_id}`);
            }
            const forbidden = `${ingredient.ingredient_id} ${ingredient.name_en} ${(ingredient.avoid_tags || []).join(" ")}`.toLowerCase();
            if (/\b(pork|bacon|ham|lard|pork_gelatin|pork_derivative|alcohol)\b/.test(forbidden)) {
              errors.push(`forbidden_halal_ingredient:${mealId}:${ingredient.ingredient_id}`);
            }
            const conflicts = new Set([...(ingredient.allergens || []), ...(ingredient.avoid_tags || [])].map(normalizeToken));
            if ([...conflicts].some((tag) => expandAllergyTags(normalized.allergy_tags).has(tag))) {
              errors.push(`ingredient_allergy_conflict:${mealId}:${ingredient.ingredient_id}`);
            }
            const searchable = [ingredient.name_en, ...(ingredient.aliases || []), ...(ingredient.avoid_tags || [])].join(" ").toLowerCase();
            if (normalized.food_avoid.some((avoid) => searchable.includes(avoid))) {
              errors.push(`ingredient_food_avoid_conflict:${mealId}:${ingredient.ingredient_id}`);
            }
          }
          const calculated = calculateMealNutrition(meal.ingredients || [], ingredientLookup);
          for (const key of ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]) {
            if (Math.abs(Number(meal[key] || 0) - Number(calculated[key] || 0)) > 2) errors.push(`meal_nutrition_mismatch:${mealId}:${key}`);
          }
          if (meal.meal_name !== libraryMeal.meal_name) errors.push(`meal_name_mismatch:${mealId}`);
          const expectedMethod = Array.isArray(libraryMeal.cooking_method) ? libraryMeal.cooking_method.join(" ") : String(libraryMeal.cooking_method || "");
          if (String(meal.cooking_method || "") !== expectedMethod) errors.push(`cooking_method_mismatch:${mealId}`);
        }
        const unsafeText = JSON.stringify(meal).toLowerCase();
        if (/(detox|cleanse|starve|medical cure|guaranteed weight loss|zero calories|no food)/.test(unsafeText)) {
          errors.push(`unsafe_diet_language:${mealId}`);
        }
        if (/chop or warm .* as appropriate|warm the (plain greek yogurt|cottage cheese|labneh|smoked salmon|tuna)/.test(unsafeText)) {
          errors.push(`culinary_instruction_mismatch:${mealId}`);
        }
      });

      const totals = sumMealsV2(day.meals);
      const providedTotals = day.daily_totals || {};
      if (Math.abs(Number(providedTotals.calories || 0) - totals.calories) > 8) errors.push(`daily_totals_mismatch:${day.day_index}`);
      if (totals.calories < normalized.calorie_range[0] || totals.calories > normalized.calorie_range[1]) errors.push(`unsafe_daily_calories:${day.day_index}`);
      if (totals.protein_g < normalized.macro_targets.protein_g * 0.6) errors.push(`unsafe_daily_protein:${day.day_index}`);
      if (totals.fiber_g < normalized.fiber_target_g * 0.45) errors.push(`daily_fiber_too_low:${day.day_index}`);
      const qualityRanges = nutritionQualityRanges(normalized);
      if (totals.calories < qualityRanges.calories[0] - 10 || totals.calories > qualityRanges.calories[1] + 10) errors.push(`quality_daily_calories:${day.day_index}`);
      if (totals.protein_g < qualityRanges.protein[0] - 1 || totals.protein_g > qualityRanges.protein[1] + 1) errors.push(`quality_daily_protein:${day.day_index}`);
      if (totals.protein_g > normalized.protein_ceiling_g) errors.push(`protein_ceiling_exceeded:${day.day_index}`);
      if (totals.carbs_g < qualityRanges.carbs[0] - 1 || totals.carbs_g > qualityRanges.carbs[1] + 1) errors.push(`quality_daily_carbs:${day.day_index}`);
      if (totals.fat_g < qualityRanges.fat[0] - 1 || totals.fat_g > qualityRanges.fat[1] + 1) errors.push(`quality_daily_fat:${day.day_index}`);
      if (totals.fiber_g < qualityRanges.fiber[0]) errors.push(`quality_daily_fiber:${day.day_index}`);
    }

    const rootText = JSON.stringify(plan).toLowerCase();
    if (/(detox|cleanse|starve|medical cure|guaranteed weight loss|extreme deficit)/.test(rootText)) {
      errors.push("unsafe_diet_language:root");
    }
    if (/\b(workout|exercise program|training split|sets and reps|available equipment|injury warning)\b/.test(rootText)) {
      errors.push("nutrition_scope:workout_language");
    }
    if (ingredientLookup.size) validateGroceryList(plan, [...ingredientLookup.values()], errors);
    validateNutritionWeeklyVariety(plan, candidateMap, mealLookup, errors);
    validateNutritionSodiumPolicy(plan, mealLookup, errors);

    return nutritionQualityGateResult(errors, plan, normalized, mealLookup);
  }

  function nutritionQualityGateResult(errors, plan, normalized, mealLookup) {
    const qualityScore = scoreNutritionPlanQuality(errors, plan, normalized, mealLookup);
    const finalErrors = [...errors];
    if (!qualityScore.passed) {
      finalErrors.push(`quality:score_below_threshold:${qualityScore.score}:${qualityScore.threshold}`);
    }
    return {
      valid: finalErrors.length === 0,
      errors: finalErrors,
      quality_score: qualityScore
    };
  }

  function scoreNutritionPlanQuality(errors, plan, normalized, mealLookup) {
    const categories = { ...NUTRITION_QUALITY_WEIGHTS };
    const categorizedErrors = {
      macro_balance: [],
      portion_realism: [],
      weekly_variety: [],
      sodium_awareness: [],
      fiber_compliance: [],
      recipe_authenticity: [],
      grocery_practicality: [],
      preference_match: []
    };

    for (const error of errors) {
      const value = String(error);
      if (/fiber/.test(value)) categorizedErrors.fiber_compliance.push(value);
      else if (/daily_(calories|protein|carbs|fat)|protein_ceiling|daily_totals|meal_nutrition_mismatch|meal_protein_above/.test(value)) categorizedErrors.macro_balance.push(value);
      else if (/portion|meal_calories_above|invalid_breakfast|household_quantity/.test(value)) categorizedErrors.portion_realism.push(value);
      else if (/weekly_variety|duplicate_meal/.test(value)) categorizedErrors.weekly_variety.push(value);
      else if (/^sodium:/.test(value)) categorizedErrors.sodium_awareness.push(value);
      else if (/grocery_/.test(value)) categorizedErrors.grocery_practicality.push(value);
      else if (/allergy|food_avoid|non_halal|forbidden_halal|invented_or_disallowed_meal/.test(value)) categorizedErrors.preference_match.push(value);
      else categorizedErrors.recipe_authenticity.push(value);
    }

    for (const [category, categoryErrors] of Object.entries(categorizedErrors)) {
      if (categoryErrors.length) categories[category] = 0;
    }

    const preferences = (normalized?.food_preferences || []).map(normalizeToken).filter(Boolean);
    if (preferences.length && plan?.days) {
      const searchable = (plan.days || []).flatMap((day) => day.meals || []).map((meal) => {
        const metadata = mealLookup.get(String(meal.meal_id || ""));
        return normalizeToken([
          meal.meal_name,
          metadata?.primary_protein,
          metadata?.protein_family,
          metadata?.cuisine_style,
          ...(meal.ingredients || []).map((ingredient) => ingredient.name)
        ].filter(Boolean).join(" "));
      }).join(" ");
      const matches = preferences.filter((preference) => searchable.includes(preference)).length;
      categories.preference_match = Math.round(NUTRITION_QUALITY_WEIGHTS.preference_match * matches / preferences.length);
    }

    const score = Object.values(categories).reduce((total, value) => total + value, 0);
    const reasons = Object.entries(categories)
      .filter(([category, value]) => value < NUTRITION_QUALITY_WEIGHTS[category])
      .map(([category]) => category);
    return {
      score,
      threshold: NUTRITION_QUALITY_THRESHOLD,
      passed: score >= NUTRITION_QUALITY_THRESHOLD,
      categories,
      reasons
    };
  }

  function mealMatchesPreference(meal, preference) {
    const preferred = normalizeToken(preference);
    if (!preferred) return false;
    const cuisineAliases = preferred === "arabic" ? ["middle_eastern"] : [preferred];
    const searchable = normalizeToken([
      meal.meal_name,
      meal.cuisine_style,
      meal.primary_protein,
      meal.protein_family,
      ...(meal.ingredients || []).map((ingredient) => ingredient.name)
    ].filter(Boolean).join(" "));
    return cuisineAliases.some((value) => searchable.includes(value));
  }

  function validateNutritionWeeklyVariety(plan, candidateMap, mealLookup, errors) {
    const weekFamilies = new Set();
    const weekCarbs = new Set();
    const availableFamilies = new Set();
    const availableCarbs = new Set();
    const availableByType = {};
    for (const candidates of Object.values(candidateMap || {})) {
      for (const candidate of candidates || []) {
        if (candidate.protein_family) availableFamilies.add(candidate.protein_family);
        if (candidate.carb_base) availableCarbs.add(candidate.carb_base);
        const type = candidate.meal_type || "meal";
        availableByType[type] = availableByType[type] || new Set();
        availableByType[type].add(candidate.meal_id);
      }
    }

    const selectedByType = {};
    const previousDayByType = {};

    for (const day of plan.days || []) {
      const counts = countDayProteinFamilies(day.meals || [], mealLookup);
      for (const [family, count] of counts) {
        const familyMeals = (day.meals || []).filter((meal) => mealLookup.get(meal.meal_id)?.protein_family === family);
        if (count > 2 && !familyMeals.some((meal) => /protein variety was limited/i.test(meal.variety_reason || ""))) {
          errors.push(`weekly_variety:daily_protein_family_repeated:${day.day_index}:${family}`);
        }
      }
      for (const meal of day.meals || []) {
        const metadata = mealLookup.get(meal.meal_id);
        if (metadata?.protein_family) weekFamilies.add(metadata.protein_family);
        if (metadata?.carb_base) weekCarbs.add(metadata.carb_base);
        const type = meal.meal_slot || metadata?.meal_type || "meal";
        selectedByType[type] = selectedByType[type] || [];
        selectedByType[type].push(meal.meal_id);
      }
      for (const type of ["breakfast", "lunch", "dinner"]) {
        const dayIds = new Set((day.meals || []).filter((meal) => meal.meal_slot === type).map((meal) => meal.meal_id));
        const constrainedFrequency = (day.meals || []).some((meal) => meal.meal_slot === type && /(?:recipe frequency|protein variety) was limited/i.test(meal.variety_reason || ""));
        if (previousDayByType[type] && [...dayIds].some((mealId) => previousDayByType[type].has(mealId)) && Number(availableByType[type]?.size || 0) > 1 && !constrainedFrequency) {
          errors.push(`weekly_variety:consecutive_recipe_repeat:${day.day_index}:${type}`);
        }
        if (dayIds.size) previousDayByType[type] = dayIds;
      }
    }

    for (const [type, mealIds] of Object.entries(selectedByType)) {
      const counts = mealIds.reduce((result, mealId) => {
        result[mealId] = Number(result[mealId] || 0) + 1;
        return result;
      }, {});
      if (Number(availableByType[type]?.size || 0) > 2) {
        for (const [mealId, count] of Object.entries(counts)) {
          const constrained = (plan.days || []).flatMap((day) => day.meals || []).some((meal) => meal.meal_id === mealId && /(?:recipe frequency|protein variety) was limited/i.test(meal.variety_reason || ""));
          if (count > 2 && !constrained) errors.push(`weekly_variety:recipe_frequency:${type}:${mealId}:${count}`);
        }
      }
      if (["breakfast", "lunch", "dinner"].includes(type) && mealIds.length >= 7) {
        const target = Math.min(5, Number(availableByType[type]?.size || 0));
        const constrained = (plan.days || []).flatMap((day) => day.meals || []).some((meal) => meal.meal_slot === type && /(?:recipe frequency|protein variety) was limited/i.test(meal.variety_reason || ""));
        if (new Set(mealIds).size < target && !constrained) errors.push(`weekly_variety:insufficient_unique_recipes:${type}:${new Set(mealIds).size}:${target}`);
      }
    }

    const proteinTarget = Math.min(3, availableFamilies.size);
    const carbTarget = Math.min(3, availableCarbs.size);
    const notes = (plan.days || []).flatMap((day) => day.meals || []).map((meal) => String(meal.variety_reason || ""));
    if (weekFamilies.size < proteinTarget && !notes.some((note) => /protein variety was limited/i.test(note))) {
      errors.push(`weekly_variety:insufficient_protein_families:${weekFamilies.size}:${proteinTarget}`);
    }
    if (weekCarbs.size < carbTarget && !notes.some((note) => /carbohydrate variety was limited/i.test(note))) {
      errors.push(`weekly_variety:insufficient_carb_bases:${weekCarbs.size}:${carbTarget}`);
    }
  }

  function validateNutritionSodiumPolicy(plan, mealLookup, errors) {
    const weeklyCounts = { smoked_salmon: 0, tuna_water_drained: 0 };
    for (const day of plan.days || []) {
      let highRiskMeals = 0;
      for (const meal of day.meals || []) {
        const metadata = mealLookup.get(meal.meal_id);
        if (!metadata) continue;
        if (metadata.sodium_risk === "high") {
          highRiskMeals += 1;
          if (highRiskMeals > 1 && !/no lower-sodium approved alternative/i.test(meal.sodium_reason || "")) {
            errors.push(`sodium:high_risk_meal_stack:${day.day_index}:${meal.meal_id}`);
          }
        }
        for (const ingredientId of Object.keys(weeklyCounts)) {
          if (!mealContainsIngredient(metadata, ingredientId)) continue;
          weeklyCounts[ingredientId] += 1;
          if (weeklyCounts[ingredientId] > 2 && !/no lower-sodium approved alternative/i.test(meal.sodium_reason || "")) {
            errors.push(`sodium:weekly_frequency:${ingredientId}:${weeklyCounts[ingredientId]}`);
          }
        }
      }
    }
  }

  function validateGroceryList(plan, ingredientLibrary, errors) {
    const expected = buildMealGroceryList(plan.days || [], ingredientLibrary);
    const flatten = (groups) => new Map((groups || []).flatMap((group) => (group.items || []).map((item) => [String(item.ingredient_id || ""), item])));
    const expectedItems = flatten(expected);
    const actualItems = flatten(plan.weekly_grocery_list);
    if (expectedItems.size !== actualItems.size) errors.push("grocery_list_item_count_mismatch");
    for (const [ingredientId, item] of expectedItems) {
      const actual = actualItems.get(ingredientId);
      if (!actual || Math.abs(Number(actual.quantity_g || 0) - Number(item.quantity_g || 0)) > 2) {
        errors.push(`grocery_quantity_mismatch:${ingredientId || "missing"}`);
      }
      if (actual && (actual.quantity_label !== item.quantity_label || actual.purchase_state !== item.purchase_state || Boolean(actual.conversion_applied) !== Boolean(item.conversion_applied))) {
        errors.push(`grocery_purchase_metadata_mismatch:${ingredientId || "missing"}`);
      }
    }
  }

  function enrichFoodLibrary(foodLibrary) {
    return foodLibrary.map((food) => ({
      ...food,
      fiber_g: food.fiber_g === undefined ? estimateFiber(food) : Number(food.fiber_g),
      serving_grams: food.serving_grams || defaultServingGrams(food),
      household_unit: food.household_unit || defaultHouseholdUnit(food),
      household_quantity: food.household_quantity || 1,
      halal_status: food.halal_status || "halal",
      grocery_category: food.grocery_category || groceryCategory(food)
    }));
  }

  function estimateFiber(food) {
    if (["vegetable", "fruit"].includes(food.category)) return 4;
    if (food.category === "carbohydrate") return 3;
    if (food.category === "fat" && (food.allergy_tags || []).includes("nuts")) return 3;
    return 0;
  }

  function defaultServingGrams(food) {
    if (food.category === "fat") return 28;
    if (food.category === "protein") return 120;
    if (food.category === "vegetable" || food.category === "fruit") return 100;
    return 100;
  }

  function defaultHouseholdUnit(food) {
    if (food.category === "fat") return "small handful";
    if (food.category === "protein") return "serving";
    if (food.category === "carbohydrate") return "cup";
    return "serving";
  }

  function groceryCategory(food) {
    if (food.category === "protein") return "Protein";
    if (food.category === "carbohydrate") return "Carbohydrates";
    if (food.category === "fat") return "Fats";
    if (food.category === "fruit" || food.category === "vegetable") return "Produce";
    return "Pantry";
  }

  function sumMealsV2(meals) {
    return meals.reduce(
      (totals, meal) => ({
        calories: totals.calories + Number(meal.calories || 0),
        protein_g: totals.protein_g + Number(meal.protein_g || 0),
        carbs_g: totals.carbs_g + Number(meal.carbs_g || 0),
        fat_g: totals.fat_g + Number(meal.fat_g || 0),
        fiber_g: totals.fiber_g + Number(meal.fiber_g || 0)
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
    );
  }

  function buildMealGroceryList(days, ingredientLibrary = []) {
    const ingredientLookup = new Map(normalizeIngredientLibrary(ingredientLibrary).map((ingredient) => [ingredient.ingredient_id, ingredient]));
    const totals = new Map();
    for (const day of days) {
      for (const meal of day.meals) {
        for (const ingredient of meal.ingredients || []) {
          const key = String(ingredient.ingredient_id || ingredient.name || "").toLowerCase();
          const current = totals.get(key) || {
            ingredient_id: ingredient.ingredient_id || null,
            name: ingredient.name,
            category: ingredient.category || "Pantry",
            quantity_g: 0
          };
          current.quantity_g += Number(ingredient.quantity_g || 0);
          totals.set(key, current);
        }
      }
    }

    const grouped = new Map();
    for (const item of totals.values()) {
      const ingredient = ingredientLookup.get(String(item.ingredient_id || ""));
      const conversionApplied = Boolean(ingredient?.purchase_conversion_reviewed);
      const purchaseMultiplier = conversionApplied ? Number(ingredient.purchase_multiplier || 1) : 1;
      const purchaseQuantity = Math.round(item.quantity_g * purchaseMultiplier);
      const purchaseState = ingredient?.purchase_state || ingredient?.default_state || "as listed";
      const category = item.category || "Pantry";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push({
        ingredient_id: item.ingredient_id,
        name: groceryPurchaseName(ingredient, item.name, conversionApplied),
        quantity_g: purchaseQuantity,
        quantity_label: groceryPurchaseQuantity(purchaseQuantity, ingredient),
        purchase_state: purchaseState,
        conversion_applied: conversionApplied
      });
    }

    return [...grouped.entries()].map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name))
    }));
  }

  function groceryPurchaseName(ingredient, fallbackName, conversionApplied) {
    const base = userFacingIngredientName(ingredient?.name_en || fallbackName || "Ingredient").replace(/^(Cooked|Roasted)\s+/i, "");
    const displayName = `${base.charAt(0).toUpperCase()}${base.slice(1)}`;
    return conversionApplied ? `${displayName} (${ingredient.purchase_state})` : displayName;
  }

  function userFacingIngredientName(value) {
    return String(value || "").replace(/^Halal\s+/i, "").trim();
  }

  function groceryPurchaseQuantity(grams, ingredient) {
    const countableUnits = new Set([
      "egg", "egg white", "date", "medium apple", "medium banana", "medium carrot",
      "medium potato", "medium tomato", "pepper", "pita", "spear", "small cucumber",
      "small onion", "tortilla", "can", "block"
    ]);
    if (ingredient && countableUnits.has(ingredient.household_unit)) {
      const unitGrams = Number(ingredient.household_unit_grams || 0);
      if (unitGrams > 0) {
        const quantity = Math.max(1, Math.ceil(Number(grams || 0) / unitGrams));
        return `${quantity} ${pluralizeGroceryUnit(ingredient.household_unit, quantity)}`;
      }
    }
    return formatGroceryQuantity(grams);
  }

  function pluralizeGroceryUnit(unit, quantity) {
    if (quantity === 1) return unit;
    const irregular = {
      "medium tomato": "medium tomatoes",
      "medium potato": "medium potatoes"
    };
    return irregular[unit] || `${unit}s`;
  }

  function sumFoods(foods) {
    return foods.reduce(
      (totals, food) => ({
        calories: totals.calories + Number(food.calories || 0),
        protein_g: totals.protein_g + Number(food.protein_g || 0),
        carbs_g: totals.carbs_g + Number(food.carbs_g || 0),
        fat_g: totals.fat_g + Number(food.fat_g || 0)
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }

  function scaleTotals(totals, multiplier) {
    return {
      calories: Math.round(totals.calories * multiplier),
      protein_g: Math.round(totals.protein_g * multiplier),
      carbs_g: Math.round(totals.carbs_g * multiplier),
      fat_g: Math.round(totals.fat_g * multiplier)
    };
  }

  function sumMeals(meals) {
    return meals.reduce(
      (totals, meal) => ({
        calories: totals.calories + Number(meal.calories || 0),
        protein_g: totals.protein_g + Number(meal.protein_g || 0),
        carbs_g: totals.carbs_g + Number(meal.carbs_g || 0),
        fat_g: totals.fat_g + Number(meal.fat_g || 0)
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }

  function nameMeal(slot, foods) {
    if (!foods.length) return "Fitnet Meal";
    const primary = foods[0].name;
    if (slot === "snack") return `${primary} Snack`;
    return `${primary} Plate`;
  }

  function noteForMeal(slot, normalized) {
    if (normalized.cooking_time === "Minimal") return "Keep prep simple and batch portions where possible.";
    if (slot.meal_slot === "snack") return "Use this meal to keep energy stable between main meals.";
    return "Adjust seasoning freely while keeping the approved foods unchanged.";
  }

  function ageBandValue(ageRange = "25-34") {
    if (ageRange === "Under 18") return 17;
    if (ageRange === "18-24") return 21;
    if (ageRange === "35-44") return 40;
    if (ageRange === "45-54") return 50;
    if (ageRange === "55+") return 60;
    return 30;
  }

  function heightBandValue(heightRange = "165-174 cm") {
    const match = String(heightRange).match(/\d+/g);
    return match ? Number(match[0]) : 170;
  }

  function weightBandValue(weightRange = "65-79 kg") {
    const match = String(weightRange).match(/\d+/g);
    return match ? Number(match[0]) : 70;
  }

  function normalizeNoneList(values = []) {
    return values.filter((item) => item && item !== "None");
  }

  function normalizeAvoidList(values = [], other = "") {
    return [...values, other]
      .filter(Boolean)
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean);
  }

  function midpoint(range) {
    return Math.round((Number(range[0]) + Number(range[1])) / 2);
  }

  function roundToFive(value) {
    return Math.max(5, Math.round(Number(value || 0) / 5) * 5);
  }

  function roundToTwentyFive(value) {
    return Math.round(Number(value || 0) / 25) * 25;
  }

  function normalizeToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/s$/, "");
  }

  function expandAllergyTags(tags = []) {
    const expanded = new Set();
    for (const tag of tags) {
      const normalized = normalizeToken(tag);
      expanded.add(normalized);
      expanded.add(`${normalized}s`);
      if (normalized === "egg") expanded.add("eggs");
      if (normalized === "nuts") expanded.add("nut");
    }
    return expanded;
  }

  function goalTag(goal) {
    if (goal === "Lose Weight") return "fat_loss";
    if (goal === "Build Muscle") return "muscle_gain";
    if (goal === "Gain Strength") return "strength";
    return "general_fitness";
  }

  function formatGroceryQuantity(grams) {
    const rounded = Math.round(Number(grams || 0));
    if (rounded >= 1000) return `${Number((rounded / 1000).toFixed(1))} kg`;
    return `${rounded} g`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  const api = {
    generateNutritionPlan,
    generateNutritionPlanV2,
    normalizeNutritionInput,
    calculateCalorieTarget,
    assessNutritionEligibility,
    buildNutritionSkeleton,
    buildFourWeekNutritionSkeleton,
    buildSevenDayNutritionSkeleton,
    filterFoodCandidates,
    filterMealCandidates,
    normalizeMealLibrary,
    selectNutritionMeals,
    validateNutritionPlan,
    validateNutritionPlanV2,
    enrichFoodLibrary,
    buildFallbackNutritionPlan,
    buildFallbackNutritionPlanV2,
    normalizeIngredientLibrary,
    calculateMealNutrition,
    materializeNutritionSelectionV2,
    scoreNutritionPlanQuality,
    nutritionDayPreferenceScore,
    optimizeNutritionWeek
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.FitnetNutritionEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
