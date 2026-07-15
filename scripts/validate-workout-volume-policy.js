const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutQuality } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const referenceResults = [];

for (const days of [2, 3, 4, 5, 6]) {
  const generated = generate({ days, focusAreas: ["Full Body"] });
  assert(generated.validation.valid, `${days}-day reference failed: ${generated.validation.errors.join(", ")}`);
  assertDiagnostics(generated, `${days}-day reference`);
  referenceResults.push({
    days,
    role_sets: generated.validation.quality_validation.diagnostics.weekly_training_role_sets,
    ratios: generated.validation.quality_validation.diagnostics.balance_ratios
  });
}

const baseline = generate({ days: 4, focusAreas: ["Full Body"] });
const baselineRoles = roleSequence(baseline.skeleton);
const focusResults = [];
for (const focus of ["Chest", "Back", "Shoulders", "Arms", "Core", "Legs", "Glutes"]) {
  const generated = generate({ days: 4, focusAreas: [focus] });
  assert(generated.validation.valid, `${focus} focus failed: ${generated.validation.errors.join(", ")}`);
  assert(roleSequence(generated.skeleton) === baselineRoles, `${focus} focus replaced required or optional roles`);
  const additionalSets = Number(generated.coaching_strategy.focus_policy.planned_additional_sets || 0);
  assert(additionalSets >= 1 && additionalSets <= 4, `${focus} focus has invalid additional sets: ${additionalSets}`);
  assertDiagnostics(generated, `${focus} focus`);
  focusResults.push({ focus, additional_sets: additionalSets });
}

const imbalancedPlan = clone(baseline.plan);
for (const day of imbalancedPlan.plan_days) {
  for (const exercise of day.exercises) {
    const candidate = selectedCandidate(baseline, exercise);
    if (["horizontal_push", "vertical_push"].includes(candidate?.training_role)) exercise.sets = 8;
    if (["horizontal_pull", "vertical_pull"].includes(candidate?.training_role)) exercise.sets = 1;
  }
}
const imbalance = quality(imbalancedPlan, baseline);
assert(imbalance.errors.some((error) => error.startsWith("quality:push_pull_volume_imbalance")), "Push/pull imbalance was not rejected");
assert(imbalance.errors.includes("quality:training_role_volume_outside_plan"), "Role-volume deviation was not rejected");

const omittedPlan = clone(baseline.plan);
for (const day of omittedPlan.plan_days) {
  day.exercises = day.exercises.filter((exercise) => selectedCandidate(baseline, exercise)?.training_role !== "triceps");
}
const omitted = quality(omittedPlan, baseline);
assert(omitted.errors.includes("quality:planned_role_omitted:triceps"), "Missing arm function was not rejected");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_volume_policy_v1",
  reference_schedules: referenceResults,
  focus_scenarios: focusResults,
  maximum_focus_additional_sets: 4,
  balance_ranges: {
    chest_back: [0.5, 2],
    push_pull: [0.75, 1.33],
    quadriceps_posterior: [0.75, 1.4],
    role_vs_backend_plan: [0.6, 1.6]
  },
  rejection_cases: ["push_pull_imbalance", "role_volume_outside_plan", "planned_role_omitted"]
}, null, 2));

function generate({ days, focusAreas }) {
  return generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: {
      days: String(days),
      duration: "60 minutes",
      place: "Full Equipment Gym",
      split: "Auto",
      focusAreas,
      equipment: [],
      injuries: ["None"]
    }
  }, exercises);
}

function assertDiagnostics(generated, label) {
  const diagnostics = generated.validation.quality_validation?.diagnostics;
  assert(diagnostics && Object.keys(diagnostics.weekly_training_role_sets).length, `${label} is missing role-set diagnostics`);
  assert(Object.keys(diagnostics.primary_muscle_sets).length, `${label} is missing primary-muscle diagnostics`);
  for (const [name, ratio] of Object.entries(diagnostics.balance_ratios)) {
    const bounds = name === "push_pull"
      ? [0.75, 1.33]
      : name === "quadriceps_posterior"
      ? [0.75, 1.4]
      : [0.5, 2];
    if (ratio !== null) assert(ratio >= bounds[0] && ratio <= bounds[1], `${label} ${name} ratio is outside bounds: ${ratio}`);
  }
}

function selectedCandidate(generated, exercise) {
  return (generated.candidate_map[exercise.slot_id] || []).find((candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id));
}

function quality(plan, generated) {
  return validateWorkoutQuality(plan, generated.coaching_strategy, generated.skeleton, generated.candidate_map, generated.normalized_input);
}

function roleSequence(skeleton) {
  return JSON.stringify(skeleton.map((day) => day.slots.map((slot) => slot.training_role)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
