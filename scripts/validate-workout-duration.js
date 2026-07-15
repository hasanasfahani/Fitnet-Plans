const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV2,
  validateWorkoutPlanV2
} = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const durations = [30, 45, 60, 75, 90];
const expectedExercises = { 30: 5, 45: 6, 60: 7, 75: 8, 90: 8 };
const dayCounts = [2, 3, 4, 5, 6];
const estimates = [];

for (const days of dayCounts) {
  for (const duration of durations) {
    const generated = generateWorkoutPlanV2(
      {
        goal: "Build Muscle",
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
      },
      exercises
    );

    assert(
      generated.plan.plan_days.every((day) => day.exercises.length === expectedExercises[duration]),
      `${days} days / ${duration} minutes did not generate exactly ${expectedExercises[duration]} exercises`
    );

    for (const estimate of generated.validation.duration_estimates || []) {
      assert(estimate.within_limit, `${days} days / ${duration} minutes exceeded on day ${estimate.day_index}`);
      assert(estimate.breakdown.length > 0, "Duration estimate is missing its timing breakdown");
      estimates.push({ days, duration, day: estimate.day_index, estimated_minutes: estimate.estimated_minutes });
    }
  }
}

const overloaded = generateWorkoutPlanV2(
  {
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: {
      days: "3",
      duration: "30 minutes",
      place: "Full Equipment Gym",
      split: "Auto",
      focusAreas: ["Full Body"],
      equipment: [],
      injuries: ["None"]
    }
  },
  exercises
);
const overloadedPlan = JSON.parse(JSON.stringify(overloaded.plan));
for (const exercise of overloadedPlan.plan_days[0].exercises) {
  if (exercise.exercise_category !== "cardio") {
    exercise.sets = 4;
    exercise.rest = "180 sec";
  }
}
const overloadedValidation = validateWorkoutPlanV2(
  overloadedPlan,
  overloaded.skeleton,
  overloaded.candidate_map,
  overloaded.normalized_input
);
assert(
  overloadedValidation.errors.some((error) => error.startsWith("session_duration_exceeded:1:")),
  "An overloaded 30-minute workout was not rejected"
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      estimator_version: "workout_duration_estimator_v1",
      scenario_days_checked: estimates.length,
      supported_combinations_checked: dayCounts.length * durations.length,
      exercise_targets: expectedExercises,
      overloaded_plan_rejected: true
    },
    null,
    2
  )
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
