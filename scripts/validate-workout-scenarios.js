const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, readableSplit } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));

const scenarios = [
  {
    label: "two_day_home_full_body_back",
    goal: "Improve Fitness",
    experience: "Beginner",
    days: 2,
    duration: 30,
    place: "Home",
    injuries: ["Lower back"],
    focusAreas: ["Full Body"]
  },
  {
    label: "weight_loss_three_day_30_building_knee",
    goal: "Lose Weight",
    experience: "Beginner",
    days: 3,
    duration: 30,
    place: "Building Gym",
    injuries: ["Knee"],
    focusAreas: ["Full Body"]
  },
  {
    label: "weight_loss_four_day_45_full_gym_shoulder",
    goal: "Lose Weight",
    experience: "Intermediate",
    days: 4,
    duration: 45,
    place: "Full Equipment Gym",
    injuries: ["Shoulder"],
    focusAreas: ["Chest", "Back"]
  },
  {
    label: "muscle_gain_five_day_60_building_neck",
    goal: "Build Muscle",
    experience: "Intermediate",
    days: 5,
    duration: 60,
    place: "Building Gym",
    injuries: ["Neck"],
    focusAreas: ["Legs", "Core"]
  },
  {
    label: "strength_six_day_75_full_gym_selected_focus",
    goal: "Gain Strength",
    experience: "Advanced",
    days: 6,
    duration: 75,
    place: "Full Equipment Gym",
    injuries: ["None"],
    focusAreas: ["Back", "Chest"]
  }
];

const results = scenarios.map(validateScenario);
const covered = {
  schedules: unique(scenarios.map((scenario) => scenario.days)),
  places: unique(scenarios.map((scenario) => scenario.place)),
  limitations: unique(scenarios.flatMap((scenario) => scenario.injuries).filter((injury) => injury !== "None")),
  focus_modes: unique(scenarios.map((scenario) => scenario.focusAreas.includes("Full Body") ? "Full Body" : "Selected focus areas"))
};

assert(JSON.stringify(covered.schedules) === JSON.stringify([2, 3, 4, 5, 6]), "Schedules 2-6 are not fully covered");
for (const place of ["Home", "Building Gym", "Full Equipment Gym"]) assert(covered.places.includes(place), `Missing place coverage: ${place}`);
for (const injury of ["Neck", "Shoulder", "Knee", "Lower back"]) assert(covered.limitations.includes(injury), `Missing limitation coverage: ${injury}`);
for (const mode of ["Full Body", "Selected focus areas"]) assert(covered.focus_modes.includes(mode), `Missing focus coverage: ${mode}`);

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_scenario_matrix_v1",
  scenarios: results,
  coverage: covered
}, null, 2));

function validateScenario(scenario) {
  const generated = generateWorkoutPlanV3({
    goal: scenario.goal,
    profile: { experience: scenario.experience },
    workout: {
      days: String(scenario.days),
      duration: `${scenario.duration} minutes`,
      place: scenario.place,
      split: "Auto",
      focusAreas: scenario.focusAreas,
      equipment: [],
      injuries: scenario.injuries
    }
  }, exercises);

  assert(generated.strategy_validation.valid, `${scenario.label}: strategy failed: ${generated.strategy_validation.errors.join(", ")}`);
  assert(generated.candidate_validation.valid, `${scenario.label}: candidates failed: ${generated.candidate_validation.errors.join(", ")}`);
  assert(generated.validation.valid, `${scenario.label}: plan failed: ${generated.validation.errors.join(", ")}`);
  assert(generated.plan.plan_days.length === scenario.days, `${scenario.label}: wrong day count`);
  const expectedExercises = scenario.duration <= 30 ? 5 : scenario.duration <= 45 ? 6 : scenario.duration <= 60 ? 7 : 8;
  assert(
    generated.plan.plan_days.every((day) => day.exercises.length === expectedExercises),
    `${scenario.label}: expected exactly ${expectedExercises} exercises per day`
  );
  assert(generated.plan.program_summary.split === readableSplit(generated.normalized_input.split), `${scenario.label}: wrong backend split`);
  assert(generated.validation.quality_score?.passed, `${scenario.label}: quality score failed`);
  assert((generated.validation.duration_estimates || []).every((estimate) => estimate.within_limit), `${scenario.label}: duration exceeded`);

  const selected = generated.plan.plan_days.flatMap((day) => day.exercises);
  for (const exercise of selected) {
    const candidate = (generated.candidate_map[exercise.slot_id] || []).find(
      (item) => Number(item.exercise_id) === Number(exercise.exercise_id)
    );
    assert(candidate, `${scenario.label}: unapproved exercise ${exercise.exercise_id}`);
    for (const injury of scenario.injuries.filter((item) => item !== "None")) {
      assert(!(candidate.injury_flags || []).includes(injury), `${scenario.label}: exercise ${exercise.exercise_id} conflicts with ${injury}`);
    }
  }

  const maximumCardio = scenario.days <= 4 ? 1 : 2;
  const cardioCount = selected.filter((exercise) => exercise.exercise_category === "cardio").length;
  assert(cardioCount <= maximumCardio, `${scenario.label}: backend cardio maximum exceeded`);
  assert(Object.values(generated.plan.progression_guidance).every((value) => String(value).trim()), `${scenario.label}: progression is incomplete`);
  assert(generated.plan.recovery_guidance.length > 0, `${scenario.label}: recovery guidance is missing`);
  assert(generated.plan.pain_safety_guidance.length > 0, `${scenario.label}: safety guidance is missing`);
  assert(selected.every((exercise) => exercise.coaching_cue && exercise.effort_guidance), `${scenario.label}: exercise coaching is incomplete`);

  return {
    label: scenario.label,
    days: scenario.days,
    split: generated.plan.program_summary.split,
    exercises: selected.length,
    cardio_sessions: cardioCount,
    quality_score: generated.validation.quality_score.score
  };
}

function unique(values) {
  return [...new Set(values)].sort((left, right) => typeof left === "number" ? left - right : String(left).localeCompare(String(right)));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
