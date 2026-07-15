const {
  normalizeWorkoutInput,
  buildWorkoutCoachingStrategy,
  buildWorkoutSkeleton,
  validateWorkoutCoachingStrategy
} = require("../lib/workout-engine");

const goals = ["Lose Weight", "Improve Fitness", "Build Muscle", "Gain Strength", "Improve Body Shape"];
const durations = [30, 45, 60, 75];
let scenariosChecked = 0;

for (const days of [2, 3, 4, 5, 6]) {
  for (const goal of goals) {
    for (const duration of durations) {
      const { strategy, skeleton } = buildScenario({ days, goal, duration });
      const cardioSlots = skeleton.flatMap((day) => day.slots.filter((slot) => slot.exercise_type === "cardio"));
      const maximum = days <= 4 ? 1 : 2;
      assert(strategy.cardio_policy.maximum_sessions === maximum, `Wrong maximum for ${days} days`);
      assert(cardioSlots.length <= maximum, `${days}-day ${goal} plan exceeded cardio maximum`);
      assert(cardioSlots.length === strategy.cardio_policy.planned_sessions, "Skeleton does not match planned cardio count");
      assert(cardioSlots.every((slot) => skeleton.find((day) => day.day_index === slot.day_index).slots.at(-1).slot_id === slot.slot_id), "Cardio is not the final slot");
      assert(validateWorkoutCoachingStrategy(strategy, skeleton).valid, `Cardio strategy failed for ${days}/${goal}/${duration}`);
      scenariosChecked += 1;
    }
  }
}

for (const days of [2, 3, 4, 5, 6]) {
  for (const goal of ["Lose Weight", "Improve Fitness"]) {
    const { strategy } = buildScenario({ days, goal, duration: 45 });
    const expectedCount = days <= 4 ? 1 : 2;
    const expectedDays = days <= 4 ? [1] : [1, 4];
    assert(strategy.cardio_policy.planned_sessions === expectedCount, `${days}-day ${goal} did not use cardio allowance`);
    assert(JSON.stringify(strategy.cardio_policy.planned_day_indexes) === JSON.stringify(expectedDays), `${days}-day ${goal} cardio placement mismatch`);
  }
}

assert(buildScenario({ days: 6, goal: "Build Muscle", duration: 45 }).strategy.cardio_policy.planned_sessions === 0, "Short muscle plan should not force cardio");
assert(buildScenario({ days: 6, goal: "Build Muscle", duration: 60 }).strategy.cardio_policy.planned_sessions === 1, "Long muscle plan should allow one cardio session");
assert(buildScenario({ days: 5, goal: "Gain Strength", duration: 60 }).strategy.cardio_policy.planned_sessions === 0, "Strength plan should preserve short session time");
assert(buildScenario({ days: 5, goal: "Gain Strength", duration: 75 }).strategy.cardio_policy.planned_sessions === 1, "Long strength plan should allow one cardio session");

console.log(JSON.stringify({
  status: "passed",
  cardio_policy_version: "workout_cardio_policy_v1",
  scenarios_checked: scenariosChecked,
  maximum_sessions: { "2-4_days": 1, "5-6_days": 2 },
  weight_loss_and_fitness_placement: { "2-4_days": [1], "5-6_days": [1, 4] },
  cardio_final_slot_checked: true
}, null, 2));

function buildScenario({ days, goal, duration }) {
  const normalized = normalizeWorkoutInput({
    goal,
    profile: { experience: "Intermediate" },
    workout: {
      days: String(days),
      duration: `${duration} minutes`,
      place: "Full Equipment Gym",
      split: "Auto",
      focusAreas: ["Full Body"],
      equipment: [],
      injuries: ["None"]
    }
  });
  const strategy = buildWorkoutCoachingStrategy(normalized);
  return { strategy, skeleton: buildWorkoutSkeleton(normalized, strategy) };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
