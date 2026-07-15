const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, readableSplit } = require("../lib/workout-engine");
const { buildWorkoutSelectionPromptV3 } = require("../lib/plan-contracts");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const schedules = [2, 3, 4, 5, 6];
const durations = [30, 45, 60, 75];
const places = ["Home", "Building Gym", "Full Equipment Gym"];
const goals = ["Lose Weight", "Build Muscle", "Improve Fitness", "Gain Strength"];
const focusModes = [
  { label: "Full Body", values: ["Full Body"] },
  { label: "Selected focus areas", values: ["Chest", "Back"] }
];
const exerciseTargets = { 30: 5, 45: 6, 60: 7, 75: 8 };
const combinations = new Set();
let scenariosChecked = 0;
let workoutDaysChecked = 0;
let slotsChecked = 0;
let selectedFocusScenarios = 0;
let maximumPromptCharacters = 0;
let minimumQualityScore = Infinity;

for (const days of schedules) {
  for (const duration of durations) {
    for (const place of places) {
      for (const goal of goals) {
        for (const focusMode of focusModes) {
          validateScenario({ days, duration, place, goal, focusMode });
        }
      }
    }
  }
}

const expectedScenarios = schedules.length * durations.length * places.length * goals.length * focusModes.length;
assert(scenariosChecked === expectedScenarios, `Expected ${expectedScenarios} scenarios, received ${scenariosChecked}`);
assert(combinations.size === expectedScenarios, "Scenario matrix contains duplicate or missing combinations");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_programming_scenario_matrix_v1",
  phase: "injury_neutral_phase_1",
  scenarios_checked: scenariosChecked,
  workout_days_checked: workoutDaysChecked,
  slots_checked: slotsChecked,
  selected_focus_scenarios: selectedFocusScenarios,
  maximum_prompt_characters: maximumPromptCharacters,
  prompt_character_limit: 65000,
  minimum_quality_score: minimumQualityScore,
  coverage: {
    schedules,
    durations,
    places,
    goals,
    focus_modes: focusModes.map((mode) => mode.label)
  }
}, null, 2));

function validateScenario({ days, duration, place, goal, focusMode }) {
  const key = [days, duration, place, goal, focusMode.label].join("|");
  assert(!combinations.has(key), `Duplicate scenario: ${key}`);
  combinations.add(key);

  const generated = generateWorkoutPlanV3({
    goal,
    profile: { experience: experienceForGoal(goal) },
    workout: {
      days: String(days),
      duration: `${duration} minutes`,
      place,
      split: "Auto",
      focusAreas: focusMode.values,
      equipment: [],
      injuries: ["None"]
    }
  }, exercises);

  assert(generated.normalized_input.injuries.length === 0, `${key}: scenario is not injury-neutral`);
  assert(generated.strategy_validation.valid, `${key}: strategy failed: ${generated.strategy_validation.errors.join(", ")}`);
  assert(generated.candidate_validation.valid, `${key}: candidates failed: ${generated.candidate_validation.errors.join(", ")}`);
  assert(generated.validation.valid, `${key}: plan failed: ${generated.validation.errors.join(", ")}`);
  assert(generated.plan.plan_days.length === days, `${key}: wrong day count`);
  assert(generated.plan.program_summary.split === readableSplit(generated.normalized_input.split), `${key}: split mismatch`);
  assert(generated.validation.policy_version === "workout_ai_quality_policy_v2", `${key}: wrong quality policy`);
  assert(generated.validation.quality_score?.passed, `${key}: quality score failed`);
  minimumQualityScore = Math.min(minimumQualityScore, generated.validation.quality_score.score);

  const expectedExercises = exerciseTargets[duration];
  for (const day of generated.plan.plan_days) {
    assert(day.exercises.length === expectedExercises, `${key}: day ${day.day_index} has ${day.exercises.length}/${expectedExercises} exercises`);
    workoutDaysChecked += 1;
  }
  assert((generated.validation.duration_estimates || []).length === days, `${key}: duration diagnostics are incomplete`);
  assert((generated.validation.duration_estimates || []).every((estimate) => estimate.within_limit), `${key}: duration exceeded`);

  const skeletonSlots = generated.skeleton.flatMap((day) => day.slots);
  const selected = generated.plan.plan_days.flatMap((day) => day.exercises);
  assert(selected.length === days * expectedExercises, `${key}: total exercise count mismatch`);
  assert(skeletonSlots.length === selected.length, `${key}: skeleton and plan slot counts differ`);
  for (const exercise of selected) {
    const slot = skeletonSlots.find((item) => item.slot_id === exercise.slot_id);
    const candidate = (generated.candidate_map[exercise.slot_id] || []).find(
      (item) => Number(item.exercise_id) === Number(exercise.exercise_id)
    );
    assert(slot, `${key}: selected unknown slot ${exercise.slot_id}`);
    assert(candidate, `${key}: selected unapproved exercise ${exercise.exercise_id}`);
    assert(candidate.training_role === slot.training_role, `${key}: ${exercise.slot_id} role mismatch`);
    assert(candidate.category === slot.muscle_group, `${key}: ${exercise.slot_id} muscle mismatch`);
    slotsChecked += 1;
  }

  const cardioCount = selected.filter((exercise) => exercise.exercise_category === "cardio").length;
  assert(cardioCount === generated.coaching_strategy.cardio_policy.planned_sessions, `${key}: cardio allocation mismatch`);
  assert(cardioCount <= generated.coaching_strategy.cardio_policy.maximum_sessions, `${key}: cardio maximum exceeded`);

  const focusSets = Number(generated.coaching_strategy.focus_policy.planned_additional_sets || 0);
  if (focusMode.label === "Full Body") {
    assert(focusSets === 0, `${key}: Full Body received focus-only volume`);
  } else {
    assert(focusSets >= 0 && focusSets <= 4, `${key}: selected focus volume is outside 0-4 sets`);
    if (duration > 30) assert(focusSets >= 1, `${key}: selected focus received no extra volume despite available session capacity`);
    for (const category of ["Chest", "Back"]) {
      assert(generated.validation.quality_validation.diagnostics.weekly_direct_sets[category] > 0, `${key}: selected focus ${category} is absent`);
    }
    selectedFocusScenarios += 1;
  }

  assert(Object.values(generated.plan.progression_guidance).every((value) => String(value).trim().length >= 20), `${key}: progression is incomplete`);
  assert(generated.plan.recovery_guidance.some((value) => String(value).trim().length >= 20), `${key}: recovery is incomplete`);
  assert(selected.every((exercise) => String(exercise.coaching_cue).trim().length >= 15), `${key}: coaching cue is incomplete`);
  assert(selected.every((exercise) => String(exercise.effort_guidance).trim().length >= 15), `${key}: effort guidance is incomplete`);

  const prompt = buildWorkoutSelectionPromptV3({
    normalizedInput: generated.normalized_input,
    coachingStrategy: generated.coaching_strategy,
    skeleton: generated.skeleton,
    candidateMap: generated.candidate_map
  });
  const promptCharacters = prompt.system.length + prompt.user.length;
  assert(promptCharacters < 65000, `${key}: prompt exceeds size guard: ${promptCharacters}`);
  maximumPromptCharacters = Math.max(maximumPromptCharacters, promptCharacters);
  scenariosChecked += 1;
}

function experienceForGoal(goal) {
  if (goal === "Improve Fitness") return "Beginner";
  if (goal === "Gain Strength") return "Advanced";
  return "Intermediate";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
