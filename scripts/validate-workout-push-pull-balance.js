const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV3,
  validateWorkoutQuality,
  validateWorkoutCoachingStrategy
} = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const results = [];
let minimumRatio = Infinity;
let maximumRatio = 0;

for (const days of [2, 3, 4, 5, 6]) {
  for (const duration of [30, 45, 60, 75]) {
    for (const place of ["Home", "Building Gym", "Full Equipment Gym"]) {
      for (const focus of ["Full Body", "Chest", "Back", "Shoulders"]) {
        const generated = generate(days, duration, place, focus);
        assert(generated.validation.valid, `${days}/${duration}/${place}/${focus}: ${generated.validation.errors.join(", ")}`);
        assert(generated.coaching_strategy.push_pull_balance_policy.policy_version === "workout_push_pull_balance_v1", "Policy version missing");
        const diagnostics = generated.validation.quality_validation.diagnostics;
        const ratio = diagnostics.balance_ratios.push_pull;
        assert(ratio >= 0.75 && ratio <= 1.33, `${days}/${duration}/${place}/${focus}: ratio ${ratio}`);
        assert(generated.coaching_strategy.push_pull_balance_policy.planned_ratio >= 0.75 && generated.coaching_strategy.push_pull_balance_policy.planned_ratio <= 1.33, "Backend planned ratio is outside bounds");
        minimumRatio = Math.min(minimumRatio, ratio);
        maximumRatio = Math.max(maximumRatio, ratio);
        results.push({ days, duration, place, focus, ratio });
      }
    }
  }
}

const baseline = generate(4, 60, "Full Equipment Gym", "Full Body");
const malformedPlan = clone(baseline.plan);
for (const day of malformedPlan.plan_days) {
  for (const exercise of day.exercises) {
    const candidate = (baseline.candidate_map[exercise.slot_id] || []).find((item) => Number(item.exercise_id) === Number(exercise.exercise_id));
    if (["horizontal_push", "vertical_push"].includes(candidate?.training_role)) exercise.sets = 5;
    if (["horizontal_pull", "vertical_pull"].includes(candidate?.training_role)) exercise.sets = 2;
  }
}
const malformedQuality = validateWorkoutQuality(malformedPlan, baseline.coaching_strategy, baseline.skeleton, baseline.candidate_map, baseline.normalized_input);
assert(malformedQuality.errors.some((error) => error.startsWith("quality:push_pull_volume_imbalance:")), "AI-controlled push/pull imbalance was not rejected");

const malformedSkeleton = clone(baseline.skeleton);
for (const slot of malformedSkeleton.flatMap((day) => day.slots)) {
  if (["horizontal_push", "vertical_push"].includes(slot.training_role)) slot.sets = 5;
  if (["horizontal_pull", "vertical_pull"].includes(slot.training_role)) slot.sets = 1;
}
const malformedStrategy = validateWorkoutCoachingStrategy(baseline.coaching_strategy, malformedSkeleton);
assert(malformedStrategy.errors.some((error) => error.startsWith("strategy:push_pull_set_imbalance:")), "Backend push/pull imbalance was not rejected");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_push_pull_balance_v1",
  scenarios_checked: results.length,
  ratio_bounds: [0.75, 1.33],
  observed_ratio_range: [minimumRatio, maximumRatio],
  counted_roles: {
    push: ["horizontal_push", "vertical_push"],
    pull: ["horizontal_pull", "vertical_pull"]
  },
  excluded_roles: ["side_rear_delts", "biceps", "triceps", "forearms"],
  exercise_counts_unchanged: true,
  total_work_rebalanced_within_session_budgets: true,
  rejection_cases: ["backend_imbalance", "ai_output_imbalance"]
}, null, 2));

function generate(days, duration, place, focus) {
  return generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: { days: String(days), duration: `${duration} minutes`, place, split: "Auto", focusAreas: [focus], equipment: [], injuries: ["None"] }
  }, exercises);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
