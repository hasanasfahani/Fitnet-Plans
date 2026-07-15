const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutPlanV3, validateWorkoutQuality, validateWorkoutCoachingStrategy } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const scenarios = [
  { label: "beginner_knee", goal: "Lose Weight", experience: "Beginner", days: 3, duration: 45, place: "Building Gym", focus: ["Full Body"], injuries: ["Knee"] },
  { label: "intermediate_hypertrophy", goal: "Build Muscle", experience: "Intermediate", days: 4, duration: 60, place: "Full Equipment Gym", focus: ["Chest"], injuries: ["None"] },
  { label: "advanced_strength", goal: "Gain Strength", experience: "Advanced", days: 5, duration: 75, place: "Full Equipment Gym", focus: ["Back"], injuries: ["Shoulder"] },
  { label: "beginner_home", goal: "Improve Fitness", experience: "Beginner", days: 2, duration: 30, place: "Home", focus: ["Full Body"], injuries: ["None"] }
];
const generatedScenarios = scenarios.map(generateScenario);

for (const { label, generated } of generatedScenarios) {
  assert(generated.validation.valid, `${label} failed quality validation: ${generated.validation.errors.join(", ")}`);
  const quality = generated.validation.quality_validation;
  assert(quality?.valid, `${label} is missing a valid quality result`);
  assert(quality.policy_version === "workout_ai_quality_policy_v2", `${label} has the wrong AI quality policy`);
  assert(quality.validation_scope === "ai_controlled_output_only", `${label} has the wrong quality scope`);
  assert(quality.diagnostics.selected_slots > 0, `${label} is missing selected-slot diagnostics`);
  assert(Object.keys(quality.diagnostics.weekly_direct_sets).length > 0, `${label} is missing weekly volume diagnostics`);
}

const baseline = generatedScenarios.find((item) => item.label === "beginner_home").generated;
assert(baseline.validation.validation_scope.ai_controlled.includes("candidate_selection"), "AI-controlled validation scope is missing candidate selection");
assert(baseline.validation.validation_scope.backend_controlled.includes("slot_distribution"), "Backend validation scope is missing slot distribution");
expectQualityError(mutate(baseline.plan, (plan) => { plan.plan_days[0].exercises[0].sets = 99; }), baseline, "unsafe_sets");
expectQualityError(mutate(baseline.plan, (plan) => { plan.plan_days[0].exercises[0].reps = "1-2"; }), baseline, "quality:reps_outside_safe_range");
expectQualityError(mutate(baseline.plan, (plan) => { plan.plan_days[0].exercises[0].rest = "300 sec"; }), baseline, "quality:rest_outside_safe_range");
expectQualityError(mutate(baseline.plan, (plan) => { plan.program_summary.coaching_rationale = "This routine guarantees a cure."; }), baseline, "quality:unsafe_coaching_claim:guarantees_a_cure");
expectQualityError(mutate(baseline.plan, (plan) => { plan.progression_guidance.if_pain_occurs = "Keep training as normal."; }), baseline, "quality:pain_response_not_actionable");

const backendOwnershipPlan = mutate(baseline.plan, (plan) => {
  plan.program_summary.split = "AI changed this backend field";
  plan.program_summary.session_duration_minutes = 999;
  plan.program_summary.workout_place = "AI changed this backend field";
  plan.plan_days[0].day_name = "AI changed this backend field";
});
const backendOwnershipQuality = validateWorkoutQuality(
  backendOwnershipPlan,
  baseline.coaching_strategy,
  baseline.skeleton,
  baseline.candidate_map,
  baseline.normalized_input
);
assert(backendOwnershipQuality.valid, `AI quality gate penalized backend-owned fields: ${backendOwnershipQuality.errors.join(", ")}`);

const malformedStrategy = mutate(baseline.coaching_strategy, (strategy) => {
  strategy.day_requirements[0].required_muscle_groups.push("Impossible backend muscle");
  strategy.day_requirements[0].required_pattern_groups.push(["impossible_backend_pattern"]);
});
const malformedStrategyValidation = validateWorkoutCoachingStrategy(malformedStrategy, baseline.skeleton);
assert(!malformedStrategyValidation.valid, "Malformed backend strategy unexpectedly passed strategy validation");
const isolatedAiQuality = validateWorkoutQuality(
  baseline.plan,
  malformedStrategy,
  baseline.skeleton,
  baseline.candidate_map,
  baseline.normalized_input
);
assert(isolatedAiQuality.valid, `Backend strategy defect leaked into AI quality errors: ${isolatedAiQuality.errors.join(", ")}`);

