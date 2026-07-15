const {
  normalizeWorkoutInput,
  buildWorkoutCoachingStrategy,
  buildWorkoutSkeleton,
  validateWorkoutCoachingStrategy
} = require("../lib/workout-engine");
const { buildWorkoutSelectionPromptV2 } = require("../lib/plan-contracts");

const expectedSplits = {
  2: "full_body_2",
  3: "upper_lower_full_body_3",
  4: "upper_lower_ab_4",
  5: "ppl_upper_lower_5",
  6: "ppl_x2_6"
};
const durations = [30, 45, 60, 75, 90];
const expectedExercises = { 30: 5, 45: 6, 60: 7, 75: 8, 90: 8 };
const scenarios = [];

for (const days of Object.keys(expectedSplits).map(Number)) {
  for (const duration of durations) {
    const normalized = normalizeWorkoutInput({
      goal: "Build Muscle",
      profile: { experience: "Intermediate" },
      workout: {
        days: String(days),
        duration: `${duration} minutes`,
        place: "Full Equipment Gym",
        split: "Auto",
        focusAreas: ["Chest", "Back"],
        equipment: [],
        injuries: ["None"]
      }
    });
    const strategy = buildWorkoutCoachingStrategy(normalized);
    const skeleton = buildWorkoutSkeleton(normalized, strategy);
    const validation = validateWorkoutCoachingStrategy(strategy, skeleton);

    assert(normalized.split === expectedSplits[days], `Wrong split for ${days} days: ${normalized.split}`);
    assert(strategy.strategy_version === "workout_coaching_rules_v1", "Unexpected strategy version");
    assert(strategy.day_requirements.length === days, `Wrong strategy day count for ${days} days`);
    assert(skeleton.length === days, `Wrong skeleton day count for ${days} days`);
    assert(validation.valid, `${days} days / ${duration} minutes failed: ${validation.errors.join(", ")}`);
    assert(strategy.focus_policy.priority_slots_per_day <= 2, "Focus priority exceeds policy");
    assert(strategy.focus_policy.preserve_required_day_coverage, "Required coverage must be preserved");
    assert(
      skeleton.every((day) => day.slots.length <= strategy.session_budget.max_exercises),
      `Session exercise budget exceeded for ${days} days / ${duration} minutes`
    );
    assert(
      skeleton.every((day) => day.slots.length === expectedExercises[duration]),
      `Expected exactly ${expectedExercises[duration]} exercises for ${duration} minutes / ${days} days`
    );

    scenarios.push({ days, duration, split: normalized.split, status: "passed" });
  }
}

const regressionInput = normalizeWorkoutInput({
  goal: "Build Muscle",
  profile: { experience: "Intermediate" },
  workout: {
    days: "3",
    duration: "30 minutes",
    place: "Full Equipment Gym",
    split: "Auto",
    focusAreas: ["Full Body"],
    equipment: [],
    injuries: ["Knee", "Neck"]
  }
});
const regressionStrategy = buildWorkoutCoachingStrategy(regressionInput);
const regressionSkeleton = buildWorkoutSkeleton(regressionInput, regressionStrategy);
const upperGroups = new Set(regressionSkeleton[0].slots.map((slot) => slot.muscle_group));
const fullBodyGroups = new Set(regressionSkeleton[2].slots.map((slot) => slot.muscle_group));
const fullBodyPatterns = new Set(regressionSkeleton[2].slots.map((slot) => slot.movement_pattern));

assert(["Chest", "Back", "Shoulders"].every((group) => upperGroups.has(group)), "Short Upper day lost required coverage");
assert(["Chest", "Back", "Legs"].every((group) => fullBodyGroups.has(group)), "Short Full Body day lost required coverage");
assert(fullBodyPatterns.has("hip_extension") && fullBodyPatterns.has("hinge"), "Knee-limited Full Body day must use adapted leg and hip-dominant slots");

const prompt = buildWorkoutSelectionPromptV2({
  normalizedInput: regressionInput,
  coachingStrategy: regressionStrategy,
  skeleton: regressionSkeleton,
  candidateMap: Object.fromEntries(regressionSkeleton.flatMap((day) => day.slots.map((slot) => [slot.slot_id, []])))
});
assert(prompt.user.includes("backend_coaching_strategy"), "Workout prompt is missing backend coaching strategy");
assert(
  prompt.system.includes("Backend decisions are final") &&
    prompt.system.includes("training role for each slot") &&
    prompt.system.includes("Preserve required day coverage"),
  "Workout prompt is missing required coverage rule"
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      strategy_version: regressionStrategy.strategy_version,
      scenarios_checked: scenarios.length,
      exercise_targets: expectedExercises,
      regression: "3-day, 30-minute Upper/Lower/Full Body coverage passed"
    },
    null,
    2
  )
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
