const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV3,
  validateWorkoutPlanV3,
  estimateWorkoutDayDuration
} = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const durations = [30, 45, 60, 75];
const expectedBounds = { 30: [8, 10], 45: [12, 15], 60: [15, 20], 75: [20, 20] };
const dayCounts = [3, 4, 5, 6];
const goals = ["Lose Weight", "Improve Fitness"];
const places = ["Building Gym", "Full Equipment Gym"];
let scenarios = 0;
let cardioSlots = 0;
let mutationChecked = false;

for (const days of dayCounts) {
  for (const duration of durations) {
    for (const goal of goals) {
      for (const place of places) {
        const generated = generateWorkoutPlanV3(inputFor({ days, duration, goal, place }), exercises);
        assert(generated.status === "valid_v3", `${days}/${duration}/${goal}/${place}: generation failed`);
        const slots = generated.skeleton.flatMap((day) => day.slots).filter((slot) => slot.exercise_type === "cardio");
        const allocations = generated.coaching_strategy.cardio_duration_policy.allocations;
        assert(allocations.length === slots.length, `${days}/${duration}/${goal}/${place}: allocation count mismatch`);

        for (const slot of slots) {
          const expected = expectedBounds[duration];
          assert(slot.cardio_duration_policy_version === "workout_cardio_duration_policy_v1", `${slot.slot_id}: missing policy version`);
          assert(slot.rep_range[0] >= 0 && slot.rep_range[1] <= expected[1], `${slot.slot_id}: duration exceeds bound`);
          assert(slot.rep_range[0] <= slot.rep_range[1], `${slot.slot_id}: invalid duration range`);
          const day = generated.plan.plan_days.find((item) => item.day_index === slot.day_index);
          const exercise = day.exercises.find((item) => item.slot_id === slot.slot_id);
          assert(exercise.reps === `${slot.rep_range[0]}-${slot.rep_range[1]} min`, `${slot.slot_id}: plan did not copy fixed range`);
          const estimate = estimateWorkoutDayDuration(day, generated.skeleton, generated.candidate_map, generated.normalized_input);
          assert(estimate.estimated_minutes <= duration, `${slot.slot_id}: deterministic cardio exceeds selected duration`);
          cardioSlots += 1;
        }

        if (!mutationChecked && slots.length) {
          const mutated = JSON.parse(JSON.stringify(generated.plan));
          const slot = slots[0];
          const exercise = mutated.plan_days.find((day) => day.day_index === slot.day_index).exercises.find((item) => item.slot_id === slot.slot_id);
          exercise.reps = `${slot.rep_range[0]}-${slot.rep_range[1] + 3} min`;
          const validation = validateWorkoutPlanV3(
            mutated,
            generated.skeleton,
            generated.candidate_map,
            generated.normalized_input,
            generated.coaching_strategy
          );
          assert(validation.errors.some((error) => error.startsWith(`cardio_duration_mismatch:${slot.slot_id}:`)), "Changed AI cardio range was not rejected");
          mutationChecked = true;
        }
        scenarios += 1;
      }
    }
  }
}

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_cardio_duration_policy_v1",
  scenarios_checked: scenarios,
  cardio_slots_checked: cardioSlots,
  duration_bounds: expectedBounds,
  resistance_time_accounted: true,
  setup_and_transitions_accounted: true,
  changed_ai_range_rejected: mutationChecked
}, null, 2));

function inputFor({ days, duration, goal, place }) {
  return {
    goal,
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
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