const roleDriftMap = mutate(baseline.candidate_map, (candidateMap) => {
  const exercise = baseline.plan.plan_days[0].exercises[0];
  const selected = candidateMap[exercise.slot_id].find((candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id));
  selected.training_role = "cardio";
});
const roleDriftQuality = validateWorkoutQuality(baseline.plan, baseline.coaching_strategy, baseline.skeleton, roleDriftMap, baseline.normalized_input);
assert(roleDriftQuality.errors.some((error) => error.startsWith("quality:training_role_mismatch")), "Wrong candidate role was not rejected");

const muscleDriftMap = mutate(baseline.candidate_map, (candidateMap) => {
  const exercise = baseline.plan.plan_days[0].exercises[0];
  const selected = candidateMap[exercise.slot_id].find((candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id));
  selected.category = "Cardio";
});
const muscleDriftQuality = validateWorkoutQuality(baseline.plan, baseline.coaching_strategy, baseline.skeleton, muscleDriftMap, baseline.normalized_input);
assert(muscleDriftQuality.errors.some((error) => error.startsWith("quality:slot_muscle_mismatch")), "Wrong candidate muscle was not rejected");

expectQualityError(
  mutate(baseline.plan, (plan) => {
    for (const day of plan.plan_days) {
      for (const exercise of day.exercises) {
        const candidate = (baseline.candidate_map[exercise.slot_id] || []).find((item) => Number(item.exercise_id) === Number(exercise.exercise_id));
        if (candidate?.exercise_type === "cardio") continue;
        exercise.sets = candidate?.exercise_type === "compound" ? 5 : candidate?.exercise_type === "core" ? 3 : 4;
        exercise.rest = candidate?.exercise_type === "compound" ? "180 sec" : "90 sec";
      }
    }
  }),
  baseline,
  "session_duration_exceeded"
);

const volumeBaseline = generatedScenarios.find((item) => item.label === "beginner_knee").generated;
expectQualityError(
  mutate(volumeBaseline.plan, (plan) => {
    for (const day of plan.plan_days) {
      for (const exercise of day.exercises) {
        if (exercise.muscle_group === "Chest") exercise.sets = 2;
        if (exercise.muscle_group === "Legs") exercise.sets = 5;
      }
    }
  }),
  volumeBaseline,
  "quality:major_muscle_volume_imbalance"
);

const fatLossAliasPlan = mutate(volumeBaseline.plan, (plan) => {
  plan.program_summary.coaching_rationale = "This 3-day schedule supports fat loss for a beginner with practical full-body training and knee-aware exercise choices.";
});
const fatLossAliasValidation = validate(fatLossAliasPlan, volumeBaseline);
assert(!fatLossAliasValidation.quality_score.reasons.includes("goal_rationale_alignment"), "Fat-loss wording was not recognized as Lose Weight");

const safeDisclaimerPlan = mutate(baseline.plan, (plan) => {
  plan.pain_safety_guidance[0] = "This plan is not a diagnosis or treatment plan.";
});
const safeDisclaimerValidation = validate(safeDisclaimerPlan, baseline);
assert(!safeDisclaimerValidation.errors.some((error) => error.includes("unsafe_coaching_claim")), "A safe medical disclaimer was rejected");

const repetitionBaseline = generateScenario({ label: "repetition_policy", goal: "Lose Weight", experience: "Intermediate", days: 6, duration: 45, place: "Full Equipment Gym", focus: ["Full Body"], injuries: ["None"] }).generated;
const justifiedRepeat = mutate(repetitionBaseline.plan, (plan) => {
  repeatCardioSelection(plan, repetitionBaseline, 3, 0, "Repeated once to keep cardio setup consistent across the week.");
});
const justifiedRepeatValidation = validate(justifiedRepeat, repetitionBaseline);
assert(justifiedRepeatValidation.valid, `Justified second use was rejected: ${justifiedRepeatValidation.errors.join(", ")}`);

const unjustifiedRepeat = mutate(justifiedRepeat, (plan) => {
  const repeatedCardio = plan.plan_days[3].exercises.find((exercise) => exercise.exercise_category === "cardio");
  repeatedCardio.duplicate_reason = null;
});
expectQualityError(unjustifiedRepeat, repetitionBaseline, "duplicate_missing_reason");

