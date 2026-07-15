const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutPlanV3 } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const acceptedScores = [];

for (const days of [2, 3, 4, 5, 6]) {
  const generated = generate(days);
  const score = generated.validation.quality_score;
  assert(generated.validation.valid, `${days}-day reference plan failed: ${generated.validation.errors.join(", ")}`);
  assert(score.passed && score.score >= 85, `${days}-day reference score failed: ${score.score}`);
  assert(Object.values(score.breakdown).reduce((sum, value) => sum + value, 0) === score.score, "Score breakdown does not sum to total");
  assert(score.critical_safety_passed, "Safe reference plan failed critical safety");
  acceptedScores.push({ days, score: score.score });
}

const baseline = generate(3);
const shallowPlan = JSON.parse(JSON.stringify(baseline.plan));
shallowPlan.program_summary.coaching_rationale = "Plan.";
for (const key of Object.keys(shallowPlan.progression_guidance)) shallowPlan.progression_guidance[key] = key === "if_pain_occurs" ? "Stop." : "Okay.";
shallowPlan.recovery_guidance = ["Rest."];
for (const day of shallowPlan.plan_days) {
  for (const exercise of day.exercises) {
    exercise.coaching_cue = "Control.";
    exercise.effort_guidance = "Work.";
  }
}
const shallowValidation = validate(shallowPlan, baseline);
assert(!shallowValidation.valid, "Shallow coaching plan unexpectedly passed");
assert(shallowValidation.quality_score.score < 85, `Shallow coaching score is too high: ${shallowValidation.quality_score.score}`);
assert(shallowValidation.errors.some((error) => error.startsWith("quality:score_below_threshold")), "Score threshold error is missing");
assert(shallowValidation.quality_score.reasons.length > 0, "Low score has no targeted repair reasons");

const unsafePlan = JSON.parse(JSON.stringify(baseline.plan));
unsafePlan.program_summary.coaching_rationale = "This routine guarantees a cure.";
const unsafeValidation = validate(unsafePlan, baseline);
assert(!unsafeValidation.quality_score.critical_safety_passed, "Critical safety failure was converted into a passing score");
assert(!unsafeValidation.quality_score.passed, "Unsafe plan passed score threshold");
assert(unsafeValidation.errors.includes("quality:critical_safety_failed"), "Critical safety failure has no explicit error");
if (unsafeValidation.quality_score.score >= unsafeValidation.quality_score.threshold) {
  assert(!unsafeValidation.errors.some((error) => error.startsWith("quality:score_below_threshold")), "A passing numeric score was reported below threshold");
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      score_policy_version: "workout_quality_score_v1",
      threshold: 85,
      accepted_reference_scores: acceptedScores,
      shallow_plan_score: shallowValidation.quality_score.score,
      shallow_plan_reasons: shallowValidation.quality_score.reasons,
      critical_safety_override_checked: true
    },
    null,
    2
  )
);

function generate(days) {
  return generateWorkoutPlanV3(
    {
      goal: "Build Muscle",
      profile: { experience: "Intermediate" },
      workout: {
        days: String(days),
        duration: "60 minutes",
        place: "Full Equipment Gym",
        split: "Auto",
        focusAreas: ["Full Body"],
        equipment: [],
        injuries: ["None"]
      }
    },
    exercises
  );
}

function validate(plan, generated) {
  return validateWorkoutPlanV3(
    plan,
    generated.skeleton,
    generated.candidate_map,
    generated.normalized_input,
    generated.coaching_strategy
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
