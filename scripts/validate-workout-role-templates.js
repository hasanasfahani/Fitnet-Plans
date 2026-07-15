const {
  normalizeWorkoutInput,
  buildWorkoutCoachingStrategy,
  buildWorkoutSkeleton,
  validateWorkoutCoachingStrategy
} = require("../lib/workout-engine");
const { TRAINING_ROLES } = require("../lib/exercise-metadata");

const exerciseTargets = { 30: 5, 45: 6, 60: 7, 75: 8 };
const places = ["Home", "Building Gym", "Full Equipment Gym"];
const results = [];

for (const days of [2, 3, 4, 5, 6]) {
  for (const duration of [30, 45, 60, 75]) {
    for (const place of places) validateScenario({ days, duration, place });
  }
}

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_role_template_v2",
  scenarios_checked: results.length,
  schedules_checked: [2, 3, 4, 5, 6],
  durations_checked: Object.keys(exerciseTargets).map(Number),
  places_checked: places,
  required_roles_per_resistance_day: 4,
  canonical_roles_checked: TRAINING_ROLES.length,
  distinct_variants_checked: ["Full Body A/B", "Upper A/B", "Lower A/B", "Push A/B", "Pull A/B", "Legs A/B"]
}, null, 2));

function validateScenario({ days, duration, place }) {
  const normalized = normalizeWorkoutInput({
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
  });
  const strategy = buildWorkoutCoachingStrategy(normalized);
  const skeleton = buildWorkoutSkeleton(normalized, strategy);
  const validation = validateWorkoutCoachingStrategy(strategy, skeleton);
  assert(validation.valid, `${days}/${duration}/${place}: ${validation.errors.join(", ")}`);
  assert(strategy.role_template_policy_version === "workout_role_template_v2", "Role-template policy version is missing");

  for (const day of skeleton) {
    const requirement = strategy.day_requirements.find((item) => item.day_index === day.day_index);
    const resistance = day.slots.filter((slot) => slot.exercise_type !== "cardio");
    const cardio = day.slots.filter((slot) => slot.exercise_type === "cardio");
    assert(day.slots.length === exerciseTargets[duration], `${days}/${duration}/${place}/${day.day_name}: wrong exercise count`);
    assert(cardio.length <= 1 && (!cardio.length || day.slots.at(-1) === cardio[0]), `${day.day_name}: cardio is not one final slot`);
    assert(requirement.required_training_roles.length === Math.min(4, resistance.length), `${day.day_name}: wrong required-role count`);
    assert(requirement.optional_training_roles.length === resistance.length - requirement.required_training_roles.length, `${day.day_name}: wrong optional-role count`);
    assert(
      JSON.stringify(resistance.map((slot) => slot.training_role)) === JSON.stringify(requirement.training_role_template),
      `${day.day_name}: skeleton roles differ from backend template`
    );
    assert(resistance.every((slot) => TRAINING_ROLES.includes(slot.training_role)), `${day.day_name}: noncanonical role emitted`);
    if (day.day_name.includes("Push")) {
      assert(resistance.every((slot) => !["biceps", "horizontal_pull", "vertical_pull"].includes(slot.training_role)), `${day.day_name}: incompatible push role emitted`);
    }
    if (day.day_name.includes("Pull")) {
      assert(resistance.every((slot) => !["triceps", "horizontal_push", "vertical_push"].includes(slot.training_role)), `${day.day_name}: incompatible pull role emitted`);
    }
    assert(resistance.filter((slot) => slot.slot_priority === "required").length === requirement.required_training_roles.length, `${day.day_name}: required priorities differ`);
    assert(resistance.filter((slot) => slot.slot_priority === "optional").length === requirement.optional_training_roles.length, `${day.day_name}: optional priorities differ`);
    const workingSets = day.slots.reduce((sum, slot) => sum + Number(slot.sets || 0), 0);
    assert(workingSets >= strategy.session_budget.min_working_sets, `${day.day_name}: working sets below budget`);
    assert(workingSets <= strategy.session_budget.max_working_sets, `${day.day_name}: working sets above budget`);
  }

  const comparablePairs = [
    ["Full Body A", "Full Body B"],
    ["Upper A", "Upper B"],
    ["Lower A", "Lower B"],
    ["Push A", "Push B"],
    ["Pull A", "Pull B"],
    ["Legs A", "Legs B"],
    ["Legs", "Lower"]
  ];
  for (const [leftName, rightName] of comparablePairs) {
    const left = strategy.day_requirements.find((item) => item.day_name === leftName);
    const right = strategy.day_requirements.find((item) => item.day_name === rightName);
    if (left && right) {
      const constrainedHomePull = place === "Home" && left.day_role === "pull" && right.day_role === "pull";
      assert(constrainedHomePull || JSON.stringify(left.training_role_template) !== JSON.stringify(right.training_role_template), `${leftName}/${rightName}: variants are identical`);
    }
  }

  results.push({ days, duration, place });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
