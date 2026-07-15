(function attachPlanContracts(root) {
  const HARD_ID_RULE = "Choose only from the candidate IDs provided. Do not invent IDs, names, days, meals, exercises, or fields.";
  const REPAIR_RULE = "Return corrected JSON only. Do not add explanations.";

  const WORKOUT_ALLOWED_ROOT_KEYS = ["coaching_rationale", "plan_days"];
  const WORKOUT_V2_ALLOWED_ROOT_KEYS = ["program_summary", "plan_days", "repeat_instruction", "safety_notes"];
  const WORKOUT_V2_PROGRAM_SUMMARY_KEYS = ["goal", "split", "days_per_week", "session_duration_minutes", "workout_place", "available_equipment", "focus_muscles", "injuries", "disliked_exercises", "coaching_rationale"];
  const WORKOUT_V2_DAY_KEYS = ["day_index", "day_name", "day_focus", "exercises"];
  const WORKOUT_V2_ALLOWED_EXERCISE_KEYS = ["slot_id", "exercise_id", "exercise_name", "exercise_category", "movement_pattern", "muscle_group", "sets", "reps", "rest", "notes", "duplicate_reason"];
  const WORKOUT_V3_ALLOWED_ROOT_KEYS = ["program_version", "program_summary", "plan_days", "progression_guidance", "recovery_guidance", "pain_safety_guidance", "repeat_instruction"];
  const WORKOUT_V3_ALLOWED_EXERCISE_KEYS = ["slot_id", "exercise_id", "exercise_name", "exercise_category", "movement_pattern", "muscle_group", "sets", "reps", "rest", "notes", "effort_guidance", "coaching_cue", "substitution_ids", "duplicate_reason"];
  const WORKOUT_ALLOWED_DAY_KEYS = ["day_index", "day_name", "exercises"];
  const WORKOUT_ALLOWED_EXERCISE_KEYS = ["slot_id", "exercise_id", "sets", "reps", "rest_seconds", "notes"];
  const NUTRITION_ALLOWED_DAY_KEYS = ["day_index", "meals", "daily_totals"];
  const NUTRITION_ALLOWED_MEAL_KEYS = [
    "meal_slot",
    "meal_name",
    "food_ids",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "notes"
  ];
  const NUTRITION_ALLOWED_TOTAL_KEYS = ["calories", "protein_g", "carbs_g", "fat_g"];
  const NUTRITION_V2_ALLOWED_ROOT_KEYS = ["program_version", "nutrition_summary", "days", "weekly_grocery_list", "repeat_instruction", "safety_notes"];
  const NUTRITION_V2_ALLOWED_MEAL_KEYS = [
    "meal_slot",
    "meal_id",
    "meal_name",
    "ingredients",
    "cooking_method",
    "prep_time_minutes",
    "cooking_time_minutes",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "duplicate_reason"
  ];
  const NUTRITION_SELECTION_VERSION = "fitnet.nutrition.selection.v1";

  function buildWorkoutSelectionPrompt({ normalizedInput, skeleton, candidateMap }) {
    return {
      prompt_version: "workout_selection_v1",
      response_format: "json_schema",
      system: [
        "You are Fitnet's constrained workout selection engine.",
        "Act as a professional modern gym coach using an evidence-informed, research-based approach.",
        "Use the full user context: goal, experience, available days, session duration, workout place, equipment, focus areas, and injuries.",
        "The backend has already selected the weekly split and fixed training slots from the user's selected days.",
        "You may choose the best approved exercise for each slot and adjust sets, reps, rest, and concise exercise notes within the fixed slot intent.",
        "Include a coaching_rationale explaining why this program fits the user's goal, schedule, recovery needs, and training level.",
        HARD_ID_RULE,
        "Return JSON only. No markdown, prose, comments, or extra fields."
      ].join(" "),
      user: JSON.stringify(
        {
          task: "Select exactly one exercise candidate for each fixed workout slot.",
          user_context: normalizedInput,
          fixed_skeleton: skeleton,
          candidates_by_slot: slimCandidateMap(candidateMap, "exercise"),
          output_schema_id: "fitnet.workout.output.v1"
        },
        null,
        2
      )
    };
  }

  function buildWorkoutSelectionPromptV3({ normalizedInput, coachingStrategy, skeleton, candidateMap, language = "en" }) {
    return {
      prompt_version: "workout_program_v3_1",
      response_format: "json_schema",
      system: [
        "You are Fitnet's evidence-informed professional gym coach.",
        "Create one practical weekly routine repeated for four weeks, without separate weeks or a deload.",
        "Backend decisions are final: the split, day indexes and names, slot IDs and order, training role for each slot, exercise count for each day, and cardio allocation. Do not add, remove, move, or reinterpret them.",
        "Select exactly one approved exercise ID from candidates_by_slot per fixed slot and fulfill its training role. Copy approved metadata; never invent IDs, exercises, fields, equipment, or medical facts.",
        "Candidates are ordered by backend preference after eligibility checks. Prefer earlier options unless a later one clearly improves context fit or variety.",
        "Use supplied context only. Broad injury labels require conservative choices but do not provide a diagnosis, severity, or pain trigger.",
        "Preserve required day coverage before focus priority. Avoid unnecessary exercise repetition when an approved unused candidate fits the same role.",
        "Keep A/B sessions meaningfully different while preserving their backend roles and emphasis. Prefer different exercises where suitable.",
        "Use resistance exercises once by default and never three times when an unused option exists. Cardio may repeat. Set duplicate_reason to null; Fitnet normalizes repeats.",
        "Choose sets, rep ranges, and rest only inside the supplied safe ranges, working-set budget, and selected session duration with its 10% tolerance.",
        "Order demanding resistance work before accessories. Cardio stays in its final fixed slot and copies its minute range exactly.",
        "Strength format: reps like \"8-12\", rest like \"60 sec\", and notes exactly empty. Cardio format: reps like \"10-20 min\", rest exactly \"-\", and concise notes with duration, setting, and moderate intensity.",
        "Ground the concise rationale in supplied context. Do not claim diagnosis, rehabilitation, guaranteed outcomes, or unsupported personalization.",
        "For each exercise add one short, movement-specific technique cue and non-numeric effort guidance. Make cues actionable and vary their wording across the plan; do not repeatedly rely on generic words such as controlled, smooth, or stable. Add zero to three IDs from its approved_substitution_ids.",
        "Write complete load, progression, difficulty, pain, recovery, and safety guidance for the same weekly routine. Never claim that substitutions are listed or provided in this plan; for pain, tell the user to stop, choose a comfortable alternative available in the Fitnet app, or skip the exercise.",
        "Recovery guidance must cover fatigue and scheduling decisions without repeating the four-week instruction or progression rules.",
        "Every user-facing sentence must sound like natural coaching. Never mention backend, candidate pool, catalog, injury flags, validation, schema, approved ID, or slot ID.",
        language === "ar"
          ? "Write every user-facing coaching field in natural Modern Standard Arabic. Keep every exercise_name exactly as supplied in English; never translate, transliterate, or alter exercise names. Keep numeric ranges and units unambiguous."
          : "Write every user-facing coaching field in English. Keep every exercise_name exactly as supplied in English.",
        "Do not output warm-ups, RIR, RPE, tempo, distinct weeks, deloads, or any unsupported field.",
        "Return one valid JSON object only. No markdown, comments, or prose outside JSON."
      ].join(" "),
      user: JSON.stringify(
        {
          task: "Generate the final Fitnet weekly workout plan.",
          output_language: language === "ar" ? "Arabic" : "English",
          priority_order: [
            "approved IDs and safety",
            "fixed slot and day coverage",
            "session-time feasibility",
            "goal and experience alignment",
            "focus-area emphasis",
            "exercise variety"
          ],
          internal_quality_target: {
            minimum_score: 85,
            categories: ["movement and muscle coverage", "goal and focus alignment", "injury compatibility", "weekly volume balance", "session-time feasibility", "redundancy control", "coaching completeness"]
          },
          user_context: normalizedInput,
          backend_coaching_strategy: coachingStrategy,
          fixed_weekly_skeleton: skeleton,
          approved_exercise_catalog: slimExerciseCatalog(candidateMap),
          candidates_by_slot: slimExerciseSlotMap(candidateMap),
          safe_output_requirements: {
            required_root_fields: WORKOUT_V3_ALLOWED_ROOT_KEYS,
            program_summary_fields: WORKOUT_V2_PROGRAM_SUMMARY_KEYS,
            day_fields: WORKOUT_V2_DAY_KEYS,
            forbidden_fields: ["weeks", "weekly_progression", "week_progression", "progression_rules", "deload", "rir", "rpe", "effort", "cue", "tempo", "warm_up", "month_plan", "week_1", "week_2", "week_3", "week_4"],
            exercise_fields: WORKOUT_V3_ALLOWED_EXERCISE_KEYS,
            field_types: {
              program_summary: "object",
              plan_days: "array of day objects",
              repeat_instruction: "string",
              safety_notes: "array of strings",
              day_index: "integer",
              day_name: "string copied from fixed skeleton",
              day_focus: "short user-facing string",
              exercises: "array with exactly one object per fixed slot",
              exercise_id: "integer from candidates_by_slot",
              sets: "integer",
              reps: "string range",
              rest: "string",
              notes: "string",
              effort_guidance: "short non-numeric string without RIR or RPE",
              coaching_cue: "one concise technique cue",
              substitution_ids: "zero to three integers from the selected candidate's approved_substitution_ids",
            duplicate_reason: "string or null"
            },
            table_columns: ["Exercise", "Sets", "Reps", "Rest", "Notes"],
            strength_notes_rule: "Strength exercise notes must be empty.",
            cardio_rule: "Only an explicit cardio slot may use minute-based reps or cardio notes. Copy its fixed rep_range exactly as the minute range and use rest exactly '-'.",
            echo_rule: "Echo backend goal, split, days, duration, place, equipment, focus areas, injuries, fixed day indexes, fixed day names, slot IDs, and approved exercise metadata without changing them.",
            rationale_rule: "Explain the coaching decisions using only supplied context; do not repeat technical IDs or internal validation language.",
            progression_rule: "Use repeat_instruction for a simple double-progression instruction while keeping the same weekly routine."
          },
          output_schema_id: "fitnet.workout.output.v3"
        }
      )
    };
  }

  function buildWorkoutSelectionPromptV2(args) {
    return buildWorkoutSelectionPromptV3(args);
  }

  function buildNutritionSelectionPrompt({ normalizedInput, skeleton, candidateMap }) {
    return {
      prompt_version: "nutrition_selection_v1",
      response_format: "json_schema",
      system: [
        "You are Fitnet's constrained nutrition selection engine.",
        "You do not create foods or meal slots freely.",
        HARD_ID_RULE,
        "Use only approved food IDs from each meal candidate list.",
        "Return JSON only. No markdown, prose, comments, or extra fields."
      ].join(" "),
      user: JSON.stringify(
        {
          task: "Select approved foods for each fixed meal slot and return calculated meal totals.",
          user_context: normalizedInput,
          fixed_skeleton: skeleton,
          candidates_by_slot: slimCandidateMap(candidateMap, "food"),
          output_schema_id: "fitnet.nutrition.output.v1"
        },
        null,
        2
      )
    };
  }

  function buildNutritionSelectionPromptV2({ normalizedInput, skeleton, candidateMap, language = "en" }) {
    return {
      prompt_version: "nutrition_program_v2",
      response_format: "json_schema",
      system: [
        "You are Fitnet's constrained meal selection engine.",
        "Select exactly one approved meal_id for every fixed day and meal slot.",
        "The backend owns meal names, ingredients, quantities, cooking instructions, nutrition values, portions, totals, grocery lists, safety notes, and all other user-facing content.",
        "Use only meal_id values listed for that slot. Do not return or invent recipe details, nutrition values, explanations, substitutions, duplicate reasons, or extra fields.",
        "Across each day, prefer candidates whose listed calories and macros best match the provided daily targets.",
        "Prefer unused recipes, avoid repeating the same protein family across breakfast, lunch, and dinner on one day, allow at most two meals from one protein family when snacks are included, and use at least three protein families and carbohydrate bases across the week when approved candidates allow it.",
        "Prefer lower-sodium candidates and avoid selecting more than one high sodium-risk meal in a day.",
        "Return valid JSON only. No markdown or prose outside JSON."
      ].join(" "),
      user: JSON.stringify(
        {
          task: "Select approved meals for the fixed 7-day schedule.",
          output_language: language === "ar" ? "Arabic" : "English",
          user_context: {
            goal: normalizedInput.goal,
            diet_style: normalizedInput.diet_style,
            meals_per_day: normalizedInput.meals_per_day,
            requested_meals_per_day: normalizedInput.requested_meals_per_day,
            daily_calorie_target: normalizedInput.calorie_target,
            daily_macro_targets: normalizedInput.macro_targets,
            fiber_target_g: normalizedInput.fiber_target_g,
            food_preferences: normalizedInput.food_preferences
          },
          fixed_7_day_skeleton: skeleton.map((day) => ({
            day_index: day.day_index,
            meals: day.meals.map((meal) => ({ meal_slot: meal.meal_slot }))
          })),
          candidates_by_slot: slimCandidateMap(candidateMap, "meal"),
          output_shape: {
            selection_version: NUTRITION_SELECTION_VERSION,
            days: [{ day_index: 1, meals: [{ meal_slot: "breakfast", meal_id: "breakfast_001" }] }]
          },
          output_schema_id: NUTRITION_SELECTION_VERSION
        },
        null,
        2
      )
    };
  }

  function canonicalizeNutritionSelectionV1(value) {
    return {
      selection_version: NUTRITION_SELECTION_VERSION,
      days: toArray(value?.days).map((day) => ({
        day_index: Number(day.day_index),
        meals: toArray(day.meals).map((meal) => ({
          meal_slot: String(meal.meal_slot || ""),
          meal_id: String(meal.meal_id || "")
        }))
      }))
    };
  }

  function buildRepairPrompt({ planType, validationErrors, invalidJson, allowedCandidateIds }) {
    return {
      prompt_version: `${planType}_repair_v1`,
      response_format: "json_schema",
      system: [
        `You repair invalid Fitnet ${planType} JSON.`,
        HARD_ID_RULE,
        REPAIR_RULE
      ].join(" "),
      user: JSON.stringify(
        {
          validation_errors: validationErrors,
          invalid_json: invalidJson,
          allowed_candidate_ids: allowedCandidateIds
        },
        null,
        2
      )
    };
  }

  function canonicalizeWorkoutPlan(plan) {
    return {
      coaching_rationale: plan.coaching_rationale === undefined ? null : String(plan.coaching_rationale || ""),
      plan_days: toArray(plan.plan_days).map((day) => ({
        day_index: Number(day.day_index),
        day_name: String(day.day_name || ""),
        exercises: toArray(day.exercises).map((exercise) => ({
          slot_id: String(exercise.slot_id || ""),
          exercise_id: Number(exercise.exercise_id),
          sets: Number(exercise.sets),
          reps: toArray(exercise.reps).map(Number),
          rest_seconds: Number(exercise.rest_seconds),
          notes: exercise.notes === undefined ? null : exercise.notes
        }))
      }))
    };
  }

  function canonicalizeWorkoutPlanV2(plan) {
    return {
      program_summary: {
        goal: String(plan.program_summary?.goal || ""),
        split: String(plan.program_summary?.split || ""),
        days_per_week: Number(plan.program_summary?.days_per_week),
        session_duration_minutes: Number(plan.program_summary?.session_duration_minutes),
        workout_place: String(plan.program_summary?.workout_place || ""),
        available_equipment: toArray(plan.program_summary?.available_equipment).map(String),
        focus_muscles: toArray(plan.program_summary?.focus_muscles).map(String),
        injuries: toArray(plan.program_summary?.injuries).map(String),
        disliked_exercises: toArray(plan.program_summary?.disliked_exercises).map(String),
        coaching_rationale: String(plan.program_summary?.coaching_rationale || "")
      },
      plan_days: toArray(plan.plan_days).map((day) => ({
        day_index: Number(day.day_index),
        day_name: String(day.day_name || ""),
        day_focus: String(day.day_focus || ""),
        exercises: toArray(day.exercises).map((exercise) => ({
          slot_id: String(exercise.slot_id || ""),
          exercise_id: Number(exercise.exercise_id),
          exercise_name: String(exercise.exercise_name || ""),
          exercise_category: String(exercise.exercise_category || ""),
          movement_pattern: String(exercise.movement_pattern || ""),
          muscle_group: String(exercise.muscle_group || ""),
          sets: Number(exercise.sets),
          reps: String(exercise.reps || ""),
          rest: String(exercise.rest || ""),
          notes: String(exercise.notes || ""),
          duplicate_reason: exercise.duplicate_reason ? String(exercise.duplicate_reason) : null
        }))
      })),
      repeat_instruction: String(plan.repeat_instruction || "Repeat this weekly plan for 4 weeks."),
      safety_notes: toArray(plan.safety_notes).map(String)
    };
  }

  function canonicalizeWorkoutPlanV3(plan) {
    const v2 = canonicalizeWorkoutPlanV2(plan);
    return {
      program_version: String(plan.program_version || "fitnet.workout.output.v3"),
      program_summary: v2.program_summary,
      plan_days: v2.plan_days.map((day, dayIndex) => ({
        ...day,
        exercises: day.exercises.map((exercise, exerciseIndex) => {
          const source = toArray(plan.plan_days)[dayIndex]?.exercises?.[exerciseIndex] || {};
          return {
            ...exercise,
            effort_guidance: String(source.effort_guidance || ""),
            coaching_cue: String(source.coaching_cue || ""),
            substitution_ids: toArray(source.substitution_ids).map(Number).filter(Number.isInteger)
          };
        })
      })),
      progression_guidance: {
        starting_load: String(plan.progression_guidance?.starting_load || ""),
        increase_reps: String(plan.progression_guidance?.increase_reps || ""),
        increase_load: String(plan.progression_guidance?.increase_load || ""),
        if_too_hard: String(plan.progression_guidance?.if_too_hard || ""),
        if_pain_occurs: String(plan.progression_guidance?.if_pain_occurs || "")
      },
      recovery_guidance: toArray(plan.recovery_guidance).map(String),
      pain_safety_guidance: toArray(plan.pain_safety_guidance).map(String),
      repeat_instruction: v2.repeat_instruction
    };
  }

  function canonicalizeNutritionPlan(plan) {
    return {
      nutrition_days: toArray(plan.nutrition_days).map((day) => ({
        day_index: Number(day.day_index),
        meals: toArray(day.meals).map((meal) => ({
          meal_slot: String(meal.meal_slot || ""),
          meal_name: String(meal.meal_name || ""),
          food_ids: toArray(meal.food_ids).map(Number),
          calories: Number(meal.calories),
          protein_g: Number(meal.protein_g),
          carbs_g: Number(meal.carbs_g),
          fat_g: Number(meal.fat_g),
          notes: String(meal.notes || "")
        })),
        daily_totals: {
          calories: Number(day.daily_totals?.calories),
          protein_g: Number(day.daily_totals?.protein_g),
          carbs_g: Number(day.daily_totals?.carbs_g),
          fat_g: Number(day.daily_totals?.fat_g)
        }
      }))
    };
  }

  function canonicalizeNutritionPlanV2(plan) {
    return {
      program_version: "fitnet.nutrition.output.v2",
      nutrition_summary: {
        goal: String(plan.nutrition_summary?.goal || ""),
        daily_calorie_target: Number(plan.nutrition_summary?.daily_calorie_target || 0),
        calculation_version: String(plan.nutrition_summary?.calculation_version || "fitnet.calorie_target.v2"),
        target_is_estimate: plan.nutrition_summary?.target_is_estimate !== false,
        estimated_resting_calories: Number(plan.nutrition_summary?.estimated_resting_calories || 0),
        estimated_maintenance_calories: Number(plan.nutrition_summary?.estimated_maintenance_calories || 0),
        activity_level: String(plan.nutrition_summary?.activity_level || "Mostly sitting"),
        goal_adjustment_calories: Number(plan.nutrition_summary?.goal_adjustment_calories || 0),
        daily_macro_targets: {
          protein_g: Number(plan.nutrition_summary?.daily_macro_targets?.protein_g || 0),
          carbs_g: Number(plan.nutrition_summary?.daily_macro_targets?.carbs_g || 0),
          fat_g: Number(plan.nutrition_summary?.daily_macro_targets?.fat_g || 0),
          fiber_g: Number(plan.nutrition_summary?.daily_macro_targets?.fiber_g || 0)
        },
        meals_per_day: Number(plan.nutrition_summary?.meals_per_day || 0),
        nutrition_rationale: String(plan.nutrition_summary?.nutrition_rationale || "")
      },
      days: toArray(plan.days).map((day) => ({
        day_index: Number(day.day_index),
        day_name: String(day.day_name || `Day ${Number(day.day_index) || ""}`).trim(),
        meals: toArray(day.meals).map((meal) => ({
          meal_slot: String(meal.meal_slot || ""),
          meal_id: String(meal.meal_id || ""),
          meal_name: String(meal.meal_name || ""),
          ingredients: toArray(meal.ingredients).map((ingredient) => ({
            ingredient_id: String(ingredient.ingredient_id || ""),
            name: String(ingredient.name || ""),
            quantity_g: Number(ingredient.quantity_g || ingredient.grams || 0),
            household_quantity: String(ingredient.household_quantity || ingredient.household_amount || ""),
            category: String(ingredient.category || "Pantry"),
            ingredient_role: String(ingredient.ingredient_role || "")
          })),
          cooking_method: String(meal.cooking_method || toArray(meal.prep_steps).join(" ")),
          prep_time_minutes: Number(meal.prep_time_minutes || 0),
          cooking_time_minutes: Number(meal.cooking_time_minutes || 0),
          calories: Number(meal.calories),
          protein_g: Number(meal.protein_g),
          carbs_g: Number(meal.carbs_g),
          fat_g: Number(meal.fat_g),
          fiber_g: Number(meal.fiber_g || 0),
          duplicate_reason: meal.duplicate_reason ? String(meal.duplicate_reason) : null,
          variety_reason: meal.variety_reason ? String(meal.variety_reason) : null,
          sodium_reason: meal.sodium_reason ? String(meal.sodium_reason) : null
        })),
        daily_totals: {
          calories: Number(day.daily_totals?.calories || 0),
          protein_g: Number(day.daily_totals?.protein_g || 0),
          carbs_g: Number(day.daily_totals?.carbs_g || 0),
          fat_g: Number(day.daily_totals?.fat_g || 0),
          fiber_g: Number(day.daily_totals?.fiber_g || 0)
        }
      })),
      weekly_grocery_list: toArray(plan.weekly_grocery_list).map((group) => ({
        category: String(group.category || "Pantry"),
        items: toArray(group.items).map((item) => ({
          ingredient_id: String(item.ingredient_id || ""),
          name: String(item.name || ""),
          quantity_g: Number(item.quantity_g || item.total_grams || 0),
          quantity_label: String(item.quantity_label || ""),
          purchase_state: String(item.purchase_state || "as listed"),
          conversion_applied: Boolean(item.conversion_applied)
        }))
      })),
      repeat_instruction: String(plan.repeat_instruction || "Repeat this 7-day meal plan for 4 weeks."),
      safety_notes: toArray(plan.safety_notes).map(String)
    };
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === "") return [];
    return [value];
  }

  function validateWorkoutContract(plan, skeleton, candidateMap) {
    const errors = [];
    const candidateIds = flattenCandidateIds(candidateMap, "exercise_id");
    const expectedSlots = skeleton.flatMap((day) => day.slots);
    const expectedSlotIds = new Set(expectedSlots.map((slot) => slot.slot_id));
    const seenSlotIds = new Set();

    if (!isPlainObject(plan) || !Array.isArray(plan.plan_days)) {
      return { valid: false, errors: ["schema:missing_plan_days"] };
    }

    validateKeys(plan, WORKOUT_ALLOWED_ROOT_KEYS, "root", errors);

    if (
      plan.coaching_rationale !== undefined &&
      plan.coaching_rationale !== null &&
      typeof plan.coaching_rationale !== "string"
    ) {
      errors.push("schema:invalid_coaching_rationale");
    }

    for (const day of plan.plan_days) {
      validateKeys(day, WORKOUT_ALLOWED_DAY_KEYS, `day:${day.day_index}`, errors);

      if (!Number.isInteger(day.day_index) || !day.day_name || !Array.isArray(day.exercises)) {
        errors.push(`schema:invalid_day:${day.day_index}`);
        continue;
      }

      for (const exercise of day.exercises) {
        validateKeys(exercise, WORKOUT_ALLOWED_EXERCISE_KEYS, `exercise:${exercise.slot_id}`, errors);

        if (!expectedSlotIds.has(exercise.slot_id)) {
          errors.push(`extra_slot:${exercise.slot_id}`);
          continue;
        }

        if (seenSlotIds.has(exercise.slot_id)) {
          errors.push(`duplicate_slot:${exercise.slot_id}`);
        }

        seenSlotIds.add(exercise.slot_id);

        if (!candidateIds[exercise.slot_id]?.has(Number(exercise.exercise_id))) {
          errors.push(`exercise_id_not_in_slot_candidates:${exercise.slot_id}:${exercise.exercise_id}`);
        }

        if (!Number.isInteger(exercise.sets) || !Array.isArray(exercise.reps) || exercise.reps.length !== exercise.sets) {
          errors.push(`schema:invalid_sets_or_reps:${exercise.slot_id}`);
        }
      }
    }

    for (const slotId of expectedSlotIds) {
      if (!seenSlotIds.has(slotId)) {
        errors.push(`missing_slot:${slotId}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function validateNutritionContract(plan, skeleton, candidateMap) {
    const errors = [];
    const candidateIds = flattenCandidateIds(candidateMap, "food_id");
    const expectedSlots = skeleton.flatMap((day) => day.meals);
    const expectedMealSlots = new Set(expectedSlots.map((slot) => slot.meal_slot));
    const seenMealSlots = new Set();

    if (!isPlainObject(plan) || !Array.isArray(plan.nutrition_days)) {
      return { valid: false, errors: ["schema:missing_nutrition_days"] };
    }

    validateKeys(plan, ["nutrition_days"], "root", errors);

    for (const day of plan.nutrition_days) {
      validateKeys(day, NUTRITION_ALLOWED_DAY_KEYS, `nutrition_day:${day.day_index}`, errors);

      if (!Number.isInteger(day.day_index) || !Array.isArray(day.meals) || !isPlainObject(day.daily_totals)) {
        errors.push(`schema:invalid_nutrition_day:${day.day_index}`);
        continue;
      }

      validateKeys(day.daily_totals, NUTRITION_ALLOWED_TOTAL_KEYS, `daily_totals:${day.day_index}`, errors);

      for (const meal of day.meals) {
        validateKeys(meal, NUTRITION_ALLOWED_MEAL_KEYS, `meal:${meal.meal_slot}`, errors);

        if (!expectedMealSlots.has(meal.meal_slot)) {
          errors.push(`extra_meal:${meal.meal_slot}`);
          continue;
        }

        if (seenMealSlots.has(meal.meal_slot)) {
          errors.push(`duplicate_meal:${meal.meal_slot}`);
        }

        seenMealSlots.add(meal.meal_slot);
        const slot = expectedSlots.find((item) => item.meal_slot === meal.meal_slot);

        for (const foodId of meal.food_ids || []) {
          if (!candidateIds[slot.slot_id]?.has(Number(foodId))) {
            errors.push(`food_id_not_in_meal_candidates:${meal.meal_slot}:${foodId}`);
          }
        }

        if (!meal.meal_name || !Array.isArray(meal.food_ids) || meal.food_ids.length === 0) {
          errors.push(`schema:invalid_meal:${meal.meal_slot}`);
        }
      }
    }

    for (const mealSlot of expectedMealSlots) {
      if (!seenMealSlots.has(mealSlot)) {
        errors.push(`missing_meal:${mealSlot}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function collectAllowedCandidateIds(candidateMap, idField) {
    return Object.fromEntries(
      Object.entries(candidateMap).map(([slotId, candidates]) => [
        slotId,
        candidates.map((candidate) => Number(candidate[idField]))
      ])
    );
  }

  function slimCandidateMap(candidateMap, type) {
    const idField = type === "exercise" ? "exercise_id" : type === "meal" ? "meal_id" : "food_id";

    return Object.fromEntries(
      Object.entries(candidateMap).map(([slotId, candidates]) => [
        slotId,
        candidates.map((candidate) => {
          if (type === "meal") {
            return {
              id: String(candidate[idField]),
              name: candidate.meal_name,
              meal_type: candidate.meal_type,
              calories: candidate.calories,
              protein_g: candidate.protein_g,
              carbs_g: candidate.carbs_g,
              fat_g: candidate.fat_g,
              fiber_g: candidate.fiber_g,
              min_practical_calories: candidate.min_practical_calories,
              max_practical_calories: candidate.max_practical_calories,
              sodium_risk: candidate.sodium_risk,
              diet_tags: candidate.diet_tags,
              goal_tags: candidate.goal_tags,
              cuisine_style: candidate.cuisine_style,
              protein_family: candidate.protein_family,
              carb_base: candidate.carb_base,
              richness_level: candidate.richness_level,
              cooking_technique: candidate.cooking_technique,
              sauce_limit_g: candidate.sauce_limit_g,
              prep_time_minutes: candidate.prep_time_minutes,
              cooking_time_minutes: candidate.cooking_time_minutes
            };
          }

          return {
            id: Number(candidate[idField]),
            name: candidate.display_name || candidate.name,
            category: candidate.category,
            sub_muscles: type === "exercise" ? candidate.sub_muscles : undefined,
            movement_family: type === "exercise" ? candidate.movement_family || candidate.movement_pattern : undefined,
            training_role: type === "exercise" ? candidate.training_role : undefined,
            exercise_type: type === "exercise" ? candidate.exercise_type : undefined,
            difficulty: type === "exercise" ? candidate.difficulty : undefined,
            laterality: type === "exercise" ? candidate.laterality : undefined,
            fatigue_cost: type === "exercise" ? candidate.fatigue_cost : undefined,
            time_multiplier: type === "exercise" ? candidate.time_multiplier : undefined,
            ordering_priority: type === "exercise" ? candidate.ordering_priority : undefined,
            recommended_rep_range: type === "exercise" ? candidate.recommended_rep_range : undefined,
            recommended_rest_seconds: type === "exercise" ? candidate.recommended_rest_seconds : undefined,
            injury_flags: type === "exercise" ? candidate.injury_flags || candidate.contraindications : undefined,
            substitution_group: type === "exercise" ? candidate.substitution_group : undefined,
            approved_substitution_ids: type === "exercise" ? candidate.approved_substitution_ids || [] : undefined,
            tags: type === "exercise" ? undefined : candidate.diet_tags
          };
        })
      ])
    );
  }

  function slimExerciseCatalog(candidateMap) {
    const catalog = {};
    for (const candidates of Object.values(candidateMap)) {
      for (const candidate of candidates) {
        const id = String(candidate.exercise_id);
        if (catalog[id]) continue;
        catalog[id] = {
          name: candidate.display_name || candidate.name,
          category: candidate.category,
          sub_muscles: candidate.sub_muscles,
          movement_family: candidate.movement_family || candidate.movement_pattern,
          training_role: candidate.training_role,
          exercise_type: candidate.exercise_type,
          difficulty: candidate.difficulty,
          injury_flags: candidate.injury_flags || candidate.contraindications
        };
      }
    }
    return catalog;
  }

  function slimExerciseSlotMap(candidateMap) {
    return Object.fromEntries(
      Object.entries(candidateMap).map(([slotId, candidates]) => [
        slotId,
        candidates.map((candidate) => ({
          id: Number(candidate.exercise_id),
          approved_substitution_ids: candidate.approved_substitution_ids || []
        }))
      ])
    );
  }

  function flattenCandidateIds(candidateMap, idField) {
    return Object.fromEntries(
      Object.entries(candidateMap).map(([slotId, candidates]) => [
        slotId,
        new Set(candidates.map((candidate) => Number(candidate[idField])))
      ])
    );
  }

  function validateKeys(value, allowedKeys, path, errors) {
    if (!isPlainObject(value)) {
      errors.push(`schema:not_object:${path}`);
      return;
    }

    for (const key of Object.keys(value)) {
      if (!allowedKeys.includes(key)) {
        errors.push(`schema:extra_field:${path}:${key}`);
      }
    }
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  const api = {
    HARD_ID_RULE,
    REPAIR_RULE,
    buildWorkoutSelectionPrompt,
    buildWorkoutSelectionPromptV2,
    buildWorkoutSelectionPromptV3,
    buildNutritionSelectionPrompt,
    buildNutritionSelectionPromptV2,
    buildRepairPrompt,
    canonicalizeWorkoutPlan,
    canonicalizeWorkoutPlanV2,
    canonicalizeWorkoutPlanV3,
    canonicalizeNutritionPlan,
    canonicalizeNutritionPlanV2,
    canonicalizeNutritionSelectionV1,
    validateWorkoutContract,
    validateNutritionContract,
    collectAllowedCandidateIds
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.FitnetPlanContracts = api;
})(typeof window !== "undefined" ? window : globalThis);
