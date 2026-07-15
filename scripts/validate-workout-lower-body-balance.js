const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV3,
  validateWorkoutQuality,
  validateWorkoutCoachingStrategy
} = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const scenarios = [];
let minimumRatio = Infinity;
let maximumRatio = 0;

for (const days of [2, 3, 4, 5, 6]) {
  for (const duration of [30, 45, 60, 75]) {
    for (const place of ["Home", "Building Gym", "Full Equipment Gym"]) {
      for (const focus of ["Full Body", "Legs", "Glutes"]) {
        const generated = generate(days, duration, place, focus);
        const label = `${days}/${duration}/${place}/${focus}`;
        assert(generated.validation.valid, `${label}: ${generated.validation.errors.join(", ")}`);
        const policy = generated.coaching_strategy.lower_body_balance_policy;
        assert(policy?.policy_version === "workout_lower_body_balance_v1", `${label}: policy version missing`);
        assert(policy.planned_ratio >= 0.8 && policy.planned_ratio <= 1.25, `${label}: backend ratio ${policy.planned_ratio}`);
        const ratio = generated.validation.quality_validation.diagnostics.balance_ratios.quadriceps_posterior;
        assert(ratio >= 0.8 && ratio <= 1.25, `${label}: generated ratio ${ratio}`);
        assert(generated.skeleton.every((day) => day.slots.length === Number(generated.coaching_strategy.session_budget.target_exercises)), `${label}: exercise count changed`);
        minimumRatio = Math.min(minimumRatio, ratio);
        maximumRatio = Math.max(maximumRatio, ratio);
        scenarios.push({ days, duration, place, focus, ratio });
      }
    }
  }
}

const baseline = generate(4, 60, "Full Equipment Gym", "Full Body");
const malformedPlan = clone(baseline.plan);
for (const day of malformedPlan.plan_days) {
  for (const exercise of day.exercises) {
    const candidate = selectedCandidate(baseline, exercise);
    if (["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"].includes(candidate?.training_role)) exercise.sets = 5;
    if (["hip_dominant", "hamstring_isolation"].includes(candidate?.training_role)) exercise.sets = 2;
  }
}
const malformedQuality = validateWorkoutQuality(malformedPlan, baseline.coaching_strategy, baseline.skeleton, baseline.candidate_map, baseline.normalized_input);
assert(malformedQuality.errors.some((error) => error.startsWith("quality:quadriceps_posterior_volume_imbalance:")), "AI-controlled lower-body imbalance was not rejected");

const malformedSkeleton = clone(baseline.skeleton);
for (const slot of malformedSkeleton.flatMap((day) => day.slots)) {
  if (["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"].includes(slot.training_role)) slot.sets = 5;
  if (["hip_dominant", "hamstring_isolation"].includes(slot.training_role)) slot.sets = 1;
}
const malformedStrategy = validateWorkoutCoachingStrategy(baseline.coaching_strategy, malformedSkeleton);
assert(malformedStrategy.errors.some((error) => error.startsWith("strategy:quadriceps_posterior_set_imbalance:")), "Backend lower-body imbalance was not rejected");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_lower_body_balance_v1",
  scenarios_checked: scenarios.length,
  ratio_bounds: [0.8, 1.25],
  observed_ratio_range: [minimumRatio, maximumRatio],
  counted_roles: {
    quadriceps: ["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"],
    posterior: ["hip_dominant", "hamstring_isolation"]
  },
  exercise_counts_unchanged: true,
  focus_modes_checked: ["Full Body", "Legs", "Glutes"],
  rejection_cases: ["backend_imbalance", "ai_output_imbalance"]
}, null, 2));

function generate(days, duration, place, focus) {
  return generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: { days: String(days), duration: `${duration} minutes`, place, split: "Auto", focusAreas: [focus], equipment: [], injuries: ["None"] }
  }, exercises);
}

function selectedCandidate(generated, exercise) {
  return (generated.candidate_map[exercise.slot_id] || []).find((candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
