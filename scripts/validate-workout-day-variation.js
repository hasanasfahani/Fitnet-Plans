const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3 } = require("../lib/workout-engine");
const { buildWorkoutSelectionPromptV3 } = require("../lib/plan-contracts");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const places = ["Home", "Building Gym", "Full Equipment Gym"];
const durations = [30, 45, 60, 75];
const results = [];
let maximumExerciseOverlap = 0;

for (const days of [2, 4, 5, 6]) {
  for (const duration of durations) {
    for (const place of places) validateScenario({ days, duration, place });
  }
}

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_day_variation_v1",
  scenarios_checked: results.length,
  paired_days_checked: results.reduce((sum, item) => sum + item.pairs, 0),
  maximum_selected_exercise_overlap: maximumExerciseOverlap,
  maximum_allowed_exercise_overlap: 0.5,
  home_lower_equipment_overlap_limit: 0.75,
  emphasis_pairs: [
    "horizontal/vertical upper", "knee/hip lower", "horizontal/vertical push",
    "horizontal/vertical pull", "knee/hip legs", "knee-horizontal/hip-vertical full body"
  ],
  prompt_emphasis_instruction_checked: true
}, null, 2));

function validateScenario({ days, duration, place }) {
  const generated = generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: {
      days: String(days),
      duration: `${duration} minutes`,
      place,
      split: "Auto",
      focusAreas: ["Full Body"],
      equipment: [],
      injuries: ["None"]
    }
  }, exercises);
  assert(generated.validation.valid, `${days}/${duration}/${place}: ${generated.validation.errors.join(", ")}`);

  const prompt = buildWorkoutSelectionPromptV3({
    normalizedInput: generated.normalized_input,
    coachingStrategy: generated.coaching_strategy,
    skeleton: generated.skeleton,
    candidateMap: generated.candidate_map
  });
  assert(
    prompt.system.includes("A/B sessions meaningfully different") && prompt.system.includes("preserving their backend roles"),
    "Prompt is missing the A/B emphasis rule"
  );

  const pairs = pairedDayIndexes(days);
  for (const [leftIndex, rightIndex] of pairs) {
    const leftRequirement = generated.coaching_strategy.day_requirements[leftIndex];
    const rightRequirement = generated.coaching_strategy.day_requirements[rightIndex];
    const leftDay = generated.plan.plan_days[leftIndex];
    const rightDay = generated.plan.plan_days[rightIndex];
    assert(leftRequirement.emphasis !== rightRequirement.emphasis, `${leftDay.day_name}/${rightDay.day_name}: emphasis is identical`);
    assert(leftRequirement.emphasis !== "balanced" && rightRequirement.emphasis !== "balanced", `${leftDay.day_name}/${rightDay.day_name}: emphasis is unspecified`);
    const constrainedHomePair = place === "Home" &&
      ((/Lower|Legs/.test(leftDay.day_name) && /Lower|Legs/.test(rightDay.day_name)) || (/Pull/.test(leftDay.day_name) && /Pull/.test(rightDay.day_name)));
    const roleIntegrityPair = leftRequirement.day_role === rightRequirement.day_role && ["push", "pull"].includes(leftRequirement.day_role);
    assert(constrainedHomePair || roleIntegrityPair || !sameRoleMultiset(leftRequirement.training_role_template, rightRequirement.training_role_template), `${leftDay.day_name}/${rightDay.day_name}: role distributions are identical`);

    const leftIds = new Set(leftDay.exercises.map((exercise) => Number(exercise.exercise_id)));
    const rightIds = new Set(rightDay.exercises.map((exercise) => Number(exercise.exercise_id)));
    const overlap = [...leftIds].filter((id) => rightIds.has(id)).length / Math.max(1, Math.min(leftIds.size, rightIds.size));
    maximumExerciseOverlap = Math.max(maximumExerciseOverlap, overlap);
    const overlapLimit = constrainedHomePair ? 0.75 : 0.5;
    assert(overlap <= overlapLimit, `${leftDay.day_name}/${rightDay.day_name}: selected-exercise overlap ${overlap} exceeds ${overlapLimit}`);
  }

  results.push({ days, duration, place, pairs: pairs.length });
}

function pairedDayIndexes(days) {
  if (days === 2) return [[0, 1]];
  if (days === 4) return [[0, 2], [1, 3]];
  if (days === 5) return [[2, 4]];
  return [[0, 3], [1, 4], [2, 5]];
}

function sameRoleMultiset(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
