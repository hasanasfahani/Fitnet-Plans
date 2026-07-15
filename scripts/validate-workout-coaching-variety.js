const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutQuality } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const generated = generateWorkoutPlanV3({
  goal: "Build Muscle",
  profile: { experience: "Intermediate" },
  workout: {
    days: "4",
    duration: "60 minutes",
    place: "Full Equipment Gym",
    split: "Auto",
    focusAreas: ["Full Body"],
    equipment: [],
    injuries: ["None"]
  }
}, exercises);

assert(generated.validation.valid, `Baseline failed: ${generated.validation.errors.join(", ")}`);

const repeatedCues = clone(generated.plan);
for (const exercise of repeatedCues.plan_days.flatMap((day) => day.exercises)) {
  exercise.coaching_cue = "Use a controlled, smooth, and stable repetition on every exercise.";
}
expectError(repeatedCues, "quality:repetitive_coaching_cues");
expectError(repeatedCues, "quality:generic_cue_wording_overused");

const repeatedEffort = clone(generated.plan);
for (const exercise of repeatedEffort.plan_days.flatMap((day) => day.exercises)) {
  exercise.effort_guidance = "Use a challenging weight and stop before your technique changes.";
}
expectError(repeatedEffort, "quality:repetitive_effort_guidance");

const repeatedRecovery = clone(generated.plan);
repeatedRecovery.recovery_guidance = [
  "Repeat this weekly plan for four weeks.",
  "Repeat this weekly plan for four weeks."
];
expectError(repeatedRecovery, "quality:recovery_repeats_program_instruction");
expectError(repeatedRecovery, "quality:repetitive_recovery_guidance");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_coaching_language_variety_v1",
  baseline_exercises_checked: generated.plan.plan_days.flatMap((day) => day.exercises).length,
  checks: [
    "exercise_specific_cue_variety",
    "effort_guidance_variety",
    "generic_descriptor_concentration",
    "recovery_repeat_instruction_separation",
    "duplicate_recovery_guidance"
  ]
}, null, 2));

function expectError(plan, expected) {
  const result = validateWorkoutQuality(plan, generated.coaching_strategy, generated.skeleton, generated.candidate_map, generated.normalized_input);
  assert(result.errors.includes(expected), `Expected ${expected}; received ${result.errors.join(", ")}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
