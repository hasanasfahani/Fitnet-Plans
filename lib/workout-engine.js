(function attachWorkoutEngine(root) {
  const DIFFICULTY_RANK = {
    Beginner: 1,
    Intermediate: 2,
    Advanced: 3,
    Unreviewed: 2
  };

  const DAY_NAMES = {
    full_body_2: ["Full Body A", "Full Body B"],
    upper_lower_full_body_3: ["Upper", "Lower", "Full Body"],
    upper_lower_ab_4: ["Upper A", "Lower A", "Upper B", "Lower B"],
    ppl_upper_lower_5: ["Push", "Pull", "Legs", "Upper", "Lower"],
    ppl_x2_6: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"],
    full_body: ["Full Body A", "Full Body B", "Full Body C", "Full Body D", "Full Body E", "Full Body F"],
    upper_lower: ["Upper A", "Lower A", "Upper B", "Lower B", "Upper C", "Lower C"],
    push_pull_legs: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"],
    body_part: ["Chest", "Back", "Legs", "Shoulders", "Arms", "Conditioning"]
  };

  const FOCUS_CATEGORY_MAP = {
    Glutes: ["Legs"],
    Chest: ["Chest"],
    Back: ["Back"],
    Shoulders: ["Shoulders"],
    Arms: ["Biceps", "Triceps"],
    Core: ["Core"],
    Legs: ["Legs"],
    Cardio: ["Cardio"]
  };

  const PLACE_EQUIPMENT_LIMITS = {
    Home: ["Bodyweight", "Dumbbells", "Resistance bands", "Kettlebell", "Bench", "Jump rope"],
    "Building Gym": ["Bodyweight", "Dumbbells", "Barbell", "Cable machine", "Kettlebell", "Machines", "Bench", "Treadmill", "Upright stationary bike", "Recumbent bike", "Elliptical / cross-trainer"],
    Gym: ["Bodyweight", "Dumbbells", "Barbell", "Cable machine", "Kettlebell", "Machines", "Bench", "Treadmill", "Upright stationary bike", "Recumbent bike", "Elliptical / cross-trainer", "Rowing ergometer"],
    "Full Equipment Gym": [
      "Bodyweight",
      "Dumbbells",
      "Barbell",
      "Cable machine",
      "Resistance bands",
      "Kettlebell",
      "Machines",
      "Bench",
      "Treadmill",
      "Upright stationary bike",
      "Recumbent bike",
      "Elliptical / cross-trainer",
      "Rowing ergometer",
      "Stepmill / stair climber"
    ]
  };

  const COACHING_RULES_VERSION = "workout_coaching_rules_v1";
  const CANDIDATE_POLICY_VERSION = "workout_candidate_policy_v2";
  const AI_QUALITY_POLICY_VERSION = "workout_ai_quality_policy_v2";
  const USER_FACING_LANGUAGE_POLICY_VERSION = "workout_user_facing_language_v1";
  const MAX_CANDIDATES_PER_SLOT = 5;
  const CANONICAL_TRAINING_ROLES = new Set([
    "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull",
    "knee_dominant", "hip_dominant", "unilateral_lower_body",
    "quadriceps_isolation", "hamstring_isolation", "calves",
    "side_rear_delts", "biceps", "triceps", "forearms", "core", "cardio"
  ]);
  const LOWER_DAY_ALLOWED_ROLES = new Set([
    "knee_dominant", "hip_dominant", "unilateral_lower_body",
    "quadriceps_isolation", "hamstring_isolation", "calves", "core", "cardio"
  ]);
  const WORKOUT_QUALITY_SCORE_THRESHOLD = 85;
  const SESSION_DURATION_TOLERANCE = 1;
  const CARDIO_DURATION_POLICY_VERSION = "workout_cardio_duration_policy_v1";
  const SET_EXECUTION_SECONDS = {
    compound: 40,
    isolation: 35,
    core: 40
  };

  function setExecutionSeconds(slot, normalized) {
    if (slot.exercise_type === "compound" && normalized.goal === "Gain Strength") return 30;
    return SET_EXECUTION_SECONDS[slot.exercise_type] || 35;
  }

  const SESSION_BUDGETS = [
    { max_minutes: 30, target_exercises: 5, min_exercises: 5, max_exercises: 5, min_working_sets: 10, max_working_sets: 14, focus_priority_slots: 1 },
    { max_minutes: 45, target_exercises: 6, min_exercises: 6, max_exercises: 6, min_working_sets: 14, max_working_sets: 18, focus_priority_slots: 1 },
    { max_minutes: 60, target_exercises: 7, min_exercises: 7, max_exercises: 7, min_working_sets: 17, max_working_sets: 22, focus_priority_slots: 2 },
    { max_minutes: 75, target_exercises: 8, min_exercises: 8, max_exercises: 8, min_working_sets: 20, max_working_sets: 26, focus_priority_slots: 2 },
    { max_minutes: Infinity, target_exercises: 8, min_exercises: 8, max_exercises: 8, min_working_sets: 20, max_working_sets: 26, focus_priority_slots: 2 }
  ];

  const DAY_COACHING_RULES = {
    full_body: {
      required_muscle_groups: ["Chest", "Back", "Legs"],
      required_pattern_groups: [["push"], ["horizontal_pull", "vertical_pull"], ["squat", "lunge", "hip_extension"], ["hinge"]],
      optional_muscle_groups: ["Shoulders", "Core", "Biceps", "Triceps"],
      max_repeated_muscle_slots: 2
    },
    upper: {
      required_muscle_groups: ["Chest", "Back", "Shoulders"],
      required_pattern_groups: [["push"], ["horizontal_pull", "vertical_pull"]],
      optional_muscle_groups: ["Biceps", "Triceps", "Core"],
      max_repeated_muscle_slots: 2
    },
    lower: {
      required_muscle_groups: ["Legs"],
      required_pattern_groups: [["squat", "lunge", "hip_extension"], ["hinge"]],
      optional_muscle_groups: ["Core", "Cardio"],
      max_repeated_muscle_slots: 5
    },
    push: {
      required_muscle_groups: ["Chest", "Shoulders", "Triceps"],
      required_pattern_groups: [["push"], ["elbow_extension"]],
      optional_muscle_groups: ["Core", "Cardio"],
      max_repeated_muscle_slots: 2
    },
    pull: {
      required_muscle_groups: ["Back", "Biceps"],
      required_pattern_groups: [["horizontal_pull"], ["vertical_pull"], ["elbow_flexion"]],
      optional_muscle_groups: ["Shoulders", "Forearms", "Core", "Cardio"],
      max_repeated_muscle_slots: 3
    }
  };

  const DAY_TRAINING_ROLE_TEMPLATES = {
    "Full Body A": ["knee_dominant", "horizontal_push", "horizontal_pull", "hip_dominant", "core", "vertical_pull", "side_rear_delts", "biceps"],
    "Full Body B": ["hip_dominant", "horizontal_push", "vertical_pull", "knee_dominant", "side_rear_delts", "vertical_push", "triceps", "core"],
    Upper: ["horizontal_push", "horizontal_pull", "vertical_pull", "vertical_push", "triceps", "biceps", "horizontal_push", "core"],
    "Upper A": ["horizontal_push", "horizontal_pull", "triceps", "side_rear_delts", "horizontal_push", "vertical_pull", "biceps", "core"],
    "Upper B": ["vertical_push", "vertical_pull", "horizontal_push", "biceps", "horizontal_pull", "side_rear_delts", "triceps", "core"],
    Lower: ["knee_dominant", "hip_dominant", "unilateral_lower_body", "hamstring_isolation", "calves", "core", "quadriceps_isolation", "core"],
    "Lower A": ["knee_dominant", "unilateral_lower_body", "hip_dominant", "hamstring_isolation", "calves", "core", "quadriceps_isolation", "core"],
    "Lower B": ["hip_dominant", "hip_dominant", "knee_dominant", "hamstring_isolation", "quadriceps_isolation", "calves", "core", "core"],
    Push: ["horizontal_push", "vertical_push", "triceps", "horizontal_push", "side_rear_delts", "core", "core", "forearms"],
    "Push A": ["horizontal_push", "vertical_push", "triceps", "horizontal_push", "side_rear_delts", "core", "core", "forearms"],
    "Push B": ["vertical_push", "horizontal_push", "triceps", "side_rear_delts", "horizontal_push", "core", "forearms", "core"],
    Pull: ["horizontal_pull", "vertical_pull", "biceps", "side_rear_delts", "forearms", "core", "horizontal_pull", "core"],
    "Pull A": ["horizontal_pull", "vertical_pull", "biceps", "side_rear_delts", "forearms", "core", "horizontal_pull", "core"],
    "Pull B": ["vertical_pull", "horizontal_pull", "biceps", "side_rear_delts", "horizontal_pull", "core", "forearms", "core"],
    Legs: ["knee_dominant", "unilateral_lower_body", "hip_dominant", "hamstring_isolation", "calves", "core", "quadriceps_isolation", "core"],
    "Legs A": ["knee_dominant", "unilateral_lower_body", "hip_dominant", "hamstring_isolation", "calves", "core", "quadriceps_isolation", "core"],
    "Legs B": ["hip_dominant", "hip_dominant", "knee_dominant", "hamstring_isolation", "quadriceps_isolation", "calves", "core", "core"]
  };
  const HOME_LOWER_ROLE_TEMPLATES = {
    A: ["knee_dominant", "unilateral_lower_body", "hip_dominant", "hip_dominant", "core", "core", "calves", "core"],
    B: ["hip_dominant", "hip_dominant", "knee_dominant", "unilateral_lower_body", "core", "core", "calves", "core"]
  };

  function generateWorkoutPlan(input, exerciseLibrary, options = {}) {
    const normalized = normalizeWorkoutInput(input);
    const skeleton = buildWorkoutSkeleton(normalized);
    const candidateMap = filterCandidatesForSkeleton(skeleton, normalized, exerciseLibrary);
    const initialPlan = selectWorkoutExercises(skeleton, candidateMap, normalized, options);
    const validation = validateWorkoutPlan(initialPlan, skeleton, candidateMap, normalized);

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

    const repairedPlan = repairWorkoutPlan(initialPlan, skeleton, candidateMap, validation.errors);
    const repairedValidation = validateWorkoutPlan(repairedPlan, skeleton, candidateMap, normalized);

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

    const fallbackPlan = buildFallbackWorkoutPlan(skeleton, candidateMap);
    const fallbackValidation = validateWorkoutPlan(fallbackPlan, skeleton, candidateMap, normalized);

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

  function generateWorkoutPlanV2(input, exerciseLibrary, options = {}) {
    const normalized = normalizeWorkoutInput(input);
    const coachingStrategy = buildWorkoutCoachingStrategy(normalized);
    let skeleton = buildWorkoutSkeleton(normalized, coachingStrategy);
    const candidateDiagnostics = {};
    const candidateMap = filterCandidatesForSkeleton(skeleton, normalized, exerciseLibrary, candidateDiagnostics);
    skeleton = pruneUnavailableCardioSlots(skeleton, candidateMap, normalized);
    fitResistanceSetsToSession(skeleton, candidateMap, normalized, coachingStrategy);
    rebalanceWeeklyPushPullSets(skeleton, normalized, coachingStrategy);
    rebalanceWeeklyLowerBodySets(skeleton, normalized, coachingStrategy);
    rebalanceWeeklyDirectArmSets(skeleton, coachingStrategy);
    finalizeCardioDurations(skeleton, candidateMap, normalized, coachingStrategy);
    const strategyValidation = validateWorkoutCoachingStrategy(coachingStrategy, skeleton);
    const candidateValidation = validateWorkoutCandidateCoverage(skeleton, candidateMap, candidateDiagnostics, normalized);
    const plan = buildFallbackWorkoutPlanV2(skeleton, candidateMap, normalized, options);
    const validation = validateWorkoutPlanV2(plan, skeleton, candidateMap, normalized);

    return {
      status: validation.valid && strategyValidation.valid && candidateValidation.valid ? "valid_v2" : "failed",
      normalized_input: normalized,
      coaching_strategy: coachingStrategy,
      strategy_validation: strategyValidation,
      candidate_diagnostics: candidateDiagnostics,
      candidate_validation: candidateValidation,
      skeleton,
      candidate_map: candidateMap,
      validation,
      plan
    };
  }

  function generateWorkoutPlanV3(input, exerciseLibrary, options = {}) {
    const base = generateWorkoutPlanV2(input, exerciseLibrary, options);
    const plan = buildFallbackWorkoutPlanV3(base.skeleton, base.candidate_map, base.normalized_input, options);
    const validation = validateWorkoutPlanV3(plan, base.skeleton, base.candidate_map, base.normalized_input, base.coaching_strategy);
    return {
      ...base,
      status: validation.valid && base.strategy_validation.valid && base.candidate_validation.valid ? "valid_v3" : "failed",
      validation,
      plan
    };
  }

  function buildWorkoutCoachingStrategy(normalized) {
    const dayNames = DAY_NAMES[normalized.split] || DAY_NAMES.full_body;
    const sessionBudget = sessionBudgetForContext(normalized);
    const activeFocusAreas = normalized.focus_areas.filter((focus) => focus !== "Full Body").slice(0, 2);
    const cardioPolicy = buildCardioPolicy(normalized, dayNames, sessionBudget.target_exercises);

    return {
      strategy_version: COACHING_RULES_VERSION,
      role_template_policy_version: "workout_role_template_v2",
      lower_body_policy_version: "workout_lower_body_structure_v2",
      lower_slot_integrity_policy_version: "workout_lower_slot_integrity_v1",
      push_pull_balance_policy: {
        policy_version: "workout_push_pull_balance_v1",
        minimum_ratio: 0.75,
        maximum_ratio: 1.33,
        planned_push_sets: 0,
        planned_pull_sets: 0,
        planned_ratio: null
      },
      lower_body_balance_policy: {
        policy_version: "workout_lower_body_balance_v1",
        minimum_ratio: 0.8,
        maximum_ratio: 1.25,
        planned_quadriceps_sets: 0,
        planned_posterior_sets: 0,
        planned_ratio: null
      },
      arm_balance_policy_version: "workout_direct_arm_balance_v1",
      workout_place: normalized.place,
      lower_isolation_available: hasEquipmentCapability(normalized, "machine"),
      direct_arm_available: supportsDirectArmWork(normalized),
      split: normalized.split,
      days_per_week: normalized.days,
      session_duration_minutes: normalized.duration_minutes,
      session_budget: { ...sessionBudget },
      cardio_policy: cardioPolicy,
      cardio_duration_policy: {
        policy_version: CARDIO_DURATION_POLICY_VERSION,
        duration_bounds: cardioDurationBounds(normalized.duration_minutes),
        calculation: "remaining_capacity_after_resistance_setup_execution_rest_and_transitions",
        allocations: []
      },
      injury_selection_policy: buildInjurySelectionPolicy(normalized),
      time_feasibility_policy: {
        estimator_version: "workout_duration_estimator_v1",
        maximum_overrun_percent: 0,
        includes: ["working_set_execution", "between_set_rest", "initial_setup", "equipment_transitions", "cardio_duration"]
      },
      focus_policy: {
        selected_focus_areas: activeFocusAreas,
        maximum_focus_areas: 2,
        priority_slots_per_day: activeFocusAreas.length ? sessionBudget.focus_priority_slots : 0,
        preserve_required_day_coverage: true,
        maximum_additional_sets_per_week: 4,
        planned_additional_sets: 0
      },
      weekly_volume_guidance: weeklyVolumeGuidance(normalized),
      safe_training_ranges: safeTrainingRangesForStrategy(normalized),
      day_requirements: dayNames.slice(0, normalized.days).map((dayName, index) => {
        const role = dayRole(dayName);
        const rule = role === "lower"
          ? lowerDayCoachingRule(dayName, normalized, index + 1)
          : cloneRule(DAY_COACHING_RULES[role] || DAY_COACHING_RULES.full_body);
        if (role === "lower") rule.max_repeated_muscle_slots = sessionBudget.target_exercises;
        const resistanceCount = cardioPolicy.planned_day_indexes.includes(index + 1)
          ? sessionBudget.target_exercises - 1
          : sessionBudget.target_exercises;
        const roleBlueprints = slotBlueprintsForDay(dayName, normalized, resistanceCount, index + 1);
        const equipmentAwareRule = adaptDayRuleForEquipment(rule, normalized);
        return {
          day_index: index + 1,
          day_name: dayName,
          day_role: role,
          emphasis: dayEmphasis(dayName, index + 1),
          emphasis_training_roles: [...new Set(emphasisTrainingRoles(dayName, index + 1).map((item) => adaptEmphasisTrainingRole(item, normalized)))],
          ...adaptDayRuleForInjuries(equipmentAwareRule, normalized),
          training_role_template: roleBlueprints.map((item) => item.training_role),
          required_training_roles: roleBlueprints.filter((item) => item.slot_priority === "required").map((item) => item.training_role),
          optional_training_roles: roleBlueprints.filter((item) => item.slot_priority === "optional").map((item) => item.training_role),
          target_exercises: sessionBudget.target_exercises,
          working_set_budget: [sessionBudget.min_working_sets, sessionBudget.max_working_sets]
        };
      })
    };
  }

  function lowerDayCoachingRule(dayName, normalized, dayIndex) {
    const lowerB = dayName.includes("B") || (normalized.days === 5 && dayName === "Lower" && dayIndex > 3);
    const rule = cloneRule(DAY_COACHING_RULES.lower);
    rule.required_pattern_groups = lowerB
      ? [["squat", "lunge"], ["hinge", "hip_extension"]]
      : [["squat"], ["lunge"]];
    return rule;
  }

  function sessionBudgetForDuration(durationMinutes) {
    return SESSION_BUDGETS.find((budget) => durationMinutes <= budget.max_minutes) || SESSION_BUDGETS[SESSION_BUDGETS.length - 1];
  }

  function sessionBudgetForContext(normalized) {
    const base = sessionBudgetForDuration(normalized.duration_minutes);
    if (normalized.equipment_selection_mode !== "explicit") return base;
    const targetExercises = Math.min(base.target_exercises, 5);
    return {
      ...base,
      target_exercises: targetExercises,
      min_exercises: targetExercises,
      max_exercises: targetExercises,
      min_working_sets: Math.min(base.min_working_sets, targetExercises * 3),
      max_working_sets: Math.min(base.max_working_sets, targetExercises * 4)
    };
  }

  function buildInjurySelectionPolicy(normalized) {
    const neckLimited = normalized.injuries.some((injury) => /neck/i.test(injury));
    return {
      policy_version: "workout_injury_selection_policy_v1",
      broad_labels_only: true,
      structure_adaptation_active: normalized.injuries.some((injury) => /knee|lower back/i.test(injury)),
      neck: neckLimited
        ? {
            prefer_supported_rows: true,
            prefer_stable_lower_body_loading: true,
            prefer_stable_cardio: true,
            avoid_aggressive_head_positioning: true,
            coaching_requirements: ["Keep the neck neutral or relaxed.", "Stop if neck symptoms worsen or spread."]
          }
        : null
    };
  }

  function validateWorkoutCoachingStrategy(strategy, skeleton) {
    const errors = [];
    if (!strategy || strategy.strategy_version !== COACHING_RULES_VERSION) {
      return { valid: false, errors: ["strategy:invalid_version"] };
    }
    if (strategy.day_requirements.length !== skeleton.length) {
      errors.push(`strategy:wrong_day_count:${strategy.day_requirements.length}:${skeleton.length}`);
    }
    const cardioSlots = skeleton.flatMap((day) => day.slots).filter((slot) => slot.exercise_type === "cardio");
    if (cardioSlots.length > Number(strategy.cardio_policy?.maximum_sessions || 0)) {
      errors.push(`strategy:cardio_limit_exceeded:${cardioSlots.length}:${strategy.cardio_policy?.maximum_sessions}`);
    }
    if (cardioSlots.length !== Number(strategy.cardio_policy?.planned_sessions || 0)) {
      errors.push(`strategy:cardio_plan_mismatch:${cardioSlots.length}:${strategy.cardio_policy?.planned_sessions}`);
    }
    if (strategy.cardio_duration_policy?.policy_version !== CARDIO_DURATION_POLICY_VERSION) {
      errors.push("strategy:invalid_cardio_duration_policy");
    }
    const cardioAllocations = strategy.cardio_duration_policy?.allocations || [];
    if (cardioAllocations.length && cardioAllocations.length !== cardioSlots.length) {
      errors.push(`strategy:cardio_duration_allocation_mismatch:${cardioAllocations.length}:${cardioSlots.length}`);
    }

    for (const requirement of strategy.day_requirements) {
      const day = skeleton.find((item) => item.day_index === requirement.day_index);
      if (!day || day.day_name !== requirement.day_name) {
        errors.push(`strategy:missing_day:${requirement.day_index}`);
        continue;
      }
      const groups = new Set(day.slots.map((slot) => slot.muscle_group));
      const patterns = new Set(day.slots.map((slot) => slot.movement_pattern));
      for (const group of requirement.required_muscle_groups) {
        if (!groups.has(group)) errors.push(`strategy:missing_muscle:${requirement.day_index}:${group}`);
      }
      for (const alternatives of requirement.required_pattern_groups) {
        if (!alternatives.some((pattern) => patterns.has(pattern))) {
          errors.push(`strategy:missing_pattern:${requirement.day_index}:${alternatives.join("|")}`);
        }
      }
      const resistanceSlots = day.slots.filter((slot) => slot.exercise_type !== "cardio");
      const expectedRoles = requirement.training_role_template;
      const actualRoles = resistanceSlots.map((slot) => slot.training_role);
      if (JSON.stringify(actualRoles) !== JSON.stringify(expectedRoles)) {
        errors.push(`strategy:training_role_template_mismatch:${requirement.day_index}`);
      }
      if (requirement.emphasis_training_roles.length && !requirement.emphasis_training_roles.every((role) => actualRoles.includes(role))) {
        errors.push(`strategy:missing_day_emphasis:${requirement.day_index}`);
      }
      if (requirement.day_role === "lower") {
        for (const role of actualRoles) {
          if (!LOWER_DAY_ALLOWED_ROLES.has(role)) errors.push(`strategy:lower_forbidden_role:${requirement.day_index}:${role}`);
        }
      }
      if (requirement.day_role === "push") {
        for (const role of actualRoles) {
          if (["biceps", "horizontal_pull", "vertical_pull"].includes(role)) errors.push(`strategy:push_forbidden_role:${requirement.day_index}:${role}`);
        }
      }
      if (requirement.day_role === "pull") {
        for (const role of actualRoles) {
          if (["triceps", "horizontal_push", "vertical_push"].includes(role)) errors.push(`strategy:pull_forbidden_role:${requirement.day_index}:${role}`);
        }
      }
    }

    validateComplementaryDayVariants(strategy.day_requirements, errors, strategy);
    validateLowerDayDifferentiation(strategy, skeleton, errors);
    validateDirectArmStrategy(strategy, errors);
    validateWeeklyPushPullStrategy(skeleton, errors);
    validateWeeklyLowerBodyStrategy(strategy, skeleton, errors);

    return { valid: errors.length === 0, errors };
  }

  function validateLowerDayDifferentiation(strategy, skeleton, errors) {
    if (strategy.injury_selection_policy?.structure_adaptation_active) return;
    const profiles = [];

    for (const requirement of strategy.day_requirements.filter((item) => item.day_role === "lower")) {
      if (!["knee_dominant_lower", "hip_dominant_lower"].includes(requirement.emphasis)) continue;
      const day = skeleton.find((item) => item.day_index === requirement.day_index);
      if (!day) continue;
      const slots = day.slots.filter((slot) => slot.exercise_type !== "cardio");
      const roles = countValues(slots.map((slot) => slot.training_role));
      const patterns = new Set(slots.map((slot) => slot.movement_pattern));
      const variant = requirement.emphasis === "hip_dominant_lower" ? "B" : "A";

      if (variant === "A") {
        if (!roles.knee_dominant) errors.push(`strategy:lower_a_missing_knee_dominant:${day.day_index}`);
        if (!roles.unilateral_lower_body) errors.push(`strategy:lower_a_missing_unilateral:${day.day_index}`);
        if (strategy.lower_isolation_available && slots.length >= 7 && !roles.quadriceps_isolation) {
          errors.push(`strategy:lower_a_missing_quadriceps_isolation:${day.day_index}`);
        }
        if (strategy.lower_isolation_available && slots.length >= 5 && !roles.hamstring_isolation) {
          errors.push(`strategy:lower_a_missing_hamstring_isolation:${day.day_index}`);
        }
      } else {
        const kneeRoleCount = Number(roles.knee_dominant || 0) + Number(roles.unilateral_lower_body || 0);
        const expectedKneeRoleCount = strategy.lower_isolation_available ? [1, 1] : [1, 3];
        if (!patterns.has("hinge")) errors.push(`strategy:lower_b_missing_true_hinge:${day.day_index}`);
        if (!patterns.has("hip_extension")) errors.push(`strategy:lower_b_missing_hip_extension:${day.day_index}`);
        if (kneeRoleCount < expectedKneeRoleCount[0] || kneeRoleCount > expectedKneeRoleCount[1]) {
          errors.push(`strategy:lower_b_knee_role_count:${day.day_index}:${kneeRoleCount}`);
        }
        if (strategy.lower_isolation_available && slots.length >= 4 && !roles.hamstring_isolation) {
          errors.push(`strategy:lower_b_missing_hamstring_isolation:${day.day_index}`);
        }
      }

      profiles.push({ variant, roles, slot_count: slots.length });
    }

    const lowerA = profiles.find((profile) => profile.variant === "A");
    const lowerB = profiles.find((profile) => profile.variant === "B");
    const constrainedHomePair = !strategy.lower_isolation_available;
    if (lowerA && lowerB && !constrainedHomePair && lowerRoleDistribution(lowerA.roles) === lowerRoleDistribution(lowerB.roles)) {
      errors.push("strategy:lower_variants_have_identical_role_distribution");
    }
  }

  function lowerRoleDistribution(roles) {
    return ["knee_dominant", "unilateral_lower_body", "hip_dominant", "quadriceps_isolation", "hamstring_isolation", "calves", "core"]
      .map((role) => `${role}:${Number(roles[role] || 0)}`)
      .join("|");
  }

  function validateDirectArmStrategy(strategy, errors) {
    const upperRequirements = strategy.day_requirements.filter((requirement) =>
      ["upper", "push", "pull"].includes(requirement.day_role)
    );
    const roleCounts = countValues(upperRequirements.flatMap((requirement) => requirement.training_role_template));
    const bicepsSlots = Number(roleCounts.biceps || 0);
    const tricepsSlots = Number(roleCounts.triceps || 0);
    if (Math.abs(bicepsSlots - tricepsSlots) > 1) {
      errors.push(`strategy:direct_arm_slot_imbalance:${bicepsSlots}:${tricepsSlots}`);
    }

    const upperA = upperRequirements.find((requirement) => requirement.day_name === "Upper A");
    const upperB = upperRequirements.find((requirement) => requirement.day_name === "Upper B");
    if (upperA && upperB) {
      const pairedArmSlots = [...upperA.training_role_template, ...upperB.training_role_template]
        .filter((role) => ["biceps", "triceps"].includes(role));
      if (pairedArmSlots.length && !upperA.training_role_template.includes("triceps")) {
        errors.push(`strategy:upper_a_missing_direct_triceps:${upperA.day_index}`);
      }
      if (pairedArmSlots.length && !upperB.training_role_template.includes("biceps")) {
        errors.push(`strategy:upper_b_missing_direct_biceps:${upperB.day_index}`);
      }
    }
  }

  function validateWeeklyPushPullStrategy(skeleton, errors) {
    const roleSets = skeleton.flatMap((day) => day.slots).reduce((totals, slot) => {
      totals[slot.training_role] = (totals[slot.training_role] || 0) + Number(slot.sets || 0);
      return totals;
    }, {});
    const pushSets = sumRoleSets(roleSets, ["horizontal_push", "vertical_push"]);
    const pullSets = sumRoleSets(roleSets, ["horizontal_pull", "vertical_pull"]);
    if (!pushSets || !pullSets) return;
    const ratio = pushSets / pullSets;
    if (ratio < 0.75 || ratio > 4 / 3) errors.push(`strategy:push_pull_set_imbalance:${roundOne(ratio)}`);
  }

  function validateWeeklyLowerBodyStrategy(strategy, skeleton, errors) {
    if (strategy.injury_selection_policy?.structure_adaptation_active) return;
    const roleSets = skeleton.flatMap((day) => day.slots).reduce((totals, slot) => {
      totals[slot.training_role] = (totals[slot.training_role] || 0) + Number(slot.sets || 0);
      return totals;
    }, {});
    const quadricepsSets = sumRoleSets(roleSets, ["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"]);
    const posteriorSets = sumRoleSets(roleSets, ["hip_dominant", "hamstring_isolation"]);
    if (!quadricepsSets || !posteriorSets) return;
    const ratio = quadricepsSets / posteriorSets;
    if (ratio < 0.8 || ratio > 1.25) errors.push(`strategy:quadriceps_posterior_set_imbalance:${roundOne(ratio)}`);
  }

  function dayRole(dayName) {
    if (dayName.includes("Full Body")) return "full_body";
    if (dayName.includes("Upper")) return "upper";
    if (dayName.includes("Lower") || dayName.includes("Legs")) return "lower";
    if (dayName.includes("Push")) return "push";
    if (dayName.includes("Pull")) return "pull";
    return "full_body";
  }

  function dayEmphasis(dayName, dayIndex = 1) {
    const lowerB = /Lower B|Legs B/.test(dayName) || (dayName === "Lower" && dayIndex > 3);
    if (/Upper A/.test(dayName)) return "horizontal_push_pull";
    if (/Upper B/.test(dayName)) return "vertical_push_pull";
    if (/Lower A|Legs A/.test(dayName) || (dayName === "Legs" && dayIndex <= 3)) return "knee_dominant_lower";
    if (lowerB) return "hip_dominant_lower";
    if (/Push A/.test(dayName)) return "horizontal_push";
    if (/Push B/.test(dayName)) return "vertical_push";
    if (/Pull A/.test(dayName)) return "horizontal_pull";
    if (/Pull B/.test(dayName)) return "vertical_pull";
    if (/Full Body A/.test(dayName)) return "knee_and_horizontal";
    if (/Full Body B/.test(dayName)) return "hip_and_vertical";
    return "balanced";
  }

  function emphasisTrainingRoles(dayName, dayIndex = 1) {
    const emphasis = dayEmphasis(dayName, dayIndex);
    const roles = {
      horizontal_push_pull: ["horizontal_push", "horizontal_pull"],
      vertical_push_pull: ["vertical_push", "vertical_pull"],
      knee_dominant_lower: ["knee_dominant", "unilateral_lower_body"],
      hip_dominant_lower: ["hip_dominant", "hamstring_isolation"],
      horizontal_push: ["horizontal_push"],
      vertical_push: ["vertical_push"],
      horizontal_pull: ["horizontal_pull"],
      vertical_pull: ["vertical_pull"],
      knee_and_horizontal: ["knee_dominant", "horizontal_push", "horizontal_pull"],
      hip_and_vertical: ["hip_dominant", "vertical_pull"]
    };
    return roles[emphasis] || [];
  }

  function validateComplementaryDayVariants(requirements, errors, strategy = {}) {
    const pairs = [
      ["Full Body A", "Full Body B"], ["Upper A", "Upper B"], ["Lower A", "Lower B"],
      ["Push A", "Push B"], ["Pull A", "Pull B"], ["Legs A", "Legs B"], ["Legs", "Lower"]
    ];
    for (const [leftName, rightName] of pairs) {
      const left = requirements.find((item) => item.day_name === leftName);
      const right = requirements.find((item) => item.day_name === rightName);
      if (!left || !right) continue;
      if (left.emphasis === right.emphasis || left.emphasis === "balanced" || right.emphasis === "balanced") {
        errors.push(`strategy:variant_emphasis_not_complementary:${left.day_index}:${right.day_index}`);
      }
      const overlap = roleMultisetOverlap(left.training_role_template, right.training_role_template);
      const sameInventoryAllowed = ["push", "pull"].includes(left.day_role) && left.day_role === right.day_role;
      const constrainedLowerPair = !strategy.lower_isolation_available && left.day_role === "lower" && right.day_role === "lower";
      if (overlap >= 1 && !constrainedLowerPair && !sameInventoryAllowed) errors.push(`strategy:variant_roles_identical:${left.day_index}:${right.day_index}`);
    }
  }

  function roleMultisetOverlap(left, right) {
    const leftCounts = countValues(left);
    const rightCounts = countValues(right);
    const shared = Object.keys(leftCounts).reduce((sum, role) => sum + Math.min(leftCounts[role], rightCounts[role] || 0), 0);
    return Math.round((shared / Math.max(left.length, right.length, 1)) * 100) / 100;
  }

  function cloneRule(rule) {
    return {
      required_muscle_groups: [...rule.required_muscle_groups],
      required_pattern_groups: rule.required_pattern_groups.map((patterns) => [...patterns]),
      optional_muscle_groups: [...rule.optional_muscle_groups],
      max_repeated_muscle_slots: rule.max_repeated_muscle_slots
    };
  }

  function adaptDayRuleForEquipment(rule, normalized) {
    if (!hasEquipmentCapability(normalized, "cable", "machine")) {
      rule.required_pattern_groups = rule.required_pattern_groups.map((patterns) =>
        patterns.length === 1 && patterns[0] === "vertical_pull" ? ["horizontal_pull"] : patterns
      );
    }
    return rule;
  }

  function adaptDayRuleForInjuries(rule, normalized) {
    if (normalized.equipment_selection_mode === "explicit" || normalized.place === "Home") {
      rule.required_pattern_groups = rule.required_pattern_groups.map((patterns) =>
        patterns.length === 1 && patterns[0] === "vertical_pull" ? ["horizontal_pull"] : patterns
      );
    }
    if (normalized.injuries.some((injury) => /knee/i.test(injury))) {
      rule.required_pattern_groups = rule.required_pattern_groups.map((patterns) =>
        patterns.some((pattern) => ["squat", "lunge", "hip_extension"].includes(pattern))
          ? ["hip_extension"]
          : patterns
      );
    }
    if (normalized.injuries.some((injury) => /lower back/i.test(injury))) {
      rule.required_pattern_groups = rule.required_pattern_groups.map((patterns) =>
        patterns.includes("hinge") ? ["hip_extension", "leg_isolation"] : patterns
      );
    }
    return rule;
  }

  function weeklyVolumeGuidance(normalized) {
    const experienceAdjustment = normalized.experience === "Beginner" ? -2 : normalized.experience === "Advanced" ? 2 : 0;
    const hypertrophyGoal = normalized.goal === "Build Muscle" || normalized.goal === "Improve Body Shape";
    const majorBase = hypertrophyGoal ? [8, 14] : normalized.goal === "Gain Strength" ? [6, 12] : [6, 10];
    const smallBase = hypertrophyGoal ? [4, 10] : [4, 8];
    return {
      classification: "coaching_guidance_not_hard_validation",
      schedule_and_session_budget_take_priority: true,
      major_muscle_direct_sets: [Math.max(4, majorBase[0] + experienceAdjustment), majorBase[1] + experienceAdjustment],
      smaller_muscle_direct_sets: [Math.max(2, smallBase[0] + Math.min(0, experienceAdjustment)), smallBase[1] + Math.max(0, experienceAdjustment)],
      focus_area_additional_sets: normalized.focus_areas.includes("Full Body") ? [0, 0] : [0, 4]
    };
  }

  function safeTrainingRangesForStrategy(normalized) {
    return {
      strength_compound: normalized.goal === "Gain Strength"
        ? { sets: [3, 5], reps: [3, 6], rest_seconds: [120, 180] }
        : { sets: [3, 4], reps: [6, 12], rest_seconds: normalized.duration_minutes <= 30 ? [75, 120] : [90, 150] },
      strength_isolation: { sets: [2, 4], reps: [8, 20], rest_seconds: [45, 90] },
      core: { sets: [2, 3], reps: [10, 20], rest_seconds: [45, 75] },
      cardio: { sets: [1, 1], duration_minutes: cardioDurationBounds(normalized.duration_minutes), rest: "-" }
    };
  }

  function normalizeWorkoutInput(input) {
    const workout = input.workout || input;
    const profile = input.profile || {};
    const goal = input.goal || "Improve Fitness";
    const days = clamp(Number(workout.days || 3), 2, 6);
    const durationMinutes = Number(String(workout.duration || "60").match(/\d+/)?.[0] || 60);
    const place = workout.place || "Building Gym";
    const libraryPlace = place === "Building Gym" ? "Gym" : place;
    const selectedEquipment = Array.isArray(workout.equipment) ? workout.equipment : [];
    const placeEquipment = PLACE_EQUIPMENT_LIMITS[place] || PLACE_EQUIPMENT_LIMITS.Gym;
    const sanitizedEquipment = [...new Set(selectedEquipment.filter((item) => placeEquipment.includes(item)))];
    const effectiveEquipment = selectedEquipment.length
      ? [...new Set(["Bodyweight", ...sanitizedEquipment])]
      : placeEquipment;

    return {
      goal,
      profile_context: {
        gender: profile.gender || null,
        birth_date: profile.birth_date || null,
        age_years: calculateAge(profile.birth_date),
        height_cm: positiveNumberOrNull(profile.height_cm),
        weight_kg: positiveNumberOrNull(profile.weight_kg)
      },
      days,
      duration_minutes: durationMinutes,
      place,
      library_place: libraryPlace,
      split: normalizeSplit(workout.split || "Auto", days),
      experience: profile.experience || input.experience || "Beginner",
      focus_areas: Array.isArray(workout.focusAreas) ? workout.focusAreas.slice(0, 2) : [],
      equipment: effectiveEquipment,
      equipment_selection_mode: selectedEquipment.length ? "explicit" : "place_default",
      allowed_equipment: placeEquipment,
      injuries: normalizeNoneList(workout.injuries),
      disliked_exercise_ids: (workout.dislikedExercises || []).map((item) => Number(item.exercise_id)),
      disliked_exercises: normalizeDislikedExercises(workout.dislikedExercises),
      excluded_contraindications: normalizeInjuryTags(workout.injuries)
    };
  }

  function calculateAge(birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate || ""))) return null;
    const birth = new Date(`${birthDate}T00:00:00Z`);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth() ||
      (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age >= 0 && age <= 120 ? age : null;
  }

  function positiveNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeSplit(split, days) {
    if (split !== "Auto") {
      if (split === "Full Body") return "full_body";
      if (split === "Upper/Lower") return "upper_lower";
      if (split === "Push Pull Legs") return "push_pull_legs";
      if (split === "Body Part Split") return "body_part";
    }

    if (days <= 2) return "full_body_2";
    if (days === 3) return "upper_lower_full_body_3";
    if (days === 4) return "upper_lower_ab_4";
    if (days === 5) return "ppl_upper_lower_5";
    return "ppl_x2_6";
  }

  function buildWorkoutSkeleton(normalized, coachingStrategy = buildWorkoutCoachingStrategy(normalized)) {
    const dayNames = DAY_NAMES[normalized.split] || DAY_NAMES.full_body;
    const slotsPerDay = coachingStrategy.session_budget.target_exercises;
    const cardioDays = new Set(coachingStrategy.cardio_policy?.planned_day_indexes || []);
    const skeleton = [];
    if (coachingStrategy.focus_policy) coachingStrategy.focus_policy.planned_additional_sets = 0;

    for (let dayIndex = 1; dayIndex <= normalized.days; dayIndex += 1) {
      const dayName = dayNames[(dayIndex - 1) % dayNames.length];
      const includeCardio = cardioDays.has(dayIndex);
      const resistanceSlots = includeCardio ? Math.max(3, slotsPerDay - 1) : slotsPerDay;
      const blueprints = slotBlueprintsForDay(dayName, normalized, resistanceSlots, dayIndex);
      const slots = [];

      for (let slotIndex = 1; slotIndex <= resistanceSlots; slotIndex += 1) {
        const blueprint = blueprints[slotIndex - 1] || blueprints[blueprints.length - 1];
        const category = blueprint.category;
        const exerciseType = blueprint.exercise_type;
        const movementPattern = blueprint.movement_pattern || patternForCategory(category, exerciseType);

        slots.push({
          slot_id: `day${dayIndex}_slot${slotIndex}`,
          day_index: dayIndex,
          day_name: dayName,
          muscle_group: category,
          submuscle: focusSubmuscleForCategory(category, normalized.focus_areas),
          movement_pattern: movementPattern,
          exercise_type: exerciseType,
          training_role: blueprint.training_role || null,
          slot_priority: blueprint.slot_priority || "optional",
          lower_body_variant: blueprint.lower_body_variant || null,
          sets: exerciseType === "cardio" ? 1 : normalized.goal === "Gain Strength" && exerciseType === "compound" ? 5 : 3,
          rep_range: repRangeForGoal(normalized.goal, exerciseType),
          rest_seconds: restForGoal(normalized.goal, exerciseType),
          order: slotIndex
        });
      }

      if (includeCardio) {
        slots.push({
          slot_id: `day${dayIndex}_cardio`,
          day_index: dayIndex,
          day_name: dayName,
          muscle_group: "Cardio",
          submuscle: "Cardio",
          movement_pattern: "cardio",
          exercise_type: "cardio",
          training_role: "cardio",
          slot_priority: "cardio",
          sets: 1,
          rep_range: cardioDurationBounds(normalized.duration_minutes),
          rest_seconds: 0,
          order: slots.length + 1
        });
      }

      const remainingFocusSets = Math.max(
        0,
        Number(coachingStrategy.focus_policy?.maximum_additional_sets_per_week || 0) -
          Number(coachingStrategy.focus_policy?.planned_additional_sets || 0)
      );
      const focusSets = applyWorkingSetBudget(
        slots,
        coachingStrategy.session_budget,
        normalized,
        Math.min(remainingFocusSets, Number(coachingStrategy.focus_policy?.priority_slots_per_day || 0))
      );
      if (coachingStrategy.focus_policy) coachingStrategy.focus_policy.planned_additional_sets += focusSets;

      skeleton.push({
        day_index: dayIndex,
        day_name: dayName,
        slots
      });
    }

    rebalanceWeeklyPushPullSets(skeleton, normalized, coachingStrategy);
    rebalanceWeeklyLowerBodySets(skeleton, normalized, coachingStrategy);

    return skeleton;
  }

  function applyWorkingSetBudget(slots, sessionBudget, normalized, maximumFocusSets = 0) {
    const resistanceSlots = slots.filter((slot) => slot.exercise_type !== "cardio");
    for (const slot of slots) {
      slot.sets = slot.exercise_type === "cardio"
        ? 1
        : slot.exercise_type === "compound"
        ? 3
        : normalized.place === "Home" && slot.training_role === "horizontal_pull"
        ? 3
        : 2;
      slot.focus_additional_sets = 0;
    }
    let totalSets = slots.reduce((sum, slot) => sum + slot.sets, 0);
    const targetSets = Math.max(
      sessionBudget.min_working_sets,
      Math.min(sessionBudget.max_working_sets, totalSets + Math.max(0, normalized.duration_minutes - 30) / 15)
    );
    const normalPriority = [
      ...resistanceSlots.filter((slot) => slot.slot_priority === "required" && slot.exercise_type === "compound"),
      ...resistanceSlots.filter((slot) => slot.slot_priority === "required" && slot.exercise_type !== "compound"),
      ...resistanceSlots.filter((slot) => slot.slot_priority === "optional")
    ];
    const focusRoles = new Set(focusTrainingRoles(normalized.focus_areas));
    const focusPriority = normalPriority.filter((slot) => focusRoles.has(slot.training_role));
    const nonFocusPriority = normalPriority.filter((slot) => !focusRoles.has(slot.training_role));
    let focusSets = 0;
    let cursor = 0;
    while (totalSets < Math.floor(targetSets) && focusPriority.length && focusSets < maximumFocusSets) {
      const slot = focusPriority[cursor % focusPriority.length];
      const maximum = slot.exercise_type === "core" ? 3 : slot.exercise_type === "compound" ? (normalized.goal === "Gain Strength" ? 5 : 4) : 4;
      if (slot.sets < maximum) {
        slot.sets += 1;
        slot.focus_additional_sets += 1;
        totalSets += 1;
        focusSets += 1;
      }
      cursor += 1;
      if (cursor > focusPriority.length * 4) break;
    }
    cursor = 0;
    while (totalSets < Math.floor(targetSets) && nonFocusPriority.length) {
      const slot = nonFocusPriority[cursor % nonFocusPriority.length];
      const maximum = slot.exercise_type === "core" ? 3 : slot.exercise_type === "compound" ? (normalized.goal === "Gain Strength" ? 5 : 4) : 4;
      if (slot.sets < maximum) {
        slot.sets += 1;
        totalSets += 1;
      }
      cursor += 1;
      if (cursor > nonFocusPriority.length * 4) break;
    }
    return focusSets;
  }

  function rebalanceWeeklyPushPullSets(skeleton, normalized, coachingStrategy) {
    const pushRoles = new Set(["horizontal_push", "vertical_push"]);
    const pullRoles = new Set(["horizontal_pull", "vertical_pull"]);
    const selectedFocusRoles = new Set(focusTrainingRoles(normalized.focus_areas));
    const slots = skeleton.flatMap((day) => day.slots.map((slot) => ({ slot, day })));
    const totals = () => slots.reduce((result, item) => {
      if (pushRoles.has(item.slot.training_role)) result.push += Number(item.slot.sets || 0);
      if (pullRoles.has(item.slot.training_role)) result.pull += Number(item.slot.sets || 0);
      return result;
    }, { push: 0, pull: 0 });
    const daySets = (day) => day.slots.reduce((sum, slot) => sum + Number(slot.sets || 0), 0);
    const minimumSets = (slot) => slot.exercise_type === "compound" ? 3 : 2;
    const maximumSets = (slot) => slot.exercise_type === "compound" ? (normalized.goal === "Gain Strength" ? 5 : 4) : 4;

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const current = totals();
      if (!current.push || !current.pull) break;
      const ratio = current.push / current.pull;
      if (ratio >= 0.75 && ratio <= 1.33) break;
      const sourceRoles = ratio > 1.33 ? pushRoles : pullRoles;
      const targetRoles = ratio > 1.33 ? pullRoles : pushRoles;
      const sources = slots
        .filter(({ slot }) => sourceRoles.has(slot.training_role) && slot.sets > minimumSets(slot))
        .sort((a, b) => Number(a.slot.focus_additional_sets || 0) - Number(b.slot.focus_additional_sets || 0));
      const targets = slots
        .filter(({ slot, day }) => targetRoles.has(slot.training_role) && slot.sets < maximumSets(slot) && daySets(day) < coachingStrategy.session_budget.max_working_sets);
      if (!targets.length && !sources.length) break;
      if (targets.length && !sources.length) {
        targets[0].slot.sets += 1;
        continue;
      }
      if (sources.length && !targets.length) {
        const source = sources[0];
        const neutralTarget = slots.find(({ slot, day }) =>
          day.day_index === source.day.day_index &&
          !pushRoles.has(slot.training_role) && !pullRoles.has(slot.training_role) &&
          slot.exercise_type !== "cardio" && slot.sets < maximumSets(slot)
        );
        if (neutralTarget) {
          source.slot.sets -= 1;
          neutralTarget.slot.sets += 1;
        } else if (daySets(source.day) > coachingStrategy.session_budget.min_working_sets) {
          source.slot.sets -= 1;
        } else {
          break;
        }
        if (source.slot.focus_additional_sets > 0) {
          source.slot.focus_additional_sets -= 1;
          coachingStrategy.focus_policy.planned_additional_sets = Math.max(0, coachingStrategy.focus_policy.planned_additional_sets - 1);
        }
        continue;
      }
      const source = sources[0];
      const sameDayTarget = targets.find((item) => item.day.day_index === source.day.day_index);
      const target = sameDayTarget || targets[0];
      if (sameDayTarget) {
        source.slot.sets -= 1;
        sameDayTarget.slot.sets += 1;
      } else if (daySets(source.day) > coachingStrategy.session_budget.min_working_sets) {
        source.slot.sets -= 1;
        target.slot.sets += 1;
      } else {
        target.slot.sets += 1;
        continue;
      }
      if (source.slot.focus_additional_sets > 0) {
        source.slot.focus_additional_sets -= 1;
        if (selectedFocusRoles.has(target.slot.training_role)) {
          target.slot.focus_additional_sets = Number(target.slot.focus_additional_sets || 0) + 1;
        } else {
          coachingStrategy.focus_policy.planned_additional_sets = Math.max(0, coachingStrategy.focus_policy.planned_additional_sets - 1);
        }
      }
    }

    const final = totals();
    if (coachingStrategy.push_pull_balance_policy) {
      coachingStrategy.push_pull_balance_policy.planned_push_sets = final.push;
      coachingStrategy.push_pull_balance_policy.planned_pull_sets = final.pull;
      coachingStrategy.push_pull_balance_policy.planned_ratio = final.push && final.pull ? roundOne(final.push / final.pull) : null;
    }
  }

  function rebalanceWeeklyLowerBodySets(skeleton, normalized, coachingStrategy) {
    const quadricepsRoles = new Set(["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"]);
    const posteriorRoles = new Set(["hip_dominant", "hamstring_isolation"]);
    const selectedFocusRoles = new Set(focusTrainingRoles(normalized.focus_areas));
    const slots = skeleton.flatMap((day) => day.slots.map((slot) => ({ slot, day })));
    const totals = () => slots.reduce((result, { slot }) => {
      if (quadricepsRoles.has(slot.training_role)) result.quadriceps += Number(slot.sets || 0);
      if (posteriorRoles.has(slot.training_role)) result.posterior += Number(slot.sets || 0);
      return result;
    }, { quadriceps: 0, posterior: 0 });
    const daySets = (day) => day.slots.reduce((sum, slot) => sum + Number(slot.sets || 0), 0);
    const minimumSets = (slot) => slot.exercise_type === "compound" ? 3 : 2;
    const maximumSets = (slot) => slot.exercise_type === "compound" ? (normalized.goal === "Gain Strength" ? 5 : 4) : 4;
    const preserveFocusMarker = (source, target) => {
      if (source.slot.focus_additional_sets <= 0) return;
      source.slot.focus_additional_sets -= 1;
      if (target && selectedFocusRoles.has(target.slot.training_role)) {
        target.slot.focus_additional_sets = Number(target.slot.focus_additional_sets || 0) + 1;
      } else {
        coachingStrategy.focus_policy.planned_additional_sets = Math.max(
          0,
          Number(coachingStrategy.focus_policy.planned_additional_sets || 0) - 1
        );
      }
    };

    if (!normalized.injuries.some((injury) => /knee|lower back/i.test(injury))) {
      for (let iteration = 0; iteration < 16; iteration += 1) {
        const current = totals();
        if (!current.quadriceps || !current.posterior) break;
        const ratio = current.quadriceps / current.posterior;
        if (ratio >= 0.8 && ratio <= 1.25) break;
        const sourceRoles = ratio > 1.25 ? quadricepsRoles : posteriorRoles;
        const targetRoles = ratio > 1.25 ? posteriorRoles : quadricepsRoles;
        const sources = slots
          .filter(({ slot }) => sourceRoles.has(slot.training_role) && slot.sets > minimumSets(slot))
          .sort((a, b) => Number(a.slot.focus_additional_sets || 0) - Number(b.slot.focus_additional_sets || 0));
        const targets = slots.filter(({ slot }) => targetRoles.has(slot.training_role) && slot.sets < maximumSets(slot));

        if (sources.length && targets.length) {
          const source = sources[0];
          const target = targets.find((item) => item.day.day_index === source.day.day_index) || targets[0];
          source.slot.sets -= 1;
          target.slot.sets += 1;
          preserveFocusMarker(source, target);
          continue;
        }
        const target = targets.find(({ day }) => daySets(day) < coachingStrategy.session_budget.max_working_sets);
        if (target) {
          target.slot.sets += 1;
          continue;
        }
        if (sources.length) {
          const source = sources[0];
          const neutralTarget = slots.find(({ slot, day }) =>
            day.day_index === source.day.day_index &&
            ["calves", "core"].includes(slot.training_role) &&
            slot.sets < maximumSets(slot)
          );
          if (neutralTarget) {
            source.slot.sets -= 1;
            neutralTarget.slot.sets += 1;
            preserveFocusMarker(source, neutralTarget);
            continue;
          }
          if (daySets(source.day) > coachingStrategy.session_budget.min_working_sets) {
            source.slot.sets -= 1;
            preserveFocusMarker(source, null);
            continue;
          }
        }
        break;
      }
    }

    const final = totals();
    const policy = coachingStrategy.lower_body_balance_policy;
    if (policy) {
      policy.planned_quadriceps_sets = final.quadriceps;
      policy.planned_posterior_sets = final.posterior;
      policy.planned_ratio = final.quadriceps && final.posterior ? volumeRatio(final.quadriceps, final.posterior) : null;
    }
  }

  function focusTrainingRoles(focusAreas = []) {
    const roleMap = {
      Glutes: ["hip_dominant"],
      Chest: ["horizontal_push"],
      Back: ["horizontal_pull", "vertical_pull"],
      Shoulders: ["vertical_push", "side_rear_delts"],
      Arms: ["biceps", "triceps", "forearms"],
      Core: ["core"],
      Legs: ["knee_dominant", "hip_dominant", "unilateral_lower_body", "quadriceps_isolation", "hamstring_isolation", "calves"]
    };
    return [...new Set(focusAreas.filter((area) => area !== "Full Body").flatMap((area) => roleMap[area] || []))];
  }

  function focusSubmuscleForCategory(category, focusAreas) {
    if (category === "Legs" && focusAreas.includes("Glutes")) return "Glutes";
    return category;
  }

  function buildCardioPolicy(normalized, dayNames, slotsPerDay) {
    const maximumSessions = normalized.days <= 4 ? 1 : 2;
    let plannedSessions = 0;
    if (slotsPerDay >= 5) {
      if (["Lose Weight", "Improve Fitness"].includes(normalized.goal)) plannedSessions = maximumSessions;
      else if (normalized.goal === "Build Muscle" && normalized.duration_minutes >= 60) plannedSessions = 1;
      else if (normalized.goal === "Gain Strength" && normalized.duration_minutes >= 75) plannedSessions = 1;
      else if (normalized.goal === "Improve Body Shape" && normalized.duration_minutes >= 60) plannedSessions = 1;
    }
    if (normalized.place === "Home") plannedSessions = 0;

    const preferredDays = dayNames.slice(0, normalized.days)
      .map((dayName, index) => ({ day_index: index + 1, day_name: dayName }))
      .filter((day) => !/Lower|Legs/.test(day.day_name));
    const allDays = dayNames.slice(0, normalized.days).map((dayName, index) => ({ day_index: index + 1, day_name: dayName }));
    const candidates = preferredDays.length ? preferredDays : allDays;
    const plannedDayIndexes = [];
    if (plannedSessions >= 1) {
      plannedDayIndexes.push(candidates[0].day_index);
    }
    if (plannedSessions >= 2) {
      const second = candidates.find((day) => day.day_index - plannedDayIndexes[0] >= 2)
        || allDays.find((day) => day.day_index - plannedDayIndexes[0] >= 2);
      if (second) plannedDayIndexes.push(second.day_index);
    }

    return {
      policy_version: "workout_cardio_policy_v1",
      maximum_sessions: maximumSessions,
      planned_sessions: plannedDayIndexes.length,
      planned_day_indexes: plannedDayIndexes,
      placement: "final_slot",
      session_time_required: true
    };
  }

  function cardioDurationBounds(durationMinutes = 60) {
    if (durationMinutes <= 30) return [8, 10];
    if (durationMinutes <= 45) return [12, 15];
    if (durationMinutes <= 60) return [15, 20];
    return [20, 20];
  }

  function fitResistanceSetsToSession(skeleton, candidateMap, normalized, coachingStrategy = null) {
    const completionBufferSeconds = 60;

    for (const day of skeleton) {
      const cardioSlot = day.slots.find((slot) => slot.exercise_type === "cardio");
      const minimumCardioSeconds = cardioSlot ? cardioDurationBounds(normalized.duration_minutes)[0] * 60 : 0;
      const resistanceSlots = day.slots.filter((slot) => slot.exercise_type !== "cardio");
      const cardioCandidate = cardioSlot ? (candidateMap[cardioSlot.slot_id] || [])[0] : null;

      const estimatedSeconds = () => {
        let seconds = 0;
        let previous = null;
        for (const slot of resistanceSlots) {
          const candidate = (candidateMap[slot.slot_id] || [])[0];
          if (!candidate) continue;
          const safe = safeTrainingRange(slot, normalized);
          seconds += previous ? equipmentTransitionSeconds(previous, candidate) : initialSetupSeconds(candidate);
          seconds += Number(slot.sets || safe.sets) * setExecutionSeconds(slot, normalized);
          seconds += Math.max(0, Number(slot.sets || safe.sets) - 1) * Number(safe.rest_seconds || 0);
          previous = candidate;
        }
        if (cardioSlot) {
          if (cardioCandidate) seconds += previous ? equipmentTransitionSeconds(previous, cardioCandidate) : initialSetupSeconds(cardioCandidate);
          else seconds += 60;
        }
        return seconds + minimumCardioSeconds + completionBufferSeconds;
      };

      const reducible = [...resistanceSlots].sort((left, right) => {
        const leftRank = (left.focus_additional_sets ? 4 : 0) + (left.slot_priority === "required" ? 2 : 0) + (left.exercise_type === "compound" ? 1 : 0);
        const rightRank = (right.focus_additional_sets ? 4 : 0) + (right.slot_priority === "required" ? 2 : 0) + (right.exercise_type === "compound" ? 1 : 0);
        return leftRank - rightRank;
      });
      let cursor = 0;
      while (estimatedSeconds() > normalized.duration_minutes * 60 && cursor < reducible.length * 6) {
        const slot = reducible[cursor % reducible.length];
        const safe = safeTrainingRange(slot, normalized);
        if (Number(slot.sets || 0) > safe.min_sets) {
          slot.sets -= 1;
          if (slot.focus_additional_sets > 0) {
            slot.focus_additional_sets -= 1;
            if (coachingStrategy?.focus_policy) {
              coachingStrategy.focus_policy.planned_additional_sets = Math.max(0, coachingStrategy.focus_policy.planned_additional_sets - 1);
            }
          }
        }
        cursor += 1;
      }
    }
  }

  function rebalanceWeeklyDirectArmSets(skeleton, coachingStrategy) {
    const armRoles = new Set(["biceps", "triceps"]);
    const slots = skeleton.flatMap((day) => day.slots.map((slot) => ({ day, slot })));
    const totals = () => slots.reduce((result, { slot }) => {
      if (armRoles.has(slot.training_role)) result[slot.training_role] += Number(slot.sets || 0);
      return result;
    }, { biceps: 0, triceps: 0 });
    const daySets = (day) => day.slots.reduce((sum, slot) => sum + Number(slot.sets || 0), 0);

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const current = totals();
      if (!current.biceps || !current.triceps || Math.abs(current.biceps - current.triceps) <= 4) break;
      const higherRole = current.biceps > current.triceps ? "biceps" : "triceps";
      const lowerRole = higherRole === "biceps" ? "triceps" : "biceps";
      const target = slots.find(({ day, slot }) =>
        slot.training_role === lowerRole && Number(slot.sets || 0) < 4 && daySets(day) < coachingStrategy.session_budget.max_working_sets
      );
      if (target) {
        target.slot.sets += 1;
        continue;
      }
      const source = slots.find(({ slot }) => slot.training_role === higherRole && Number(slot.sets || 0) > 2);
      if (!source) break;
      if (daySets(source.day) > coachingStrategy.session_budget.min_working_sets) {
        source.slot.sets -= 1;
        continue;
      }
      const neutralTarget = source.day.slots.find((slot) =>
        !armRoles.has(slot.training_role) &&
        !["horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull"].includes(slot.training_role) &&
        slot.exercise_type !== "cardio" &&
        Number(slot.sets || 0) < (slot.exercise_type === "core" ? 3 : 4)
      );
      if (!neutralTarget) break;
      source.slot.sets -= 1;
      neutralTarget.sets += 1;
    }
  }

  function finalizeCardioDurations(skeleton, candidateMap, normalized, coachingStrategy = null) {
    const bounds = cardioDurationBounds(normalized.duration_minutes);
    const allocations = [];

    for (const day of skeleton) {
      const cardioSlot = day.slots.find((slot) => slot.exercise_type === "cardio");
      if (!cardioSlot) continue;

      const resistanceSlots = day.slots.filter((slot) => slot.exercise_type !== "cardio");
      let resistanceSeconds = 0;
      let previousCandidate = null;

      for (const slot of resistanceSlots) {
        const candidate = (candidateMap[slot.slot_id] || [])[0];
        if (!candidate) continue;
        const safe = safeTrainingRange(slot, normalized);
        const setupSeconds = previousCandidate
          ? equipmentTransitionSeconds(previousCandidate, candidate)
          : initialSetupSeconds(candidate);
        const executionSeconds = Number(safe.sets || 0) * setExecutionSeconds(slot, normalized);
        const restSeconds = Math.max(0, Number(safe.sets || 0) - 1) * Number(safe.rest_seconds || 0);
        resistanceSeconds += setupSeconds + executionSeconds + restSeconds;
        previousCandidate = candidate;
      }

      const cardioCandidate = (candidateMap[cardioSlot.slot_id] || [])[0];
      const cardioSetupSeconds = cardioCandidate
        ? previousCandidate
          ? equipmentTransitionSeconds(previousCandidate, cardioCandidate)
          : initialSetupSeconds(cardioCandidate)
        : 60;
      const remainingMinutes = Math.max(0, Math.floor((normalized.duration_minutes * 60 - resistanceSeconds - cardioSetupSeconds) / 60));
      const maximumMinutes = Math.min(bounds[1], remainingMinutes);
      const minimumMinutes = Math.min(bounds[0], maximumMinutes);
      cardioSlot.rep_range = [minimumMinutes, maximumMinutes];
      cardioSlot.cardio_duration_policy_version = CARDIO_DURATION_POLICY_VERSION;

      allocations.push({
        day_index: day.day_index,
        slot_id: cardioSlot.slot_id,
        resistance_estimate_minutes: roundOne(resistanceSeconds / 60),
        cardio_setup_minutes: roundOne(cardioSetupSeconds / 60),
        remaining_capacity_minutes: remainingMinutes,
        duration_minutes: [...cardioSlot.rep_range]
      });
    }

    if (coachingStrategy?.cardio_duration_policy) {
      coachingStrategy.cardio_duration_policy.allocations = allocations;
    }
    return allocations;
  }

  function buildFourWeekWorkoutSkeleton(normalized) {
    const baseDays = buildWorkoutSkeleton(normalized);
    const weekThemes = [
      "Base and learning week",
      "Rep progression week",
      "Load or difficulty progression week",
      weekFourTheme(normalized)
    ];

    return weekThemes.map((theme, weekIndex) => ({
      week_index: weekIndex + 1,
      week_theme: theme,
      days: baseDays.map((day) => ({
        day_index: day.day_index,
        day_name: day.day_name,
        slots: day.slots.map((slot) => ({
          ...slot,
          slot_id: `week${weekIndex + 1}_${slot.slot_id}`,
          base_slot_id: slot.slot_id,
          week_index: weekIndex + 1,
          week_theme: theme,
          progression_focus: weekProgressionFocus(weekIndex + 1, normalized)
        }))
      }))
    }));
  }

  function weekFourTheme(normalized) {
    if (normalized.experience === "Advanced" || normalized.goal === "Gain Strength") {
      return "Performance check week";
    }
    if (normalized.experience === "Beginner") {
      return "Consolidation week";
    }
    return "Consolidation and slight deload week";
  }

  function weekProgressionFocus(weekIndex, normalized) {
    if (weekIndex === 1) return "Learn exercise technique and finish most sets with 2-3 RIR.";
    if (weekIndex === 2) return "Add reps inside the target range while keeping form clean.";
    if (weekIndex === 3) return normalized.goal === "Gain Strength" ? "Add load when all sets meet the rep target." : "Add load or a harder variation when top-end reps are achieved.";
    if (normalized.experience === "Beginner") return "Repeat quality work and confirm technique consistency.";
    return "Reduce fatigue slightly or test performance without grinding reps.";
  }

  function categoriesForDay(dayName, normalized) {
    const focusCategories = normalized.focus_areas.flatMap((focus) => FOCUS_CATEGORY_MAP[focus] || []);
    const focus = focusCategories.length ? focusCategories : ["Chest", "Back", "Legs", "Shoulders", "Core"];

    if (dayName.includes("Push")) return prioritize(["Chest", "Shoulders", "Triceps", "Core"], focus);
    if (dayName.includes("Pull")) return prioritize(["Back", "Biceps", "Forearms", "Core"], focus);
    if (dayName.includes("Legs") || dayName.includes("Lower")) return prioritize(["Legs", "Core", "Cardio"], focus);
    if (dayName.includes("Upper")) return prioritize(["Chest", "Back", "Shoulders", "Biceps", "Triceps"], focus);
    if (["Chest", "Back", "Shoulders"].includes(dayName)) return prioritize([dayName, "Core", "Cardio"], focus);
    if (dayName.includes("Arms")) return prioritize(["Biceps", "Triceps", "Forearms", "Core"], focus);
    if (dayName.includes("Conditioning")) return prioritize(["Cardio", "Core", "Legs"], focus);
    return prioritize(["Legs", "Chest", "Back", "Shoulders", "Core"], focus);
  }

  function slotBlueprintsForDay(dayName, normalized, count, dayIndex = 1) {
    const occurrences = {};
    return trainingRoleTemplateForDay(dayName, normalized, dayIndex)
      .slice(0, count)
      .map((role, index) => {
        occurrences[role] = (occurrences[role] || 0) + 1;
        return blueprintForTrainingRole(role, occurrences[role], dayName, index < 4 ? "required" : "optional", dayIndex, normalized);
      })
      .map((item) => adaptBlueprintForInjuries(item, normalized))
      .sort((a, b) => blueprintOrderRank(a) - blueprintOrderRank(b));
  }

  function trainingRoleTemplateForDay(dayName, normalized, dayIndex = 1) {
    const lowerB = /Lower B|Legs B/.test(dayName) || (dayName === "Lower" && dayIndex > 3);
    const direct = dayName === "Lower" && dayIndex > 3
      ? DAY_TRAINING_ROLE_TEMPLATES["Lower B"]
      : DAY_TRAINING_ROLE_TEMPLATES[dayName];
    const fallback = dayName.includes("Full Body")
      ? DAY_TRAINING_ROLE_TEMPLATES[/Full Body B$/.test(dayName) ? "Full Body B" : "Full Body A"]
      : dayName.includes("Upper")
      ? DAY_TRAINING_ROLE_TEMPLATES[dayName.includes("B") ? "Upper B" : "Upper A"]
      : dayName.includes("Lower") || dayName.includes("Legs")
      ? DAY_TRAINING_ROLE_TEMPLATES[dayName.includes("B") ? "Lower B" : "Lower A"]
      : dayName.includes("Push")
      ? DAY_TRAINING_ROLE_TEMPLATES[dayName.includes("B") ? "Push B" : "Push A"]
      : dayName.includes("Pull")
      ? DAY_TRAINING_ROLE_TEMPLATES[dayName.includes("B") ? "Pull B" : "Pull A"]
      : DAY_TRAINING_ROLE_TEMPLATES["Full Body A"];
    const lowerDay = dayName.includes("Lower") || dayName.includes("Legs");
    const constrainedLowerRoles = !hasEquipmentCapability(normalized, "machine") && lowerDay
      ? HOME_LOWER_ROLE_TEMPLATES[lowerB ? "B" : "A"]
      : null;
    const contextualRoles = (constrainedLowerRoles || direct || fallback).map((role) => adaptTrainingRoleForContext(role, normalized));
    if (normalized.equipment_selection_mode === "explicit" || normalized.place === "Home") {
      const equipment = new Set(normalized.equipment.map(normalizeEquipmentName));
      const lacksLoadedShoulderIsolation = !["dumbbell", "cable", "machine"].some((item) => equipment.has(item));
      const maximumHorizontalPushes = normalized.equipment_selection_mode !== "explicit" || ["cable", "machine"].some((item) => equipment.has(item)) ? 2 : 1;
      let horizontalPullCount = 0;
      let horizontalPushCount = 0;
      return contextualRoles.map((role) => {
        if (role === "horizontal_pull") {
          horizontalPullCount += 1;
          return horizontalPullCount > 2 ? "core" : role;
        }
        if (role === "horizontal_push") {
          horizontalPushCount += 1;
          return horizontalPushCount > maximumHorizontalPushes ? "core" : role;
        }
        if (role === "side_rear_delts" && dayName.includes("Push") && lacksLoadedShoulderIsolation) return "core";
        return role;
      });
    }
    return contextualRoles;
  }

  function adaptTrainingRoleForContext(role, normalized) {
    const hasAny = (...items) => hasEquipmentCapability(normalized, ...items);
    if (role === "vertical_pull" && !hasAny("cable", "machine")) return "horizontal_pull";
    if (role === "quadriceps_isolation" && !hasAny("machine")) return "knee_dominant";
    if (role === "hamstring_isolation" && !hasAny("machine")) return "hip_dominant";
    if (role === "forearms" && !hasAny("cable") && !(hasAny("dumbbell") && hasAny("bench"))) return "core";
    return role;
  }

  function hasEquipmentCapability(normalized, ...items) {
    const equipment = new Set(normalized.equipment.map(normalizeEquipmentName));
    return items.some((item) => equipment.has(item));
  }

  function supportsDirectArmWork(normalized) {
    return hasEquipmentCapability(normalized, "bodyweight", "dumbbell", "barbell", "cable", "machine");
  }

  function adaptEmphasisTrainingRole(role, normalized) {
    const contextualRole = adaptTrainingRoleForContext(role, normalized);
    if (normalized.injuries.some((injury) => /knee/i.test(injury)) && ["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"].includes(contextualRole)) {
      return "hip_dominant";
    }
    return contextualRole;
  }

  function blueprintForTrainingRole(role, occurrence, dayName, slotPriority, dayIndex = 1, normalized = {}) {
    const lowerB = /Lower B|Legs B/.test(dayName) || (dayName === "Lower" && dayIndex > 3);
    const variant = dayName.includes("B") || lowerB ? "B" : "A";
    const lowerAVariant = /Lower A|Legs A/.test(dayName) || (dayName === "Legs" && dayIndex <= 3);
    const hipExtensionVariation = occurrence % 2 === 0 || (lowerAVariant && hasEquipmentCapability(normalized, "machine"));
    const definitions = {
      horizontal_push: blueprint("Chest", occurrence > 1 ? "isolation" : "compound", occurrence > 1 ? "fly" : "push"),
      vertical_push: blueprint("Shoulders", "compound", "push"),
      horizontal_pull: blueprint("Back", occurrence > 1 ? "isolation" : "compound", "horizontal_pull"),
      vertical_pull: blueprint("Back", "compound", "vertical_pull"),
      knee_dominant: lowerBlueprint("Legs", "compound", "squat", "knee_dominant", variant),
      hip_dominant: lowerBlueprint(
        "Legs",
        hipExtensionVariation ? "isolation" : "compound",
        hipExtensionVariation ? "hip_extension" : "hinge",
        "hip_dominant",
        variant
      ),
      unilateral_lower_body: lowerBlueprint("Legs", "compound", occurrence > 1 ? "squat" : "lunge", "unilateral_lower_body", variant),
      quadriceps_isolation: lowerBlueprint("Legs", "isolation", "knee_extension", "quadriceps_isolation", variant),
      hamstring_isolation: lowerBlueprint("Legs", "isolation", "knee_flexion", "hamstring_isolation", variant),
      calves: lowerBlueprint("Legs", "isolation", "plantar_flexion", "calves", variant),
      side_rear_delts: blueprint("Shoulders", "isolation", "raise"),
      biceps: blueprint("Biceps", "isolation", "elbow_flexion"),
      triceps: blueprint("Triceps", "isolation", "elbow_extension"),
      forearms: blueprint("Forearms", "isolation", "elbow_flexion"),
      core: blueprint("Core", "core", "core")
    };
    return { ...(definitions[role] || definitions.core), training_role: role, slot_priority: slotPriority };
  }

  function blueprintOrderRank(item) {
    if (item.exercise_type === "compound") return 1;
    if (item.exercise_type === "isolation" && ["Chest", "Back", "Shoulders", "Legs"].includes(item.category)) return 2;
    if (item.exercise_type === "isolation") return 3;
    if (item.exercise_type === "core") return 4;
    return 5;
  }

  function adaptBlueprintForInjuries(item, normalized) {
    const kneeLimited = normalized.injuries.some((injury) => /knee/i.test(injury));
    const lowerBackLimited = normalized.injuries.some((injury) => /lower back/i.test(injury));
    if (kneeLimited && item.category === "Legs" && ["squat", "lunge", "knee_extension"].includes(item.movement_pattern)) {
      return {
        ...blueprint("Legs", "isolation", "hip_extension"),
        training_role: "hip_dominant",
        slot_priority: item.slot_priority,
        lower_body_variant: item.lower_body_variant || null
      };
    }
    if (lowerBackLimited && item.category === "Legs" && item.movement_pattern === "hinge") {
      return {
        ...blueprint("Legs", "isolation", "hip_extension"),
        training_role: "hip_dominant",
        slot_priority: item.slot_priority,
        lower_body_variant: item.lower_body_variant || null
      };
    }
    return item;
  }

  function upperBlueprints(dayName, count, focus) {
    const upperA = dayName.includes("A");
    const firstPress = blueprint("Chest", "compound", "push");
    const firstPull = blueprint("Back", "compound", upperA ? "horizontal_pull" : "vertical_pull");
    const secondPull = upperA ? blueprint("Back", "compound", "vertical_pull") : blueprint("Back", "compound", "horizontal_pull");
    const shoulders = blueprint("Shoulders", count >= 6 ? "compound" : "isolation", count >= 6 ? "push" : "raise");
    const firstArm = upperA ? blueprint("Triceps", "isolation", "elbow_extension") : blueprint("Biceps", "isolation", "elbow_flexion");
    const secondArm = upperA ? blueprint("Biceps", "isolation", "elbow_flexion") : blueprint("Triceps", "isolation", "elbow_extension");

    if (count <= 4) {
      return [firstPress, firstPull, secondPull, shoulders];
    }

    return [
      firstPress,
      firstPull,
      secondPull,
      shoulders,
      firstArm,
      secondArm,
      blueprint("Core", "core", "core"),
      blueprint("Shoulders", "isolation", "raise")
    ].slice(0, count);
  }

  function lowerBlueprints(dayName, count, normalized, dayIndex) {
    const lowerA = !dayName.includes("B") && !(normalized.days === 5 && dayName === "Lower" && dayIndex > 3);
    const variant = lowerA ? "A" : "B";
    const homeTraining = normalized.place === "Home";
    const kneeLimited = normalized.injuries.some((injury) => /knee/i.test(injury));
    const hamstring = homeTraining
      ? lowerBlueprint("Legs", "isolation", "hip_extension", "posterior_chain_accessory", variant)
      : lowerBlueprint("Legs", "isolation", "knee_flexion", "knee_flexion", variant);
    const core = lowerBlueprint("Core", "core", "core", "trunk_accessory", variant);
    const calf = lowerBlueprint("Legs", "isolation", "plantar_flexion", "calf_accessory", variant);
    const lowerABase = [
      lowerBlueprint("Legs", "compound", "squat", "knee_dominant", variant),
      lowerBlueprint("Legs", "compound", "hinge", "hip_hinge", variant),
      hamstring,
      core,
      kneeLimited
        ? (homeTraining ? core : calf)
        : lowerBlueprint("Legs", "compound", "lunge", "unilateral_knee", variant),
      kneeLimited
        ? (homeTraining ? core : calf)
        : (homeTraining ? lowerBlueprint("Legs", "compound", "squat", "knee_dominant", variant) : calf),
      homeTraining || kneeLimited ? core : lowerBlueprint("Legs", "isolation", "knee_extension", "quadriceps_isolation", variant),
      homeTraining || kneeLimited ? blueprint("Biceps", "isolation", "elbow_flexion") : core
    ];
    const lowerBBase = [
      lowerBlueprint("Legs", "compound", "lunge", "unilateral_knee", variant),
      lowerBlueprint("Legs", "isolation", "hip_extension", "hip_extension", variant),
      homeTraining ? lowerBlueprint("Legs", "compound", "squat", "knee_dominant", variant) : hamstring,
      core,
      kneeLimited
        ? (homeTraining ? core : calf)
        : homeTraining
        ? lowerBlueprint("Legs", "compound", "hinge", "hip_hinge", variant)
        : lowerBlueprint("Legs", "compound", "squat", "knee_dominant", variant),
      kneeLimited
        ? (homeTraining ? core : calf)
        : (homeTraining ? lowerBlueprint("Legs", "compound", "squat", "knee_dominant", variant) : calf),
      homeTraining || kneeLimited ? core : lowerBlueprint("Legs", "isolation", "knee_extension", "quadriceps_isolation", variant),
      homeTraining || kneeLimited ? blueprint("Triceps", "isolation", "elbow_extension") : core
    ];
    return (lowerA ? lowerABase : lowerBBase).slice(0, count);
  }

  function lowerBlueprint(category, exerciseType, movementPattern, trainingRole, variant) {
    return { ...blueprint(category, exerciseType, movementPattern), training_role: trainingRole, lower_body_variant: variant };
  }

  function fullBodyBlueprints(count, focus) {
    const base = [
      blueprint("Legs", "compound", "squat"),
      blueprint("Chest", "compound", "push"),
      blueprint("Back", "compound", "horizontal_pull"),
      blueprint("Legs", "compound", "hinge"),
      focus.shoulderFocused ? blueprint("Shoulders", "isolation", "raise") : blueprint("Core", "core", "core"),
      blueprint("Shoulders", "isolation", "raise"),
      blueprint("Biceps", "isolation", "elbow_flexion"),
      blueprint("Triceps", "isolation", "elbow_extension")
    ];
    return base.slice(0, count);
  }

  function blueprint(category, exerciseType, movementPattern) {
    return { category, exercise_type: exerciseType, movement_pattern: movementPattern };
  }

  function dedupeAdjacentBlueprints(blueprints) {
    return blueprints.filter((item, index, list) => index === 0 || item.category !== list[index - 1].category || item.movement_pattern !== list[index - 1].movement_pattern);
  }

  function prioritize(base, focus) {
    return [...new Set([...focus.filter((item) => base.includes(item)), ...base])];
  }

  function patternForCategory(category, exerciseType) {
    if (exerciseType === "cardio" || category === "Cardio") return "cardio";
    if (category === "Core") return "core";
    if (category === "Back") return "horizontal_pull";
    if (category === "Chest" || category === "Shoulders") return "push";
    if (category === "Legs") return "squat";
    if (category === "Biceps" || category === "Forearms") return "elbow_flexion";
    if (category === "Triceps") return "elbow_extension";
    return category.toLowerCase();
  }

  function repRangeForGoal(goal, exerciseType) {
    if (exerciseType === "cardio") return [8, 20];
    if (goal === "Gain Strength") return exerciseType === "compound" ? [3, 6] : [8, 12];
    if (goal === "Build Muscle" || goal === "Improve Body Shape") return [8, 12];
    if (goal === "Lose Weight" || goal === "Improve Fitness") return [10, 15];
    return [8, 12];
  }

  function restForGoal(goal, exerciseType) {
    if (exerciseType === "cardio") return 60;
    if (goal === "Gain Strength" && exerciseType === "compound") return 150;
    if (exerciseType === "compound") return 90;
    return 60;
  }

  function filterCandidatesForSkeleton(skeleton, normalized, exerciseLibrary, diagnostics = null) {
    const map = {};
    const slotDiagnostics = {};

    for (const day of skeleton) {
      for (const slot of day.slots) {
        const categoryCandidates = exerciseLibrary
          .filter((exercise) => isExerciseAllowed(exercise, slot, normalized, true))
          .sort((a, b) => scoreExercise(b, slot, normalized) - scoreExercise(a, slot, normalized));
        const dayCompatibleCandidates = filterDayCompatibleCandidates(categoryCandidates, slot);
        const safetyCandidates = preferInjuryStableCandidatePool(dayCompatibleCandidates, slot, normalized);
        const roleCandidates = slot.training_role
          ? safetyCandidates.filter((exercise) => candidateMatchesTrainingRole(exercise, slot.training_role))
          : safetyCandidates;
        const exactCandidates = roleCandidates.filter((exercise) =>
          (exercise.movement_family || exercise.movement_pattern) === slot.movement_pattern &&
          exerciseTypeMatchesSlot(exercise.exercise_type, slot.exercise_type)
        );
        const roleTypeCandidates = roleCandidates.filter((exercise) =>
          exerciseTypeMatchesSlot(exercise.exercise_type, slot.exercise_type)
        );
        const selectionTier = exactCandidates.length
          ? "exact_role_pattern_type"
          : roleTypeCandidates.length
            ? "role_type_fallback"
            : roleCandidates.length
              ? "role_fallback"
              : slot.training_role
                ? "role_unavailable"
                : "category_unavailable";
        const selectedPool = exactCandidates.length
          ? exactCandidates
          : roleTypeCandidates.length
            ? roleTypeCandidates
            : roleCandidates;
        const selected = uniqueExercises(selectedPool).slice(0, MAX_CANDIDATES_PER_SLOT);

        map[slot.slot_id] = selected;
        slotDiagnostics[slot.slot_id] = {
          day_index: slot.day_index,
          muscle_group: slot.muscle_group,
          movement_pattern: slot.movement_pattern,
          training_role: slot.training_role || null,
          eligibility_mode: selectionTier,
          exact_count: exactCandidates.length,
          role_type_count: roleTypeCandidates.length,
          role_count: roleCandidates.length,
          category_count: categoryCandidates.length,
          selected_count: selected.length
        };
      }
    }

    for (const [slotId, candidates] of Object.entries(map)) {
      map[slotId] = candidates.map((candidate) => ({
        ...candidate,
        approved_substitution_ids: candidates
          .filter((alternative) =>
            Number(alternative.exercise_id) !== Number(candidate.exercise_id) &&
            alternative.substitution_group === candidate.substitution_group
          )
          .slice(0, 3)
          .map((alternative) => Number(alternative.exercise_id))
      }));
      slotDiagnostics[slotId].substitution_ready_candidates = map[slotId].filter(
        (candidate) => candidate.approved_substitution_ids.length
      ).length;
    }

    if (diagnostics) {
      Object.assign(diagnostics, {
        policy_version: CANDIDATE_POLICY_VERSION,
        maximum_candidates_per_slot: MAX_CANDIDATES_PER_SLOT,
        slots: slotDiagnostics,
        empty_slots: Object.entries(slotDiagnostics).filter(([, item]) => item.selected_count === 0).map(([slotId]) => slotId),
        fallback_tier_slots: Object.entries(slotDiagnostics)
          .filter(([, item]) => ["role_type_fallback", "role_fallback"].includes(item.eligibility_mode))
          .map(([slotId]) => slotId),
        unavailable_role_slots: Object.entries(slotDiagnostics)
          .filter(([, item]) => item.eligibility_mode === "role_unavailable")
          .map(([slotId]) => slotId),
        category_fallback_slots: []
      });
    }

    return map;
  }

  function filterDayCompatibleCandidates(candidates, slot) {
    if (!String(slot.day_name || "").includes("Push") || slot.training_role !== "side_rear_delts") return candidates;
    const lateral = candidates.filter((exercise) => {
      const text = `${exercise.name || ""} ${(exercise.sub_muscles || []).join(" ")}`.toLowerCase();
      return /lateral|side delt|medial delt/.test(text) && !/rear|posterior/.test(text);
    });
    return lateral.length ? lateral : [];
  }

  function exerciseTypeMatchesSlot(exerciseType, slotType) {
    if (slotType === "cardio") return exerciseType === "cardio";
    if (slotType === "core") return exerciseType === "core";
    return exerciseType === slotType;
  }

  function candidateMatchesTrainingRole(exercise, role) {
    const name = String(exercise?.name || "").toLowerCase();
    const movement = String(exercise?.movement_family || exercise?.movement_pattern || "");
    const subMuscles = (exercise?.sub_muscles || []).map((item) => String(item).toLowerCase());
    const canonicalRole = String(exercise?.training_role || "");
    if (!role) return true;
    if (role === canonicalRole) return true;
    if (role === "knee_dominant") return canonicalRole === "knee_dominant";
    if (role === "unilateral_knee") return canonicalRole === "unilateral_lower_body";
    if (role === "hip_hinge") return canonicalRole === "hip_dominant" && movement === "hinge";
    if (role === "knee_flexion") return canonicalRole === "hamstring_isolation";
    if (role === "hip_extension") return canonicalRole === "hip_dominant" && movement === "hip_extension";
    if (role === "posterior_chain_accessory") return ["hip_dominant", "hamstring_isolation"].includes(canonicalRole);
    if (role === "calf_accessory") return canonicalRole === "calves";
    if (role === "quadriceps_isolation") return canonicalRole === "quadriceps_isolation";
    if (role === "knee_friendly_lower") return ["hip_dominant", "hamstring_isolation"].includes(canonicalRole);
    if (role === "trunk_accessory") return canonicalRole === "core";
    if (CANONICAL_TRAINING_ROLES.has(role)) return false;
    return true;
  }

  function preferInjuryStableCandidatePool(candidates, slot, normalized) {
    if (!normalized.injuries.some((injury) => /neck/i.test(injury))) return candidates;
    const stable = candidates.filter((exercise) => isNeckStableCandidate(exercise, slot));
    if (slot.exercise_type === "cardio" && stable.length) return stable;
    return stable.length >= 2 ? stable : candidates;
  }

  function isNeckStableCandidate(exercise, slot) {
    const text = `${exercise?.name || ""} ${(exercise?.equipment || []).join(" ")}`.toLowerCase();
    if (slot.exercise_type === "cardio") return /(recumbent|stationary|bike|bicycle|elliptical|cross-trainer)/.test(text) && !/assault|air bike/.test(text);
    if (exercise.category === "Back" && slot.movement_pattern === "horizontal_pull") {
      return /(chest supported|seated|lever|machine|cable)/.test(text) && !/bent over/.test(text);
    }
    if (exercise.category === "Legs" && ["squat", "hinge"].includes(slot.movement_pattern)) {
      return /(goblet|belt squat|leg press|hack squat|wall squat|box squat|dumbbell|kettlebell|cable|lever)/.test(text) && !/barbell/.test(text);
    }
    return !isHighNeckLoadCandidate(exercise);
  }

  function isHardNeckConflict(exercise) {
    const text = String(exercise?.name || "").toLowerCase();
    return /behind.{0,8}neck|neck (?:flexion|extension|harness)|head harness|wrestler.{0,8}bridge/.test(text);
  }

  function isHighNeckLoadCandidate(exercise) {
    const text = String(exercise?.name || "").toLowerCase();
    return /barbell (?:front |full |back )?squat|barbell good morning|military press|behind.{0,8}neck|bent over row/.test(text);
  }

  function uniqueExercises(exercises) {
    const seen = new Set();
    return exercises.filter((exercise) => {
      const id = Number(exercise.exercise_id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function validateWorkoutCandidateCoverage(skeleton, candidateMap, diagnostics = {}, normalized = null) {
    const errors = [];
    for (const slot of skeleton.flatMap((day) => day.slots)) {
      const candidates = candidateMap[slot.slot_id] || [];
      const candidateIds = new Set(candidates.map((candidate) => Number(candidate.exercise_id)));
      if (!candidates.length) errors.push(`candidate_slot_empty:${slot.slot_id}`);
      if (candidates.length > MAX_CANDIDATES_PER_SLOT) errors.push(`candidate_slot_over_limit:${slot.slot_id}`);
      if (candidateIds.size !== candidates.length) errors.push(`candidate_slot_duplicate_ids:${slot.slot_id}`);
      for (const candidate of candidates) {
        if (candidate.category !== slot.muscle_group) errors.push(`candidate_wrong_category:${slot.slot_id}:${candidate.exercise_id}`);
        if (slot.training_role && !candidateMatchesTrainingRole(candidate, slot.training_role)) {
          errors.push(`candidate_wrong_training_role:${slot.slot_id}:${candidate.exercise_id}`);
        }
        if (normalized && !isExerciseAllowed(candidate, slot, normalized, true)) {
          errors.push(`candidate_failed_hard_eligibility:${slot.slot_id}:${candidate.exercise_id}`);
        }
        for (const substitutionId of candidate.approved_substitution_ids || []) {
          const substitution = candidates.find((item) => Number(item.exercise_id) === Number(substitutionId));
          if (!substitution) errors.push(`candidate_substitution_outside_slot:${slot.slot_id}:${substitutionId}`);
          if (substitution && substitution.substitution_group !== candidate.substitution_group) {
            errors.push(`candidate_substitution_wrong_group:${slot.slot_id}:${candidate.exercise_id}:${substitutionId}`);
          }
        }
      }
    }
    return {
      valid: errors.length === 0,
      errors,
      policy_version: diagnostics.policy_version || CANDIDATE_POLICY_VERSION,
      empty_slots: diagnostics.empty_slots || [],
      fallback_tier_slots: diagnostics.fallback_tier_slots || [],
      unavailable_role_slots: diagnostics.unavailable_role_slots || [],
      category_fallback_slots: []
    };
  }

  function pruneUnavailableCardioSlots(skeleton, candidateMap, normalized) {
    return skeleton.map((day) => ({
      ...day,
      slots: day.slots.filter((slot) => {
        if (slot.exercise_type !== "cardio") return true;
        const candidates = candidateMap[slot.slot_id] || [];
        if (!candidates.length) return false;
        if (lowImpactNeeded(normalized) && !candidates.some(isLowImpactCardio)) return false;
        return true;
      })
    }));
  }

  function isExerciseAllowed(exercise, slot, normalized, strictCategory) {
    if (!exercise || !exercise.exercise_id) return false;
    if (slot.exercise_type === "cardio" && !isCardioExercise(exercise)) return false;
    if (slot.exercise_type !== "cardio" && isCardioExercise(exercise)) return false;
    if (normalized.disliked_exercise_ids.includes(Number(exercise.exercise_id))) return false;
    if (!exercise.allowed_places?.includes(normalized.library_place || normalized.place)) return false;
    if (!difficultyAllowed(exercise.difficulty, normalized.experience)) return false;
    if (hasContraindication(exercise, normalized.excluded_contraindications)) return false;
    if (normalized.injuries.some((injury) => /neck/i.test(injury)) && isHardNeckConflict(exercise)) return false;

    if (!equipmentAllowed(exercise, normalized)) {
      return false;
    }

    if (strictCategory && exercise.category !== slot.muscle_group) {
      return false;
    }

    return true;
  }

  function equipmentAllowed(exercise, normalized) {
    const exerciseEquipment = Array.isArray(exercise.equipment) ? exercise.equipment : [];

    if (exerciseEquipment.length === 0) {
      return true;
    }

    const selectableCapabilities = new Set([
      "bodyweight", "dumbbell", "barbell", "cable", "machine", "band", "kettlebell", "bench",
      "treadmill", "bike", "elliptical", "rower", "stepmill", "jump rope"
    ]);
    const selectedCapabilities = new Set(normalized.equipment.map(normalizeEquipmentName));
    const requiredCapabilities = [...new Set(exerciseEquipment
      .map(normalizeEquipmentName)
      .filter((item) => selectableCapabilities.has(item)))];

    return requiredCapabilities.length > 0
      && requiredCapabilities.every((item) => selectedCapabilities.has(item));
  }

  function normalizeEquipmentName(value) {
    const text = String(value).toLowerCase();
    if (text.includes("dumbbell")) return "dumbbell";
    if (text.includes("barbell")) return "barbell";
    if (text.includes("cable") || text.includes("pulley") || text.includes("lat pulldown")) return "cable";
    if (text.includes("machine") || text.includes("station") || text.includes("leg press")) return "machine";
    if (text.includes("treadmill")) return "treadmill";
    if (text.includes("bike") || text.includes("bicycle")) return "bike";
    if (text.includes("elliptical") || text.includes("cross-trainer")) return "elliptical";
    if (text.includes("row")) return "rower";
    if (text.includes("stepmill") || text.includes("stair")) return "stepmill";
    if (text.includes("jump rope")) return "jump rope";
    if (text.includes("band")) return "band";
    if (text.includes("kettlebell")) return "kettlebell";
    if (text.includes("bench")) return "bench";
    if (text.includes("bodyweight") || text.includes("mat")) return "bodyweight";
    return text;
  }

  function difficultyAllowed(difficulty, experience) {
    return (DIFFICULTY_RANK[difficulty] || 2) <= (DIFFICULTY_RANK[experience] || 1) + 1;
  }

  function hasContraindication(exercise, restrictions) {
    if (!restrictions.length) return false;
    return (exercise.injury_flags || exercise.contraindications || []).some((tag) => restrictions.includes(tag));
  }

  function scoreExercise(exercise, slot, normalized) {
    let score = 0;

    if (exercise.category === slot.muscle_group) score += 20;
    if (exercise.exercise_type === slot.exercise_type) score += 10;
    if ((exercise.movement_family || exercise.movement_pattern) === slot.movement_pattern) score += 8;
    if ((exercise.sub_muscles || []).includes(slot.submuscle)) score += 5;
    if (normalized.focus_areas.some((focus) => (FOCUS_CATEGORY_MAP[focus] || []).includes(exercise.category))) score += 4;
    if (exercise.allowed_places?.includes(normalized.place)) score += 3;
    if (slot.exercise_type === "cardio" && lowImpactNeeded(normalized) && isLowImpactCardio(exercise)) score += 12;
    if (slot.exercise_type === "cardio" && lowImpactNeeded(normalized) && isHighImpactCardio(exercise)) score -= 20;
    if (normalized.injuries.some((injury) => /neck/i.test(injury))) {
      if (isNeckStableCandidate(exercise, slot)) score += 8;
      if (isHighNeckLoadCandidate(exercise)) score -= 12;
    }
    if (normalized.experience === "Beginner" && ["Barbell", "Bar"].some((word) => String(exercise.name).includes(word))) score -= 3;
    score += Math.max(0, 4 - Math.abs((DIFFICULTY_RANK[exercise.difficulty] || 2) - (DIFFICULTY_RANK[normalized.experience] || 1)));
    score += candidateQualityScore(exercise);
    if (normalized.duration_minutes <= 45) score -= Math.max(0, Number(exercise.fatigue_cost || 3) - 3) * 2;
    if (normalized.duration_minutes <= 45) score -= Math.max(0, Number(exercise.time_multiplier || 1) - 1) * 8;

    return score;
  }

  function candidateQualityScore(exercise) {
    const priority = Number(exercise.selection_priority || 3);
    const programmingValue = { high: 10, moderate: 4, low: -6 }[exercise.general_programming_value] || 0;
    const stability = { high: 6, moderate: 2, low: -5 }[exercise.stability] || 0;
    const setup = { low: 5, moderate: 2, high: -5 }[exercise.setup_complexity] || 0;
    return Math.max(0, 6 - priority) * 3 + programmingValue + stability + setup;
  }

  function isCardioExercise(exercise) {
    return exercise?.category === "Cardio" || exercise?.exercise_type === "cardio" || (exercise?.movement_family || exercise?.movement_pattern) === "cardio";
  }

  function lowImpactNeeded(normalized) {
    return normalized.injuries.some((injury) => /knee|ankle|hip|back/i.test(injury));
  }

  function isLowImpactCardio(exercise) {
    const text = `${exercise?.name || ""} ${(exercise?.equipment || []).join(" ")}`.toLowerCase();
    return /(bike|bicycle|elliptical|cross-trainer|recumbent|march in place|step jack|standing knee drive|high-knee march)/.test(text);
  }

  function isHighImpactCardio(exercise) {
    const text = `${exercise?.name || ""} ${(exercise?.equipment || []).join(" ")}`.toLowerCase();
    if (/(bike|bicycle|elliptical|cross-trainer|recumbent)/.test(text)) return false;
    return /(running|run|jump|rope|stepmill|stair)/.test(text);
  }

  function selectWorkoutExercises(skeleton, candidateMap, normalized, options) {
    const usedByDay = new Map();

    return {
      plan_days: skeleton.map((day) => {
        usedByDay.set(day.day_index, new Set());

        return {
          day_index: day.day_index,
          day_name: day.day_name,
          exercises: day.slots.map((slot) => {
            const used = usedByDay.get(day.day_index);
            const candidates = candidateMap[slot.slot_id] || [];
            const selected = candidates.find((exercise) => !used.has(exercise.exercise_id)) || candidates[0];

            if (selected) {
              used.add(selected.exercise_id);
            }

            return buildPlanExercise(slot, selected, normalized, options);
          })
        };
      })
    };
  }

  function buildPlanExercise(slot, exercise, normalized, options = {}) {
    const reps = Array.from({ length: slot.sets }, (_, index) => {
      const min = slot.rep_range[0];
      const max = slot.rep_range[1];
      return normalized.goal === "Gain Strength" ? Math.max(min, max - index) : max;
    });

    return {
      slot_id: slot.slot_id,
      exercise_id: exercise ? Number(exercise.exercise_id) : null,
      sets: slot.sets,
      reps,
      rest_seconds: slot.rest_seconds,
      notes: slot.exercise_type === "cardio" ? "Keep intensity conversational and adjust speed as needed." : null,
      _exercise_name: options.includeNames && exercise ? exerciseDisplayName(exercise) : undefined
    };
  }

  function validateWorkoutPlan(plan, skeleton, candidateMap, normalized) {
    const errors = [];
    const expectedSlots = skeleton.flatMap((day) => day.slots);
    const expectedSlotIds = new Set(expectedSlots.map((slot) => slot.slot_id));
    const seenSlots = new Set();

    if (!plan || !Array.isArray(plan.plan_days)) {
      return { valid: false, errors: ["invalid_plan_days"] };
    }

    for (const day of plan.plan_days) {
      const usedExercises = new Set();

      if (!Array.isArray(day.exercises)) {
        errors.push(`day_${day.day_index}_missing_exercises`);
        continue;
      }

      for (const exercise of day.exercises) {
        if (!expectedSlotIds.has(exercise.slot_id)) {
          errors.push(`extra_slot:${exercise.slot_id}`);
          continue;
        }

        if (seenSlots.has(exercise.slot_id)) {
          errors.push(`duplicate_slot:${exercise.slot_id}`);
        }

        seenSlots.add(exercise.slot_id);
        const candidates = candidateMap[exercise.slot_id] || [];
        const selected = candidates.find((candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id));
        const slot = expectedSlots.find((item) => item.slot_id === exercise.slot_id);

        if (!selected) {
          errors.push(`invalid_exercise_for_slot:${exercise.slot_id}:${exercise.exercise_id}`);
          continue;
        }

        if (usedExercises.has(Number(exercise.exercise_id))) {
          errors.push(`duplicate_exercise_same_day:${day.day_index}:${exercise.exercise_id}`);
        }

        usedExercises.add(Number(exercise.exercise_id));

        if (hasContraindication(selected, normalized.excluded_contraindications)) {
          errors.push(`restricted_exercise:${exercise.slot_id}:${exercise.exercise_id}`);
        }

        if (!Array.isArray(exercise.reps) || exercise.reps.length !== exercise.sets) {
          errors.push(`invalid_reps:${exercise.slot_id}`);
        }

        if (slot?.exercise_type === "cardio" && !exercise.notes) {
          errors.push(`cardio_missing_notes:${exercise.slot_id}`);
        }

        if (slot?.exercise_type !== "cardio" && exercise.notes && exercise.notes.length > 120) {
          errors.push(`unnecessary_bodybuilding_notes:${exercise.slot_id}`);
        }
      }
    }

    for (const slotId of expectedSlotIds) {
      if (!seenSlots.has(slotId)) {
        errors.push(`missing_slot:${slotId}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  function repairWorkoutPlan(plan, skeleton, candidateMap, errors) {
    const repaired = { plan_days: [] };
    const bySlot = new Map();

    for (const day of plan.plan_days || []) {
      for (const exercise of day.exercises || []) {
        bySlot.set(exercise.slot_id, exercise);
      }
    }

    for (const day of skeleton) {
      const used = new Set();
      repaired.plan_days.push({
        day_index: day.day_index,
        day_name: day.day_name,
        exercises: day.slots.map((slot) => {
          const current = bySlot.get(slot.slot_id);
          const candidates = candidateMap[slot.slot_id] || [];
          const currentValid = current && candidates.some((candidate) => Number(candidate.exercise_id) === Number(current.exercise_id));
          const exercise = currentValid
            ? candidates.find((candidate) => Number(candidate.exercise_id) === Number(current.exercise_id))
            : candidates.find((candidate) => !used.has(candidate.exercise_id)) || candidates[0];

          if (exercise) {
            used.add(exercise.exercise_id);
          }

          const fixed = buildPlanExercise(slot, exercise || null, {});
          fixed.notes = slot.exercise_type === "cardio" ? "Keep intensity conversational and adjust speed as needed." : null;
          return fixed;
        })
      });
    }

    repaired.repair_notes = errors.slice(0, 8);
    return repaired;
  }

  function buildFallbackWorkoutPlan(skeleton, candidateMap) {
    return {
      coaching_rationale: "This program uses the backend-selected weekly split, approved equipment, and safe exercise candidates to match the user's schedule, goal, and experience level while keeping recovery manageable.",
      plan_days: skeleton.map((day) => {
        const used = new Set();

        return {
          day_index: day.day_index,
          day_name: day.day_name,
          exercises: day.slots.map((slot) => {
            const candidates = candidateMap[slot.slot_id] || [];
            const selected = candidates.find((exercise) => !used.has(exercise.exercise_id)) || candidates[0] || null;

            if (selected) {
              used.add(selected.exercise_id);
            }

            return buildPlanExercise(slot, selected, {});
          })
        };
      })
    };
  }

  function buildFallbackWorkoutPlanV2(skeleton, candidateMap, normalized, options = {}) {
    const used = new Set();
    return {
      program_summary: {
        goal: normalized.goal,
        split: readableSplit(normalized.split),
        days_per_week: normalized.days,
        session_duration_minutes: normalized.duration_minutes,
        workout_place: normalized.place,
        available_equipment: normalized.equipment,
        focus_muscles: normalized.focus_areas,
        injuries: normalized.injuries.length ? normalized.injuries : ["None"],
        disliked_exercises: normalized.disliked_exercises.length ? normalized.disliked_exercises : ["None"],
        coaching_rationale: `This weekly plan uses a ${normalized.days}-day ${readableSplit(normalized.split)} split to match ${normalized.goal.toLowerCase()}, ${normalized.experience.toLowerCase()} experience, available equipment, focus muscles, and recovery across the week.`
      },
      plan_days: skeleton.map((day) => {
        const usedByDay = new Set();
        const usedFunctionsByDay = new Set();
        return {
          day_index: day.day_index,
          day_name: day.day_name,
          day_focus: day.slots
            .filter((slot) => slot.exercise_type !== "cardio")
            .map((slot) => slot.muscle_group)
            .filter((value, index, list) => list.indexOf(value) === index)
            .join(", "),
          exercises: day.slots.map((slot) => {
          const candidates = candidateMap[slot.slot_id] || [];
          const selected = candidates.find((exercise) =>
            !used.has(Number(exercise.exercise_id)) &&
            !usedByDay.has(Number(exercise.exercise_id)) &&
            !usedFunctionsByDay.has(sameFunctionSignature(exercise))
          )
            || candidates.find((exercise) =>
              !usedByDay.has(Number(exercise.exercise_id)) &&
              !usedFunctionsByDay.has(sameFunctionSignature(exercise))
            )
            || candidates.find((exercise) => !usedByDay.has(Number(exercise.exercise_id)))
            || candidates[0]
            || null;
          const duplicateReason = selected && used.has(Number(selected.exercise_id))
            ? "Repeated because no unused approved alternative was available for this slot."
            : null;
          if (selected) {
            used.add(Number(selected.exercise_id));
            usedByDay.add(Number(selected.exercise_id));
            const functionSignature = sameFunctionSignature(selected);
            if (functionSignature) usedFunctionsByDay.add(functionSignature);
          }
          return buildPlanExerciseV2(slot, selected, candidates, normalized, options, duplicateReason);
          })
        };
      }),
      repeat_instruction: "Repeat this weekly plan for 4 weeks. When you can complete the top of the rep range with clean form, increase the weight slightly next time.",
      safety_notes: workoutSafetyNotes(normalized)
    };
  }

  function workoutSafetyNotes(normalized) {
    const notes = [
      "Stop any exercise that causes sharp or worsening pain.",
      "Use conservative loads when returning from injury.",
      "Stop a painful movement; use a comfortable alternative available in the Fitnet app, or skip it for the day."
    ];
    if (normalized.injuries.some((injury) => /neck/i.test(injury))) {
      notes.push("Keep the neck neutral or relaxed and avoid forcing the head forward, backward, or to either side.");
      notes.push("Stop and seek qualified guidance if neck symptoms worsen, spread, or include numbness, tingling, or dizziness.");
    }
    return notes.slice(0, 5);
  }

  function buildFallbackWorkoutPlanV3(skeleton, candidateMap, normalized, options = {}) {
    const v2 = buildFallbackWorkoutPlanV2(skeleton, candidateMap, normalized, options);
    return {
      program_version: "fitnet.workout.output.v3",
      program_summary: v2.program_summary,
      plan_days: v2.plan_days.map((day) => ({
        ...day,
        exercises: day.exercises.map((exercise) => {
          const candidate = (candidateMap[exercise.slot_id] || []).find(
            (item) => Number(item.exercise_id) === Number(exercise.exercise_id)
          );
          return {
            ...exercise,
            effort_guidance: exerciseEffortGuidance(candidate, exercise.exercise_category),
            coaching_cue: coachingCue(candidate?.movement_family || candidate?.movement_pattern || exercise.movement_pattern, exercise.slot_id),
            substitution_ids: (candidate?.approved_substitution_ids || []).slice(0, 2)
          };
        })
      })),
      progression_guidance: {
        starting_load: "Begin with a conservative load that lets every repetition look controlled and consistent.",
        increase_reps: "Add repetitions within the prescribed range while keeping the same technique and rest periods.",
        increase_load: "After completing every set at the top of the range with clean form, increase the load by the smallest practical amount.",
        if_too_hard: "Reduce the load or work at the lower end of the rep range until all sets are controlled.",
        if_pain_occurs: "Stop the painful movement and do not push through sharp or worsening pain. Use a comfortable alternative available in the Fitnet app, or skip the exercise for the day."
      },
      recovery_guidance: [
        "Keep at least one recovery day between demanding sessions for the same muscles when possible.",
        "Reduce load or sets temporarily when fatigue repeatedly affects technique or normal recovery."
      ],
      pain_safety_guidance: v2.safety_notes,
      repeat_instruction: v2.repeat_instruction
    };
  }

  function coachingCue(movementPattern, slotId = "") {
    const cues = {
      squat: "Brace before descending and keep the knees aligned with the toes.",
      lunge: "Plant the front foot firmly and lower without letting the knee collapse inward.",
      leg_isolation: "Pause briefly at the working end of the range instead of using momentum.",
      hip_extension: "Finish by squeezing the glutes without arching the lower back.",
      knee_flexion: "Curl through a comfortable range without lifting the hips or rushing the return.",
      knee_extension: "Lift through the quadriceps and stop just short of snapping the knee into lockout.",
      plantar_flexion: "Let the heel lower fully, then pause at the top of each calf raise.",
      hinge: "Push the hips back while keeping the trunk braced and spine neutral.",
      push: "Set the shoulder blades, keep the wrists stacked, and press along the same path each rep.",
      horizontal_pull: "Lead with the elbows and avoid shrugging as you pull.",
      vertical_pull: "Lower the shoulders first, then drive the elbows toward the sides of the torso.",
      elbow_flexion: "Keep the upper arm steady and avoid swinging the weight.",
      elbow_extension: "Pin the upper arm in place and straighten the elbow without moving the shoulder.",
      raise: "Lift under control without shrugging or using momentum.",
      fly: "Keep a soft elbow bend and bring the arms together through a comfortable arc.",
      core: "Brace gently and move without holding your breath or straining the neck.",
      cardio: "Settle into an even rhythm that you can maintain for the full interval."
    };
    const base = cues[movementPattern] || "Keep the intended joint path consistent and avoid using momentum.";
    const variants = [
      "Keep the first and final repetition on the same path.",
      "Use the return phase to reset your position before the next repetition.",
      "End the set when you can no longer maintain that position.",
      "Keep the working joints aligned as fatigue builds."
    ];
    const index = [...String(slotId)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % variants.length;
    return `${base} ${variants[index]}`;
  }

  function exerciseEffortGuidance(candidate, exerciseCategory) {
    if (exerciseCategory === "cardio") return "Maintain a sustainable moderate pace and finish able to recover normally.";
    const role = candidate?.training_role;
    const guidanceByRole = {
      knee_dominant: "Finish each set with enough reserve to keep your bracing and knee alignment intact.",
      hip_dominant: "Stop the set before fatigue changes your hip position or spinal bracing.",
      unilateral_lower_body: "Use a load that lets both sides complete the same range without losing balance.",
      horizontal_push: "Choose a load that keeps the final repetitions strong without changing the pressing path.",
      vertical_push: "End the set before you need to lean back or shorten the overhead path.",
      horizontal_pull: "Stop before momentum replaces the pull or the shoulders begin to shrug.",
      vertical_pull: "Keep a small reserve so the final repetitions still begin from the shoulder blades.",
      quadriceps_isolation: "Challenge the quadriceps while keeping the return deliberate and the knee path comfortable.",
      hamstring_isolation: "Finish before the hips lift or the return becomes too quick to resist.",
      calves: "Work near fatigue while preserving the full heel drop and top pause.",
      side_rear_delts: "Use a weight that reaches the target muscles without turning the movement into a shrug.",
      biceps: "Stop before swinging or shoulder movement takes tension away from the elbow flexors.",
      triceps: "Keep a small reserve so the upper arm stays fixed through the final repetitions.",
      forearms: "Challenge the grip without letting wrist position or range shorten noticeably.",
      core: "Stop before breathing or trunk position becomes difficult to maintain."
    };
    if (guidanceByRole[role]) return guidanceByRole[role];
    return "Select a challenging load that still lets you complete every repetition with consistent technique.";
  }

  function exerciseDisplayName(exercise) {
    const aliases = {
      119: "Plate-Loaded Deadlift",
      131: "Single-Leg Extension Machine",
      133: "Seated Single-Leg Curl Machine",
      179: "Behind-the-Neck Barbell Shoulder Press",
      198: "Machine Shoulder Press",
      204: "Close-Grip Barbell Shoulder Press",
      498: "Barbell Single-Leg Squat",
      516: "Single-Leg Press Machine"
    };
    return aliases[Number(exercise?.exercise_id)] || String(exercise?.display_name || exercise?.name || "");
  }

  function buildPlanExerciseV2(slot, exercise, candidates, normalized, options = {}, duplicateReason = null) {
    const selectedExerciseSlot = exercise
      ? { ...slot, exercise_type: exercise.exercise_type || slot.exercise_type, movement_pattern: exercise.movement_pattern || slot.movement_pattern }
      : slot;
    const safe = safeTrainingRange(selectedExerciseSlot, normalized);
    const sets = clamp(safe.sets, safe.min_sets, safe.max_sets);
    const cardio = isCardioExercise(exercise) && slot.exercise_type === "cardio";

    return {
      slot_id: slot.slot_id,
      exercise_id: exercise ? Number(exercise.exercise_id) : null,
      exercise_name: exercise ? exerciseDisplayName(exercise) : "",
      exercise_category: cardio ? "cardio" : "strength",
      movement_pattern: exercise ? String(exercise.movement_pattern || slot.movement_pattern || "") : String(slot.movement_pattern || ""),
      muscle_group: exercise ? String(exercise.category || slot.muscle_group || "") : String(slot.muscle_group || ""),
      sets,
      reps: cardio ? `${safe.min_reps}-${safe.max_reps} min` : `${safe.min_reps}-${safe.max_reps}`,
      rest: cardio ? "-" : `${safe.rest_seconds} sec`,
      notes: cardio ? cardioNotes(exercise, normalized, safe) : "",
      duplicate_reason: duplicateReason,
      _exercise_name: options.includeNames && exercise ? exerciseDisplayName(exercise) : undefined
    };
  }

  function safeTrainingRange(slot, normalized) {
    if (slot.exercise_type === "compound" && normalized.goal === "Gain Strength") {
      return { min_sets: 3, max_sets: 5, sets: slot.sets || (normalized.duration_minutes <= 30 || normalized.experience === "Beginner" ? 3 : 4), min_reps: 3, max_reps: 6, reps: 4, rest_seconds: normalized.duration_minutes <= 30 ? 120 : 150 };
    }
    if (slot.exercise_type === "compound") {
      const hinge = slot.movement_pattern === "hinge";
      const shortSessionRest = normalized.duration_minutes <= 30 && !hinge ? 75 : null;
      return { min_sets: 3, max_sets: 4, sets: slot.sets || (normalized.goal === "Build Muscle" && normalized.duration_minutes > 30 ? 4 : 3), min_reps: hinge ? 6 : 8, max_reps: hinge ? 10 : 12, reps: hinge ? 6 : 8, rest_seconds: shortSessionRest || (normalized.goal === "Build Muscle" ? 120 : 90) };
    }
    if (slot.exercise_type === "cardio") {
      const range = slot.rep_range || cardioDurationBounds(normalized.duration_minutes);
      return { min_sets: 1, max_sets: 1, sets: 1, min_reps: range[0], max_reps: range[1], reps: range[0], rest_seconds: 0 };
    }
    if (slot.exercise_type === "core") {
      return { min_sets: 2, max_sets: 3, sets: slot.sets || 2, min_reps: 12, max_reps: 20, reps: 12, rest_seconds: 60 };
    }
    return { min_sets: 2, max_sets: 4, sets: slot.sets || 3, min_reps: 10, max_reps: 15, reps: 12, rest_seconds: 60 };
  }

  function cardioNotes(exercise, normalized, safe) {
    const name = String(exercise?.name || "").toLowerCase();
    const lowImpact = normalized.injuries.some((injury) => /knee|ankle|hip|back/i.test(injury));
    if (name.includes("bike") || lowImpact) return `Resistance 4-6, ${safe.min_reps}-${safe.max_reps} min, steady moderate pace`;
    if (name.includes("elliptical")) return `${safe.min_reps}-${safe.max_reps} min, easy-moderate pace`;
    if (name.includes("treadmill")) return `Incline 5-8%, ${safe.min_reps}-${safe.max_reps} min, steady pace`;
    return `${safe.min_reps}-${safe.max_reps} min, moderate pace`;
  }

  function readableSplit(split) {
    const labels = {
      full_body_2: "Full Body A / Full Body B",
      upper_lower_full_body_3: "Upper / Lower / Full Body",
      upper_lower_ab_4: "Upper A / Lower A / Upper B / Lower B",
      ppl_upper_lower_5: "Push / Pull / Legs / Upper / Lower",
      ppl_x2_6: "Push / Pull / Legs repeated",
      full_body: "Full Body",
      upper_lower: "Upper / Lower",
      push_pull_legs: "Push / Pull / Legs",
      body_part: "Body Part"
    };
    return labels[split] || split;
  }

  function validateWorkoutPlanV2(plan, skeleton, candidateMap, normalized) {
    const errors = [];
    const durationEstimates = [];
    const forbiddenRootFields = ["weeks", "weekly_progression", "week_progression", "progression_rules", "warm_up", "month_plan", "week_1", "week_2", "week_3", "week_4", "deload", "rir", "rpe", "effort", "cue", "tempo"];
    const forbiddenExerciseFields = ["rir", "rpe", "rir_target", "rpe_target", "effort", "cue", "coaching_cues", "tempo", "warm_up"];
    const allSlots = skeleton.flatMap((day) => day.slots);
    const expectedSlots = new Set(allSlots.map((slot) => slot.slot_id));
    const seenSlots = new Set();
    const seenExerciseIds = new Map();

    if (!plan || !plan.program_summary || !Array.isArray(plan.plan_days) || !plan.repeat_instruction || !Array.isArray(plan.safety_notes)) {
      return { valid: false, errors: ["schema:invalid_workout_v2_root"] };
    }

    for (const field of forbiddenRootFields) {
      if (plan[field] !== undefined) errors.push(`schema:forbidden_field:${field}`);
    }

    if (Number(plan.program_summary.days_per_week) !== normalized.days || plan.plan_days.length !== normalized.days) {
      errors.push(`schema:wrong_day_count:${plan.plan_days.length}:${normalized.days}`);
    }
    if (!plan.program_summary.coaching_rationale) errors.push("schema:missing_coaching_rationale");

    for (const day of plan.plan_days) {
      const expectedDay = skeleton.find((item) => item.day_index === Number(day.day_index));
      if (!expectedDay || !Array.isArray(day.exercises)) {
        errors.push(`schema:invalid_day:${day.day_index}`);
        continue;
      }
      if (day.exercises.length < Math.min(3, expectedDay.slots.length) || day.exercises.length > expectedDay.slots.length + 1) {
        errors.push(`schema:unrealistic_exercise_count:${day.day_index}`);
      }
      const durationRange = exerciseCountRange(normalized.duration_minutes);
      if (day.exercises.length < durationRange.min || day.exercises.length > durationRange.max) {
        errors.push(`duration_exercise_count_mismatch:${day.day_index}`);
      }

      const cardioIndexes = day.exercises
        .map((exercise, index) => ({ exercise, index }))
        .filter(({ exercise }) => {
          const slot = allSlots.find((item) => item.slot_id === exercise.slot_id);
          return slot?.exercise_type === "cardio";
        })
        .map((item) => item.index);
      if (cardioIndexes.some((index) => index !== day.exercises.length - 1)) {
        errors.push(`cardio_not_last:${day.day_index}`);
      }

      const orderRanks = day.exercises.map((exercise) => {
        const slot = allSlots.find((item) => item.slot_id === exercise.slot_id);
        return exerciseOrderRank(slot, exercise);
      });
      for (let index = 1; index < orderRanks.length; index += 1) {
        if (orderRanks[index] < orderRanks[index - 1]) {
          errors.push(`exercise_order_invalid:${day.day_index}`);
          break;
        }
      }

      const coreCount = day.exercises.filter((exercise) => {
        const slot = allSlots.find((item) => item.slot_id === exercise.slot_id);
        return slot?.exercise_type === "core" || String(exercise.muscle_group || "").toLowerCase() === "core";
      }).length;
      const allowedLowerCoreCount = normalized.place === "Home"
        ? normalized.duration_minutes >= 60 ? 3 : normalized.duration_minutes >= 45 ? 2 : 1
        : normalized.duration_minutes >= 75 ? 2 : 1;
      if ((day.day_name.includes("Lower") || day.day_name.includes("Legs")) && coreCount > allowedLowerCoreCount && !normalized.focus_areas.includes("Core")) {
        errors.push(`core_overused:${day.day_index}`);
      } else if (day.day_name.includes("Full Body") && coreCount > 1 && !normalized.focus_areas.includes("Core")) {
        errors.push(`core_overused:${day.day_index}`);
      }

      for (const exercise of day.exercises) {
        for (const field of forbiddenExerciseFields) {
          if (exercise[field] !== undefined) errors.push(`schema:forbidden_exercise_field:${exercise.slot_id}:${field}`);
        }
        if (!expectedSlots.has(exercise.slot_id)) {
          errors.push(`extra_slot:${exercise.slot_id}`);
          continue;
        }
        if (seenSlots.has(exercise.slot_id)) errors.push(`duplicate_slot:${exercise.slot_id}`);
        seenSlots.add(exercise.slot_id);

        const slot = allSlots.find((item) => item.slot_id === exercise.slot_id);
        const candidates = candidateMap[exercise.slot_id] || [];
        const selected = candidates.find((candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id));
        const selectedExerciseSlot = selected
          ? { ...slot, exercise_type: selected.exercise_type || slot.exercise_type, movement_pattern: selected.movement_pattern || slot.movement_pattern }
          : slot;
        const safe = safeTrainingRange(selectedExerciseSlot, normalized);

        if (!selected) {
          errors.push(`invalid_exercise_for_slot:${exercise.slot_id}:${exercise.exercise_id}`);
          continue;
        }
        if (exercise.exercise_name && exercise.exercise_name !== exerciseDisplayName(selected)) {
          errors.push(`exercise_name_mismatch:${exercise.slot_id}:${exercise.exercise_id}`);
        }
        if (/\b(?:lever|sled|alternate|one leg|military press)\b/i.test(exerciseDisplayName(selected))) {
          errors.push(`unprofessional_exercise_name:${exercise.slot_id}:${exercise.exercise_id}`);
        }
        if (hasContraindication(selected, normalized.excluded_contraindications)) {
          errors.push(`restricted_exercise:${exercise.slot_id}:${exercise.exercise_id}`);
        }
        const exerciseId = Number(exercise.exercise_id);
        const previousUse = seenExerciseIds.get(exerciseId) || { count: 0, day_indexes: new Set() };
        if (previousUse.count > 0) {
          const alternative = candidates.find((candidate) => !seenExerciseIds.has(Number(candidate.exercise_id)));
          if (!exercise.duplicate_reason) errors.push(`duplicate_missing_reason:${exercise.exercise_id}`);
          if (previousUse.day_indexes.has(Number(day.day_index))) errors.push(`duplicate_exercise_same_day:${day.day_index}:${exercise.exercise_id}`);
          if (previousUse.count >= 2 && alternative) errors.push(`duplicate_exercise_week:${exercise.exercise_id}`);
        }
        previousUse.count += 1;
        previousUse.day_indexes.add(Number(day.day_index));
        seenExerciseIds.set(exerciseId, previousUse);

        if (!Number.isInteger(exercise.sets) || exercise.sets < safe.min_sets || exercise.sets > safe.max_sets) {
          errors.push(`unsafe_sets:${exercise.slot_id}`);
        }
        if (typeof exercise.reps !== "string" || /,\s*\d/.test(exercise.reps)) errors.push(`invalid_reps_format:${exercise.slot_id}`);
        if (slot.exercise_type === "cardio") {
          if (!isCardioExercise(selected)) errors.push(`cardio_slot_non_cardio_exercise:${exercise.slot_id}`);
          if (lowImpactNeeded(normalized) && isHighImpactCardio(selected)) errors.push(`high_impact_cardio_for_pain:${exercise.slot_id}`);
          if (!exercise.notes) errors.push(`cardio_missing_notes:${exercise.slot_id}`);
          if (!String(exercise.reps).includes("min")) errors.push(`cardio_missing_duration:${exercise.slot_id}`);
          const expectedCardioRange = `${safe.min_reps}-${safe.max_reps} min`;
          if (String(exercise.reps).replace(/–/g, "-") !== expectedCardioRange) {
            errors.push(`cardio_duration_mismatch:${exercise.slot_id}:${exercise.reps}:${expectedCardioRange}`);
          }
          if (String(exercise.rest || "") !== "-") errors.push(`cardio_rest_invalid:${exercise.slot_id}`);
        } else {
          if (isCardioExercise(selected)) errors.push(`strength_slot_cardio_exercise:${exercise.slot_id}`);
          if (exercise.notes && String(exercise.notes).trim()) errors.push(`strength_notes_not_empty:${exercise.slot_id}`);
          if (/\b(min|minute|resistance|pace|incline|treadmill|bike|elliptical|steady)\b/i.test(String(exercise.notes || ""))) errors.push(`strength_cardio_notes:${exercise.slot_id}`);
          if (String(exercise.reps).includes("min")) errors.push(`strength_reps_as_duration:${exercise.slot_id}`);
          if (!/^\d+(-|–)\d+$/.test(String(exercise.reps))) errors.push(`strength_reps_not_range:${exercise.slot_id}`);
          if (!String(exercise.rest || "").includes("sec")) errors.push(`strength_rest_invalid:${exercise.slot_id}`);
        }
      }

      validateDayBalance(day, allSlots, errors, normalized);
      const durationEstimate = estimateWorkoutDayDuration(day, skeleton, candidateMap, normalized);
      durationEstimates.push(durationEstimate);
      if (!durationEstimate.within_limit) {
        errors.push(`session_duration_exceeded:${day.day_index}:${durationEstimate.estimated_minutes}:${durationEstimate.maximum_minutes}`);
      }
    }

    for (const slotId of expectedSlots) {
      if (!seenSlots.has(slotId)) errors.push(`missing_slot:${slotId}`);
    }

    return { valid: errors.length === 0, errors, duration_estimates: durationEstimates };
  }

  function validateWorkoutPlanV3(plan, skeleton, candidateMap, normalized, coachingStrategy = null) {
    const errors = [];
    const requiredRootFields = ["program_version", "program_summary", "plan_days", "progression_guidance", "recovery_guidance", "pain_safety_guidance", "repeat_instruction"];
    const allowedExerciseFields = ["slot_id", "exercise_id", "exercise_name", "exercise_category", "movement_pattern", "muscle_group", "sets", "reps", "rest", "notes", "effort_guidance", "coaching_cue", "substitution_ids", "duplicate_reason", "_exercise_name"];

    if (!plan || typeof plan !== "object") return { valid: false, errors: ["schema:invalid_workout_v3_root"] };
    for (const field of requiredRootFields) {
      if (plan[field] === undefined || plan[field] === null) errors.push(`schema:missing_v3_field:${field}`);
    }
    for (const field of Object.keys(plan)) {
      if (!requiredRootFields.includes(field)) errors.push(`schema:extra_v3_field:${field}`);
    }
    if (plan.program_version !== "fitnet.workout.output.v3") errors.push("schema:invalid_program_version");

    const progressionFields = ["starting_load", "increase_reps", "increase_load", "if_too_hard", "if_pain_occurs"];
    for (const field of progressionFields) {
      const value = plan.progression_guidance?.[field];
      if (typeof value !== "string" || !value.trim()) errors.push(`schema:missing_progression_guidance:${field}`);
    }
    for (const field of Object.keys(plan.progression_guidance || {})) {
      if (!progressionFields.includes(field)) errors.push(`schema:extra_progression_field:${field}`);
    }
    if (!Array.isArray(plan.recovery_guidance) || !plan.recovery_guidance.length || plan.recovery_guidance.length > 5) {
      errors.push("schema:invalid_recovery_guidance");
    }
    if (!Array.isArray(plan.pain_safety_guidance) || !plan.pain_safety_guidance.length || plan.pain_safety_guidance.length > 5) {
      errors.push("schema:invalid_pain_safety_guidance");
    }

    for (const day of plan.plan_days || []) {
      for (const exercise of day.exercises || []) {
        for (const field of Object.keys(exercise)) {
          if (!allowedExerciseFields.includes(field)) errors.push(`schema:extra_v3_exercise_field:${exercise.slot_id}:${field}`);
        }
        if (typeof exercise.effort_guidance !== "string" || !exercise.effort_guidance.trim() || exercise.effort_guidance.length > 180) {
          errors.push(`schema:invalid_effort_guidance:${exercise.slot_id}`);
        }
        if (/\b(rir|rpe)\b/i.test(String(exercise.effort_guidance || ""))) {
          errors.push(`schema:forbidden_effort_scale:${exercise.slot_id}`);
        }
        if (typeof exercise.coaching_cue !== "string" || !exercise.coaching_cue.trim() || exercise.coaching_cue.length > 180) {
          errors.push(`schema:invalid_coaching_cue:${exercise.slot_id}`);
        }
        if (!Array.isArray(exercise.substitution_ids) || exercise.substitution_ids.length > 3) {
          errors.push(`schema:invalid_substitution_ids:${exercise.slot_id}`);
          continue;
        }
        const selected = (candidateMap[exercise.slot_id] || []).find(
          (candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id)
        );
        const approved = new Set((selected?.approved_substitution_ids || []).map(Number));
        const seen = new Set();
        for (const substitutionId of exercise.substitution_ids) {
          if (!Number.isInteger(substitutionId) || substitutionId === Number(exercise.exercise_id)) {
            errors.push(`invalid_substitution_id:${exercise.slot_id}:${substitutionId}`);
          }
          if (!approved.has(Number(substitutionId))) errors.push(`unapproved_substitution_id:${exercise.slot_id}:${substitutionId}`);
          if (seen.has(Number(substitutionId))) errors.push(`duplicate_substitution_id:${exercise.slot_id}:${substitutionId}`);
          seen.add(Number(substitutionId));
        }
      }
    }

    const compatibilityPlan = {
      program_summary: plan.program_summary,
      plan_days: (plan.plan_days || []).map((day) => ({
        day_index: day.day_index,
        day_name: day.day_name,
        day_focus: day.day_focus,
        exercises: (day.exercises || []).map((exercise) => ({
          slot_id: exercise.slot_id,
          exercise_id: exercise.exercise_id,
          exercise_name: exercise.exercise_name,
          exercise_category: exercise.exercise_category,
          movement_pattern: exercise.movement_pattern,
          muscle_group: exercise.muscle_group,
          sets: exercise.sets,
          reps: exercise.reps,
          rest: exercise.rest,
          notes: exercise.notes,
          duplicate_reason: exercise.duplicate_reason
        }))
      })),
      repeat_instruction: plan.repeat_instruction,
      safety_notes: plan.pain_safety_guidance
    };
    const baseValidation = validateWorkoutPlanV2(compatibilityPlan, skeleton, candidateMap, normalized);
    errors.push(...baseValidation.errors);
    const qualityValidation = coachingStrategy
      ? validateWorkoutQuality(plan, coachingStrategy, skeleton, candidateMap, normalized)
      : null;
    if (qualityValidation) errors.push(...qualityValidation.errors);
    const qualityScore = coachingStrategy
      ? scoreWorkoutQuality(plan, coachingStrategy, normalized, qualityValidation, baseValidation)
      : null;
    if (qualityScore && !qualityScore.passed) {
      if (qualityScore.score < qualityScore.threshold) {
        errors.push(`quality:score_below_threshold:${qualityScore.score}:${qualityScore.threshold}`);
      }
      if (!qualityScore.critical_safety_passed) errors.push("quality:critical_safety_failed");
      errors.push(...qualityScore.reasons.slice(0, 5).map((reason) => `quality:score_reason:${reason}`));
    }

    return {
      valid: errors.length === 0,
      errors,
      policy_version: AI_QUALITY_POLICY_VERSION,
      validation_scope: {
        ai_controlled: ["candidate_selection", "sets_reps_rest", "session_duration", "weekly_volume", "exercise_repetition", "coaching_completeness", "progression_guidance", "recovery_guidance"],
        backend_controlled: ["split", "day_labels", "slot_distribution", "training_role_templates", "exercise_count", "cardio_allocation"]
      },
      duration_estimates: baseValidation.duration_estimates || [],
      quality_validation: qualityValidation,
      quality_score: qualityScore
    };
  }

  function validateWorkoutQuality(plan, coachingStrategy, skeleton, candidateMap, normalized) {
    const errors = [];
    const weeklySets = {};
    const weeklyRoleSets = {};
    const primaryMuscleSets = {};
    const upperBodyDirectArmSets = { biceps: 0, triceps: 0 };
    const dayDiagnostics = [];
    const selectedBySlot = new Map();

    for (const day of plan.plan_days || []) {
      const expectedDay = skeleton.find((item) => item.day_index === Number(day.day_index));
      const selected = (day.exercises || []).map((exercise) => {
        const candidate = (candidateMap[exercise.slot_id] || []).find(
          (item) => Number(item.exercise_id) === Number(exercise.exercise_id)
        );
        if (candidate) selectedBySlot.set(exercise.slot_id, candidate);
        return { exercise, candidate };
      });
      const muscleCounts = countValues(selected.map(({ candidate }) => candidate?.category).filter(Boolean));
      const movementCounts = countValues(
        selected.map(({ candidate }) => candidate?.movement_family || candidate?.movement_pattern).filter(Boolean)
      );
      const functionCounts = countValues(selected.map(({ candidate }) => sameFunctionSignature(candidate)).filter(Boolean));
      const trainingRoleCounts = countValues(
        selected.map(({ exercise }) => expectedDay?.slots.find((slot) => slot.slot_id === exercise.slot_id)?.training_role).filter(Boolean)
      );

      if (/Lower|Legs/.test(day.day_name) && !coachingStrategy.injury_selection_policy?.structure_adaptation_active) {
        const quadricepsSelections = sumRoleSets(trainingRoleCounts, ["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"]);
        const posteriorSelections = sumRoleSets(trainingRoleCounts, ["hip_dominant", "hamstring_isolation"]);
        if (quadricepsSelections > 3) errors.push(`quality:lower_day_quad_redundancy:${day.day_index}:${quadricepsSelections}`);
        if ((day.exercises || []).length >= 4 && (!quadricepsSelections || !posteriorSelections)) {
          errors.push(`quality:lower_day_chain_missing:${day.day_index}:${quadricepsSelections}:${posteriorSelections}`);
        }
      }

      for (const [family, count] of Object.entries(movementCounts)) {
        const kneeAdaptedLegLimit = ["leg_isolation", "hip_extension"].includes(family) && normalized.injuries.some((injury) => /knee/i.test(injury)) ? 3 : 2;
        const roleAdjustedLimit = family === "elbow_flexion" && trainingRoleCounts.forearms ? 3 : kneeAdaptedLegLimit;
        if (!["cardio", "core"].includes(family) && count > roleAdjustedLimit) errors.push(`quality:excessive_movement_repetition:${day.day_index}:${family}:${count}`);
      }
      for (const [signature, count] of Object.entries(functionCounts)) {
        const constrainedHomeHinge = normalized.place === "Home" && /Lower|Legs/.test(day.day_name) &&
          normalized.duration_minutes >= 60 && signature.startsWith("hip_dominant|hinge|") && count === 2;
        const constrainedEquipmentPull = (normalized.equipment_selection_mode === "explicit" || normalized.place === "Home") &&
          !hasEquipmentCapability(normalized, "cable", "machine") &&
          signature.startsWith("horizontal_pull|") && count === 2;
        if (count > 1 && !constrainedHomeHinge && !constrainedEquipmentPull && !coachingStrategy.injury_selection_policy?.structure_adaptation_active) {
          errors.push(`quality:same_function_redundancy:${day.day_index}:${signature}:${count}`);
        }
      }

      for (const { exercise, candidate } of selected) {
        if (!candidate) continue;
        const slot = expectedDay?.slots.find((item) => item.slot_id === exercise.slot_id);
        if (slot?.muscle_group && candidate.category !== slot.muscle_group) {
          errors.push(`quality:slot_muscle_mismatch:${exercise.slot_id}:${slot.muscle_group}`);
        }
        if (slot?.training_role && !candidateMatchesTrainingRole(candidate, slot.training_role)) {
          errors.push(`quality:training_role_mismatch:${exercise.slot_id}:${slot.training_role}`);
        }
        const exerciseSets = Number(exercise.sets || 0);
        weeklySets[candidate.category] = (weeklySets[candidate.category] || 0) + exerciseSets;
        weeklyRoleSets[candidate.training_role] = (weeklyRoleSets[candidate.training_role] || 0) + exerciseSets;
        if (["upper", "push", "pull"].includes(dayRole(day.day_name)) && ["biceps", "triceps"].includes(candidate.training_role)) {
          upperBodyDirectArmSets[candidate.training_role] += exerciseSets;
        }
        const primaryMuscle = candidate.primary_muscle || candidate.category;
        primaryMuscleSets[primaryMuscle] = (primaryMuscleSets[primaryMuscle] || 0) + exerciseSets;
        const range = safeRangeForCandidate(candidate, coachingStrategy);
        if (range && candidate.exercise_type !== "cardio") {
          const reps = parseNumericRange(exercise.reps);
          const rest = parseRestSeconds(exercise.rest);
          if (!reps || reps[0] < range.reps[0] || reps[1] > range.reps[1]) {
            errors.push(`quality:reps_outside_safe_range:${exercise.slot_id}`);
          }
          if (rest < range.rest_seconds[0] || rest > range.rest_seconds[1]) {
            errors.push(`quality:rest_outside_safe_range:${exercise.slot_id}`);
          }
        }
        if ((candidate.injury_flags || []).some((flag) => normalized.excluded_contraindications.includes(flag))) {
          errors.push(`quality:injury_conflict:${exercise.slot_id}:${candidate.exercise_id}`);
        }
        if (normalized.injuries.some((injury) => /neck/i.test(injury))) {
          if (isHardNeckConflict(candidate)) errors.push(`quality:neck_hard_conflict:${exercise.slot_id}:${candidate.exercise_id}`);
          const stableAlternatives = (candidateMap[exercise.slot_id] || []).filter((item) => isNeckStableCandidate(item, slot));
          if (stableAlternatives.length >= 2 && !isNeckStableCandidate(candidate, slot)) {
            errors.push(`quality:neck_stability_preference_missed:${exercise.slot_id}:${candidate.exercise_id}`);
          }
        }
      }

      dayDiagnostics.push({
        day_index: Number(day.day_index),
        day_name: day.day_name,
        muscle_slot_counts: muscleCounts,
        movement_family_counts: movementCounts,
        training_role_counts: trainingRoleCounts,
        same_function_counts: functionCounts
      });

      if (/Lower|Legs/.test(day.day_name) && !normalized.injuries.some((injury) => /knee|lower back/i.test(injury))) {
        const posteriorSelections = selected.filter(({ candidate }) =>
          candidate?.category === "Legs" && /deadlift|pull through|bridge|hip thrust/.test(String(candidate?.name || "").toLowerCase())
        ).length;
        const posteriorLimit = normalized.place === "Home" && normalized.duration_minutes >= 60 ? 3 : 2;
        if (posteriorSelections > posteriorLimit) errors.push(`quality:lower_posterior_redundancy:${day.day_index}:${posteriorSelections}`);
      }
    }

    const requiredWeeklyMuscles = new Set(
      skeleton.flatMap((day) => day.slots)
        .filter((slot) => slot.exercise_type !== "cardio")
        .map((slot) => slot.muscle_group)
    );
    const plannedWeeklySets = skeleton.flatMap((day) => day.slots).reduce((totals, slot) => {
      if (slot.exercise_type !== "cardio") totals[slot.muscle_group] = (totals[slot.muscle_group] || 0) + Number(slot.sets || 0);
      return totals;
    }, {});
    const plannedRoleSets = skeleton.flatMap((day) => day.slots).reduce((totals, slot) => {
      if (slot.exercise_type !== "cardio") totals[slot.training_role] = (totals[slot.training_role] || 0) + Number(slot.sets || 0);
      return totals;
    }, {});
    const plannedUpperArmSlots = skeleton.reduce((totals, day) => {
      if (!["upper", "push", "pull"].includes(dayRole(day.day_name))) return totals;
      for (const slot of day.slots) {
        if (["biceps", "triceps"].includes(slot.training_role)) totals[slot.training_role] += 1;
      }
      return totals;
    }, { biceps: 0, triceps: 0 });
    for (const group of requiredWeeklyMuscles) {
      if (!weeklySets[group]) errors.push(`quality:weekly_muscle_omitted:${group}`);
    }
    const volumeOutsidePlan = Object.entries(plannedWeeklySets).some(([group, plannedSets]) => {
      const ratio = Number(weeklySets[group] || 0) / Number(plannedSets || 1);
      return ratio < 0.6 || ratio > 1.6;
    });
    if (volumeOutsidePlan) {
      errors.push("quality:major_muscle_volume_imbalance:outside_skeleton_plan");
    }
    const roleVolumeOutsidePlan = Object.entries(plannedRoleSets).some(([role, plannedSets]) => {
      const ratio = Number(weeklyRoleSets[role] || 0) / Number(plannedSets || 1);
      return ratio < 0.6 || ratio > 1.6;
    });
    if (roleVolumeOutsidePlan) errors.push("quality:training_role_volume_outside_plan");

    validateVolumeRatio(primaryMuscleSets.Chest, primaryMuscleSets.Back, "chest_back", errors);
    const pushSets = sumRoleSets(weeklyRoleSets, ["horizontal_push", "vertical_push"]);
    const pullSets = sumRoleSets(weeklyRoleSets, ["horizontal_pull", "vertical_pull"]);
    validateVolumeRatio(pushSets, pullSets, "push_pull", errors, 0.75, 4 / 3);
    const quadricepsSets = sumRoleSets(weeklyRoleSets, ["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"]);
    const posteriorSets = sumRoleSets(weeklyRoleSets, ["hip_dominant", "hamstring_isolation"]);
    if (!normalized.injuries.some((injury) => /knee|lower back/i.test(injury))) {
      validateVolumeRatio(quadricepsSets, posteriorSets, "quadriceps_posterior", errors, 0.8, 1.25);
    }
    for (const role of ["vertical_push", "side_rear_delts", "biceps", "triceps"]) {
      if (plannedRoleSets[role] && !weeklyRoleSets[role]) errors.push(`quality:planned_role_omitted:${role}`);
    }
    if (plannedUpperArmSlots.biceps > 0 && plannedUpperArmSlots.triceps > 0) {
      const directArmSetDifference = Math.abs(upperBodyDirectArmSets.biceps - upperBodyDirectArmSets.triceps);
      if (directArmSetDifference > 4) {
        errors.push(`quality:direct_arm_set_imbalance:${upperBodyDirectArmSets.biceps}:${upperBodyDirectArmSets.triceps}`);
      }
    }
    const totalRoleSets = Object.values(weeklyRoleSets).reduce((sum, value) => sum + Number(value || 0), 0);
    if (Object.keys(weeklyRoleSets).length >= 4 && totalRoleSets > 0) {
      for (const [role, sets] of Object.entries(weeklyRoleSets)) {
        if (sets / totalRoleSets > 0.45) errors.push(`quality:excessive_single_role_volume:${role}`);
      }
    }

    const focusCategories = normalized.focus_areas
      .filter((focus) => focus !== "Full Body")
      .flatMap((focus) => FOCUS_CATEGORY_MAP[focus] || []);
    for (const group of focusCategories) {
      if (!weeklySets[group]) errors.push(`quality:focus_area_missing:${group}`);
    }

    const guidanceText = [
      plan.program_summary?.coaching_rationale,
      ...Object.values(plan.progression_guidance || {}),
      ...(plan.recovery_guidance || []),
      ...(plan.pain_safety_guidance || [])
    ].join(" ");
    const progressionComplete = Object.values(plan.progression_guidance || {}).length === 5 &&
      Object.values(plan.progression_guidance || {}).every((value) => typeof value === "string" && value.trim().length >= 20);
    if (!progressionComplete) errors.push("quality:progression_guidance_incomplete");
    const recoveryComplete = (plan.recovery_guidance || []).some((value) => String(value).trim().length >= 20);
    if (!recoveryComplete) errors.push("quality:recovery_guidance_incomplete");
    const exerciseCoachingComplete = (plan.plan_days || []).every((day) =>
      (day.exercises || []).every((exercise) =>
        String(exercise.coaching_cue || "").trim().length >= 15 &&
        String(exercise.effort_guidance || "").trim().length >= 15
      )
    );
    if (!exerciseCoachingComplete) errors.push("quality:exercise_coaching_incomplete");
    errors.push(...validateCoachingLanguageVariety(plan));
    const unsafeClaim = findUnsafeCoachingClaim(guidanceText);
    if (unsafeClaim) errors.push(`quality:unsafe_coaching_claim:${unsafeClaim}`);
    if (/\b(?:listed|provided)\s+substitut(?:e|es|ion|ions)\b/i.test(guidanceText)) {
      errors.push("quality:unavailable_substitution_reference");
    }
    const internalLanguageViolations = findInternalLanguageViolations(plan);
    for (const violation of internalLanguageViolations) {
      errors.push(`quality:internal_language:${violation.field}:${violation.term}`);
    }
    if (!/\b(stop|pain|substitut|professional|medical)\b/i.test(String(plan.progression_guidance?.if_pain_occurs || ""))) {
      errors.push("quality:pain_response_not_actionable");
    }
    if (normalized.injuries.some((injury) => /neck/i.test(injury))) {
      const neckGuidance = [plan.program_summary?.coaching_rationale, ...(plan.pain_safety_guidance || [])].join(" ");
      if (!/\bneck\b/i.test(neckGuidance) || !/\b(neutral|relaxed|stable)\b/i.test(neckGuidance)) {
        errors.push("quality:neck_neutral_guidance_missing");
      }
      if (!/\b(stop|worsen|spread|numbness|tingling|dizziness)\b/i.test(neckGuidance)) {
        errors.push("quality:neck_stop_guidance_missing");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      policy_version: AI_QUALITY_POLICY_VERSION,
      user_facing_language_policy_version: USER_FACING_LANGUAGE_POLICY_VERSION,
      validation_scope: "ai_controlled_output_only",
      diagnostics: {
        weekly_direct_sets: weeklySets,
        planned_weekly_direct_sets: plannedWeeklySets,
        weekly_training_role_sets: weeklyRoleSets,
        planned_training_role_sets: plannedRoleSets,
        primary_muscle_sets: primaryMuscleSets,
        balance_ratios: {
          chest_back: volumeRatio(primaryMuscleSets.Chest, primaryMuscleSets.Back),
          push_pull: volumeRatio(pushSets, pullSets),
          quadriceps_posterior: volumeRatio(quadricepsSets, posteriorSets)
        },
        focus_additional_sets: Number(coachingStrategy.focus_policy?.planned_additional_sets || 0),
        direct_arm_balance: {
          planned_slots: plannedUpperArmSlots,
          selected_sets: upperBodyDirectArmSets,
          maximum_set_difference: 4
        },
        required_weekly_muscles: [...requiredWeeklyMuscles],
        focus_categories: [...new Set(focusCategories)],
        days: dayDiagnostics,
        selected_slots: selectedBySlot.size
      }
    };
  }

  function sumRoleSets(roleSets, roles) {
    return roles.reduce((sum, role) => sum + Number(roleSets[role] || 0), 0);
  }

  function sameFunctionSignature(exercise) {
    if (!exercise || ["cardio", "core"].includes(exercise.training_role) || ["cardio", "core"].includes(exercise.exercise_type)) return null;
    const role = String(exercise.training_role || "unknown");
    const movement = String(exercise.movement_family || exercise.movement_pattern || "unknown");
    const type = String(exercise.exercise_type || "unknown");
    const substitutionGroup = String(exercise.substitution_group || `${role}:${movement}:${type}`);
    return `${role}|${movement}|${type}|${substitutionGroup}`;
  }

  function volumeRatio(left, right) {
    if (!left || !right) return null;
    return Math.round((Number(left) / Number(right)) * 100) / 100;
  }

  function validateVolumeRatio(left, right, label, errors, minimum = 0.5, maximum = 2) {
    if (!left || !right) return;
    const ratio = Number(left) / Number(right);
    if (ratio < minimum || ratio > maximum) errors.push(`quality:${label}_volume_imbalance:${Math.round(ratio * 100) / 100}`);
  }

  function safeRangeForCandidate(candidate, coachingStrategy) {
    if (candidate.exercise_type === "cardio") return coachingStrategy.safe_training_ranges.cardio;
    if (candidate.exercise_type === "core") return coachingStrategy.safe_training_ranges.core;
    if (candidate.exercise_type === "compound") return coachingStrategy.safe_training_ranges.strength_compound;
    return coachingStrategy.safe_training_ranges.strength_isolation;
  }

  function scoreWorkoutQuality(plan, coachingStrategy, normalized, qualityValidation, baseValidation) {
    const qualityErrors = qualityValidation?.errors || [];
    const baseErrors = baseValidation?.errors || [];
    const diagnostics = qualityValidation?.diagnostics || {};
    const reasons = [];
    const breakdown = {};

    const movementFailures = qualityErrors.filter((error) =>
      error.startsWith("quality:slot_muscle_mismatch") ||
      error.startsWith("quality:training_role_mismatch")
    ).length;
    breakdown.movement_and_muscle_coverage = Math.max(0, 25 - movementFailures * 7);
    if (movementFailures) reasons.push("required_movement_or_muscle_coverage");

    let goalFocus = 0;
    const rationale = String(plan.program_summary?.coaching_rationale || "").toLowerCase();
    if (plan.program_summary?.goal === normalized.goal && rationaleMatchesGoal(rationale, normalized.goal)) goalFocus += 5;
    else reasons.push("goal_rationale_alignment");
    if (rationale.includes(String(normalized.experience || "").toLowerCase())) goalFocus += 4;
    else reasons.push("experience_rationale_alignment");
    if (rationale.includes(`${normalized.days}-day`) || rationale.includes(`${normalized.days} day`) || rationale.includes("schedule")) goalFocus += 4;
    else reasons.push("schedule_rationale_alignment");
    const focusMissing = qualityErrors.some((error) => error.startsWith("quality:focus_area_missing"));
    if (!focusMissing) goalFocus += 7;
    else reasons.push("focus_area_coverage");
    breakdown.goal_and_focus_alignment = goalFocus;

    const injuryFailure = [...qualityErrors, ...baseErrors].some((error) =>
      /injury_conflict|restricted_exercise|high_impact_cardio_for_pain|neck_hard_conflict|neck_stability_preference_missed/.test(error)
    );
    const painFailure = qualityErrors.some((error) => error === "quality:pain_response_not_actionable");
    breakdown.injury_compatibility = (injuryFailure ? 0 : 10) + (painFailure ? 0 : 5);
    if (injuryFailure) reasons.push("injury_compatibility");
    if (painFailure) reasons.push("pain_response_guidance");

    let volume = 0;
    const omittedMuscle = qualityErrors.some((error) => error.startsWith("quality:weekly_muscle_omitted"));
    if (!omittedMuscle) volume += 5;
    else reasons.push("weekly_muscle_coverage");
    const weeklySets = diagnostics.weekly_training_role_sets || {};
    const plannedWeeklySets = diagnostics.planned_training_role_sets || {};
    const volumeRatios = Object.entries(plannedWeeklySets).map(([role, plannedSets]) =>
      Number(weeklySets[role] || 0) / Number(plannedSets || 1)
    );
    const closeToPlan = volumeRatios.every((ratio) => ratio >= 0.75 && ratio <= 1.35);
    const broadlyNearPlan = volumeRatios.every((ratio) => ratio >= 0.6 && ratio <= 1.6);
    if (closeToPlan) volume += 10;
    else if (broadlyNearPlan) {
      volume += 6;
      reasons.push("major_muscle_volume_balance");
    } else {
      reasons.push("major_muscle_volume_balance");
    }
    const balanceFailure = qualityErrors.some((error) => /chest_back_volume_imbalance|push_pull_volume_imbalance|quadriceps_posterior_volume_imbalance|direct_arm_set_imbalance|excessive_single_role_volume/.test(error));
    if (balanceFailure) {
      volume = Math.min(volume, 6);
      reasons.push("canonical_role_volume_balance");
    }
    breakdown.weekly_volume_balance = volume;

    const durationFailure = (baseValidation?.duration_estimates || []).some((estimate) => !estimate.within_limit);
    breakdown.time_feasibility = durationFailure ? 0 : 10;
    if (durationFailure) reasons.push("session_time_feasibility");

    const redundancyFailure = [...qualityErrors, ...baseErrors].some((error) =>
      /same_function_redundancy|excessive_muscle_repetition|excessive_movement_repetition|duplicate_exercise_week|duplicate_missing_reason|duplicate_reason_too_weak|duplicate_exercise_same_day/.test(error)
    );
    breakdown.redundancy_control = redundancyFailure ? 0 : 10;
    if (redundancyFailure) reasons.push("exercise_or_movement_redundancy");

    let coaching = 0;
    const progressionComplete = Object.values(plan.progression_guidance || {}).every(
      (value) => typeof value === "string" && value.trim().length >= 20
    );
    if (progressionComplete) coaching += 2;
    else reasons.push("progression_guidance_depth");
    const recoveryComplete = (plan.recovery_guidance || []).some((value) => String(value).trim().length >= 20);
    if (recoveryComplete) coaching += 1;
    else reasons.push("recovery_guidance_depth");
    const exerciseCoachingComplete = (plan.plan_days || []).every((day) =>
      (day.exercises || []).every((exercise) =>
        String(exercise.coaching_cue || "").trim().length >= 15 &&
        String(exercise.effort_guidance || "").trim().length >= 15
      )
    );
    if (exerciseCoachingComplete) coaching += 2;
    else reasons.push("exercise_coaching_depth");
    breakdown.coaching_completeness = coaching;

    const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    const criticalSafetyPassed = ![...qualityErrors, ...baseErrors].some((error) =>
      /injury_conflict|restricted_exercise|high_impact_cardio_for_pain|neck_hard_conflict|unsafe_coaching_claim|unapproved_substitution_id/.test(error)
    );
    return {
      policy_version: "workout_quality_score_v1",
      score,
      threshold: WORKOUT_QUALITY_SCORE_THRESHOLD,
      passed: criticalSafetyPassed && score >= WORKOUT_QUALITY_SCORE_THRESHOLD,
      critical_safety_passed: criticalSafetyPassed,
      breakdown,
      reasons: [...new Set(reasons)],
      diagnostics: {
        maximum_skeleton_volume_deviation: volumeRatios.length
          ? Math.round(Math.max(...volumeRatios.map((ratio) => Math.abs(1 - ratio))) * 100) / 100
          : 0
      }
    };
  }

  function rationaleMatchesGoal(rationale, goal) {
    const aliases = {
      "Lose Weight": ["lose weight", "weight loss", "fat loss"],
      "Build Muscle": ["build muscle", "muscle growth", "hypertrophy"],
      "Gain Strength": ["gain strength", "strength development", "get stronger"],
      "Improve Fitness": ["improve fitness", "fitness improvement", "general fitness", "conditioning"],
      "Improve Body Shape": ["improve body shape", "body shape", "body composition", "toning"]
    };
    return (aliases[goal] || [String(goal || "").toLowerCase()]).some((phrase) => rationale.includes(phrase));
  }

  function findUnsafeCoachingClaim(text) {
    const patterns = [
      /\b(?:this|the)\s+(?:plan|program|routine|exercise)\s+(?:will\s+)?(?:cure|diagnose|heal|treat|rehabilitate)\b/i,
      /\bguarantee(?:s|d)?\s+(?:a\s+)?(?:cure|recovery|results?|weight loss|fat loss)\b/i,
      /\bmedical cure\b/i,
      /\bpush through (?:the )?pain\b/i,
      /\bno pain no gain\b/i
    ];
    for (const pattern of patterns) {
      const match = String(text || "").match(pattern);
      if (match) return match[0].toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    }
    return null;
  }

  function validateCoachingLanguageVariety(plan) {
    const errors = [];
    const exercises = (plan.plan_days || []).flatMap((day) => day.exercises || []);
    const cues = exercises.map((exercise) => normalizeCoachingText(exercise.coaching_cue)).filter(Boolean);
    const efforts = exercises.map((exercise) => normalizeCoachingText(exercise.effort_guidance)).filter(Boolean);
    if (maximumDuplicateCount(cues) > Math.max(2, Math.ceil(cues.length * 0.25))) {
      errors.push("quality:repetitive_coaching_cues");
    }
    if (maximumDuplicateCount(efforts) > Math.max(2, Math.ceil(efforts.length * 0.4))) {
      errors.push("quality:repetitive_effort_guidance");
    }
    const genericCueCount = cues.filter((cue) => /\b(controlled|smooth|stable)\b/.test(cue)).length;
    if (cues.length >= 6 && genericCueCount > Math.max(3, Math.ceil(cues.length * 0.45))) {
      errors.push("quality:generic_cue_wording_overused");
    }
    const repeatTokens = coachingContentTokens(plan.repeat_instruction);
    for (const recovery of plan.recovery_guidance || []) {
      const recoveryTokens = coachingContentTokens(recovery);
      const shared = recoveryTokens.filter((token) => repeatTokens.includes(token));
      const overlap = recoveryTokens.length ? shared.length / recoveryTokens.length : 0;
      if (/\brepeat\b.*\b(?:4|four)\s*-?\s*weeks?\b/i.test(recovery) || overlap >= 0.65) {
        errors.push("quality:recovery_repeats_program_instruction");
        break;
      }
    }
    const recoveryItems = (plan.recovery_guidance || []).map(normalizeCoachingText).filter(Boolean);
    if (maximumDuplicateCount(recoveryItems) > 1) errors.push("quality:repetitive_recovery_guidance");
    return errors;
  }

  function normalizeCoachingText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function maximumDuplicateCount(values) {
    return Math.max(0, ...Object.values(countValues(values)));
  }

  function coachingContentTokens(value) {
    const ignored = new Set(["a", "an", "and", "as", "at", "be", "for", "from", "in", "is", "it", "of", "on", "or", "the", "this", "to", "with", "your"]);
    return [...new Set(normalizeCoachingText(value).split(" ").filter((token) => token.length > 2 && !ignored.has(token)))];
  }

  function findInternalLanguageViolations(plan) {
    const fields = [
      ["coaching_rationale", plan?.program_summary?.coaching_rationale],
      ["repeat_instruction", plan?.repeat_instruction],
      ...Object.entries(plan?.progression_guidance || {}).map(([key, value]) => [`progression_${key}`, value]),
      ...(plan?.recovery_guidance || []).map((value, index) => [`recovery_${index + 1}`, value]),
      ...(plan?.pain_safety_guidance || []).map((value, index) => [`safety_${index + 1}`, value])
    ];

    for (const day of plan?.plan_days || []) {
      for (const exercise of day.exercises || []) {
        fields.push([`cue_${exercise.slot_id}`, exercise.coaching_cue]);
        fields.push([`effort_${exercise.slot_id}`, exercise.effort_guidance]);
        if (exercise.exercise_category === "cardio") fields.push([`cardio_notes_${exercise.slot_id}`, exercise.notes]);
      }
    }

    const terms = [
      ["backend", /\bback[ -]?end\b/i],
      ["candidate_pool", /\bcandidate\s+pool\b/i],
      ["catalog", /\bcatalog(?:ue)?\b/i],
      ["injury_flags", /\binjury\s+flags?\b/i],
      ["validation", /\bvalidation\b/i],
      ["schema", /\bschema\b/i],
      ["approved_id", /\bapproved\s+(?:exercise\s+)?ids?\b/i],
      ["slot_id", /\bslot\s+ids?\b/i]
    ];
    const violations = [];
    for (const [field, value] of fields) {
      for (const [term, pattern] of terms) {
        if (pattern.test(String(value || ""))) violations.push({ field, term });
      }
    }
    return violations;
  }

  function normalizeWorkoutDuplicateSelections(plan, candidateMap) {
    if (!plan || !Array.isArray(plan.plan_days)) return plan;
    const usedExerciseIds = new Set();

    for (const day of plan.plan_days) {
      const usedOnDay = new Set();
      for (const exercise of day.exercises || []) {
        let exerciseId = Number(exercise.exercise_id);
        const candidates = candidateMap[exercise.slot_id] || [];
        const selected = candidates.find((candidate) => Number(candidate.exercise_id) === exerciseId);
        const repeated = usedExerciseIds.has(exerciseId) || usedOnDay.has(exerciseId);
        const cardio = exercise.exercise_category === "cardio" || selected?.exercise_type === "cardio";

        if (repeated && !cardio) {
          const replacement = candidates.find((candidate) => {
            const candidateId = Number(candidate.exercise_id);
            return !usedExerciseIds.has(candidateId) && !usedOnDay.has(candidateId);
          });
          if (replacement) {
            exerciseId = Number(replacement.exercise_id);
            exercise.exercise_id = exerciseId;
            exercise.exercise_name = exerciseDisplayName(replacement);
            exercise.exercise_category = isCardioExercise(replacement) ? "cardio" : "strength";
            exercise.movement_pattern = String(replacement.movement_pattern || replacement.movement_family || exercise.movement_pattern || "");
            exercise.muscle_group = String(replacement.category || exercise.muscle_group || "");
            exercise.substitution_ids = [];
            exercise.duplicate_reason = null;
          } else {
            exercise.duplicate_reason = "Repeated because this slot has no unused approved alternative.";
          }
        } else if (repeated && cardio) {
          exercise.duplicate_reason = "Repeated intentionally to keep cardio setup and progression consistent across the week.";
        } else {
          exercise.duplicate_reason = null;
        }

        usedExerciseIds.add(exerciseId);
        usedOnDay.add(exerciseId);
      }
    }
    return plan;
  }

  function parseNumericRange(value) {
    const values = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!values.length) return null;
    return values.length === 1 ? [values[0], values[0]] : [values[0], values[1]];
  }

  function countValues(values) {
    return values.reduce((counts, value) => {
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  function estimateWorkoutDayDuration(day, skeleton, candidateMap, normalized) {
    const allSlots = skeleton.flatMap((item) => item.slots);
    const breakdown = [];
    let totalSeconds = 0;
    let previousCandidate = null;

    for (const exercise of day.exercises || []) {
      const slot = allSlots.find((item) => item.slot_id === exercise.slot_id);
      const candidate = (candidateMap[exercise.slot_id] || []).find(
        (item) => Number(item.exercise_id) === Number(exercise.exercise_id)
      );
      if (!slot || !candidate) continue;

      const transitionSetupSeconds = previousCandidate
        ? equipmentTransitionSeconds(previousCandidate, candidate)
        : initialSetupSeconds(candidate);
      const cardioSeconds = slot.exercise_type === "cardio" ? parseDurationMinutes(exercise.reps) * 60 : 0;
      const executionSeconds = slot.exercise_type === "cardio"
        ? 0
        : Number(exercise.sets || 0) * setExecutionSeconds(slot, normalized) * Number(candidate.time_multiplier || 1);
      const restSeconds = slot.exercise_type === "cardio"
        ? 0
        : Math.max(0, Number(exercise.sets || 0) - 1) * parseRestSeconds(exercise.rest);
      const exerciseSeconds = transitionSetupSeconds + cardioSeconds + executionSeconds + restSeconds;
      totalSeconds += exerciseSeconds;
      breakdown.push({
        slot_id: exercise.slot_id,
        exercise_id: Number(exercise.exercise_id),
        transition_setup_seconds: transitionSetupSeconds,
        execution_seconds: executionSeconds,
        time_multiplier: Number(candidate.time_multiplier || 1),
        rest_seconds: restSeconds,
        cardio_seconds: cardioSeconds,
        total_seconds: exerciseSeconds
      });
      previousCandidate = candidate;
    }

    const estimatedMinutes = roundOne(totalSeconds / 60);
    const maximumMinutes = roundOne(normalized.duration_minutes * SESSION_DURATION_TOLERANCE);
    return {
      day_index: Number(day.day_index),
      selected_minutes: normalized.duration_minutes,
      estimated_minutes: estimatedMinutes,
      maximum_minutes: maximumMinutes,
      within_limit: estimatedMinutes <= maximumMinutes,
      breakdown
    };
  }

  function parseRestSeconds(value) {
    const match = String(value || "").match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function parseDurationMinutes(value) {
    const values = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!values.length) return 0;
    return values.reduce((sum, item) => sum + item, 0) / values.length;
  }

  function initialSetupSeconds(exercise) {
    const family = primaryEquipmentFamily(exercise);
    if (family === "barbell") return 90;
    if (["cable", "machine", "cardio_machine"].includes(family)) return 60;
    return 45;
  }

  function equipmentTransitionSeconds(previousExercise, nextExercise) {
    const previous = primaryEquipmentFamily(previousExercise);
    const next = primaryEquipmentFamily(nextExercise);
    if (previous === next) return previous === "barbell" ? 60 : 30;
    if (previous === "barbell" || next === "barbell") return 90;
    return 60;
  }

  function primaryEquipmentFamily(exercise) {
    const equipment = (exercise?.equipment || []).map(normalizeEquipmentName);
    if (equipment.some((item) => item === "barbell")) return "barbell";
    if (equipment.some((item) => item === "dumbbell" || item === "kettlebell")) return "free_weight";
    if (equipment.some((item) => item === "cable")) return "cable";
    if (equipment.some((item) => item === "machine")) return "machine";
    if (equipment.some((item) => ["treadmill", "bike", "elliptical", "rower", "stepmill"].includes(item))) return "cardio_machine";
    if (equipment.some((item) => item === "band")) return "band";
    return "bodyweight";
  }

  function roundOne(value) {
    return Math.round(value * 10) / 10;
  }

  function exerciseCountRange(durationMinutes) {
    if (durationMinutes <= 30) return { min: 3, max: 5 };
    if (durationMinutes <= 45) return { min: 4, max: 6 };
    return { min: 5, max: 8 };
  }

  function exerciseOrderRank(slot, exercise) {
    if (slot?.exercise_type === "cardio" || exercise.exercise_category === "cardio") return 4;
    if (slot?.exercise_type === "core" || exercise.muscle_group === "Core") return 3;
    if (slot?.exercise_type === "isolation") return 2;
    return 1;
  }

  function validateDayBalance(day, allSlots, errors, normalized) {
    const slots = day.exercises.map((exercise) => allSlots.find((slot) => slot.slot_id === exercise.slot_id)).filter(Boolean);
    const resistanceSlots = slots.filter((slot) => slot.exercise_type !== "cardio");
    const patterns = new Set(slots.map((slot) => slot.movement_pattern));
    const groups = new Set(day.exercises.map((exercise) => String(exercise.muscle_group || "")));

    if (day.day_name.includes("Lower") || day.day_name.includes("Legs")) {
      for (const exercise of day.exercises) {
        const slot = allSlots.find((item) => item.slot_id === exercise.slot_id);
        if (slot?.exercise_type !== "cardio" && !["Legs", "Core"].includes(String(exercise.muscle_group || ""))) {
          errors.push(`lower_forbidden_muscle_group:${day.day_index}:${exercise.slot_id}:${exercise.muscle_group}`);
        }
      }
      if (!patterns.has("squat") && !patterns.has("lunge") && !patterns.has("hip_extension")) errors.push(`lower_missing_knee_dominant:${day.day_index}`);
      const roles = new Set(slots.map((slot) => slot.training_role).filter(Boolean));
      if (!patterns.has("hinge") && !roles.has("hip_dominant") && !roles.has("hamstring_isolation")) {
        errors.push(`lower_missing_hip_dominant:${day.day_index}`);
      }
      const coreSlots = slots.filter((slot) => slot.exercise_type === "core").length;
      const legSlots = slots.filter((slot) => slot.muscle_group === "Legs").length;
      if (coreSlots >= legSlots) errors.push(`lower_too_core_heavy:${day.day_index}`);
    }

    if (day.day_name.includes("Upper")) {
      if (!groups.has("Chest") && !groups.has("Shoulders")) errors.push(`upper_missing_push:${day.day_index}`);
      if (!groups.has("Back")) errors.push(`upper_missing_pull:${day.day_index}`);
      if (resistanceSlots.length >= 5 && supportsDirectArmWork(normalized) && !groups.has("Triceps") && !groups.has("Biceps")) {
        errors.push(`upper_missing_arm_accessory:${day.day_index}`);
      }
    }
  }

  function normalizeNoneList(values = []) {
    return values.filter((item) => item && item !== "None");
  }

  function normalizeInjuryTags(values = []) {
    return normalizeNoneList(values).map((item) => {
      const text = String(item).toLowerCase();
      if (text.includes("lower") && text.includes("back")) return "Lower back";
      if (text.includes("knee")) return "Knee";
      if (text.includes("shoulder")) return "Shoulder";
      if (text.includes("wrist") || text.includes("elbow")) return "Wrist";
      if (text.includes("neck")) return "Neck";
      return item;
    });
  }

  function normalizeDislikedExercises(values = []) {
    return values
      .map((item) => item?.name || item?.label || item?.exercise_name || item)
      .filter(Boolean)
      .map(String);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  const api = {
    generateWorkoutPlan,
    generateWorkoutPlanV2,
    generateWorkoutPlanV3,
    normalizeWorkoutInput,
    buildWorkoutCoachingStrategy,
    validateWorkoutCoachingStrategy,
    buildWorkoutSkeleton,
    buildFourWeekWorkoutSkeleton,
    filterCandidatesForSkeleton,
    validateWorkoutCandidateCoverage,
    selectWorkoutExercises,
    validateWorkoutPlan,
    validateWorkoutPlanV2,
    validateWorkoutPlanV3,
    validateWorkoutQuality,
    scoreWorkoutQuality,
    findInternalLanguageViolations,
    normalizeWorkoutDuplicateSelections,
    readableSplit,
    estimateWorkoutDayDuration,
    buildFallbackWorkoutPlan,
    buildFallbackWorkoutPlanV2,
    buildFallbackWorkoutPlanV3
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.FitnetWorkoutEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