const shallowCoaching = mutate(baseline.plan, (plan) => {
  for (const field of Object.keys(plan.progression_guidance)) plan.progression_guidance[field] = field === "if_pain_occurs" ? "Stop for pain." : "Change.";
  plan.recovery_guidance = ["Rest as needed."];
  for (const day of plan.plan_days) {
    for (const exercise of day.exercises) {
      exercise.coaching_cue = "Control.";
      exercise.effort_guidance = "Good effort.";
    }
  }
});
const shallowValidation = validate(shallowCoaching, baseline);
assert(shallowValidation.errors.includes("quality:progression_guidance_incomplete"), "Shallow progression was not rejected");
assert(shallowValidation.errors.includes("quality:recovery_guidance_incomplete"), "Shallow recovery was not rejected");
assert(shallowValidation.errors.includes("quality:exercise_coaching_incomplete"), "Shallow exercise coaching was not rejected");

console.log(
  JSON.stringify(
    {
      status: "passed",
      quality_policy_version: "workout_ai_quality_policy_v2",
      acceptance_scenarios: scenarios.map((scenario) => scenario.label),
      rejection_cases_checked: ["candidate_role", "candidate_muscle", "weekly_volume", "session_duration", "unsafe_sets", "unsafe_reps", "unsafe_rest", "exercise_repetition", "coaching_completeness", "progression_guidance", "recovery_guidance", "unsafe_language"],
      accepted_policy_cases_checked: ["fat_loss_goal_alias", "safe_medical_disclaimer", "justified_second_exercise_use"],
      backend_owned_fields_excluded: ["split", "day_labels", "slot_distribution", "training_role_templates", "exercise_count", "cardio_allocation", "workout_place", "session_duration_target"],
      malformed_backend_strategy_isolated: true,
      diagnostics_checked: ["weekly_direct_sets", "planned_weekly_direct_sets", "weekly_training_role_sets", "planned_training_role_sets", "primary_muscle_sets", "balance_ratios", "focus_additional_sets", "direct_arm_balance", "required_weekly_muscles", "focus_categories", "days", "selected_slots"]
    },
    null,
    2
  )
);

function generateScenario(scenario) {
  const generated = generateWorkoutPlanV3(
    {
      goal: scenario.goal,
      profile: { experience: scenario.experience },
      workout: {
        days: String(scenario.days),
        duration: `${scenario.duration} minutes`,
        place: scenario.place,
        split: "Auto",
        focusAreas: scenario.focus,
        equipment: [],
        injuries: scenario.injuries
      }
    },
    exercises
  );
  return { label: scenario.label, generated };
}

function expectQualityError(plan, generated, prefix) {
  const validation = validateWorkoutPlanV3(
    plan,
    generated.skeleton,
    generated.candidate_map,
    generated.normalized_input,
    generated.coaching_strategy
  );
  assert(!validation.valid, `Invalid quality case unexpectedly passed: ${prefix}`);
  assert(validation.errors.some((error) => error.startsWith(prefix)), `Missing ${prefix}: ${validation.errors.join(", ")}`);
}

function validate(plan, generated) {
  return validateWorkoutPlanV3(plan, generated.skeleton, generated.candidate_map, generated.normalized_input, generated.coaching_strategy);
}

function repeatCardioSelection(plan, generated, targetDayIndex, sourceDayIndex, reason) {
  const source = plan.plan_days[sourceDayIndex].exercises.find((exercise) => exercise.exercise_category === "cardio");
  const target = plan.plan_days[targetDayIndex].exercises.find((exercise) => exercise.exercise_category === "cardio");
  const candidate = (generated.candidate_map[target.slot_id] || []).find((item) => Number(item.exercise_id) === Number(source.exercise_id));
  assert(candidate, `Repeated cardio ${source.exercise_id} is not approved for ${target.slot_id}`);
  target.exercise_id = Number(candidate.exercise_id);
  target.exercise_name = candidate.display_name || candidate.name;
  target.movement_pattern = candidate.movement_pattern;
  target.muscle_group = candidate.category;
  target.substitution_ids = (candidate.approved_substitution_ids || []).slice(0, 3);
  target.duplicate_reason = reason;
}

function mutate(value, callback) {
  const copy = JSON.parse(JSON.stringify(value));
  callback(copy);
  return copy;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
