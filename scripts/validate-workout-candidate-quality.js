const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3 } = require("../lib/workout-engine");
const { buildWorkoutSelectionPromptV3 } = require("../lib/plan-contracts");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const schedules = [2, 3, 4, 5, 6];
const durations = [30, 45, 60, 75];
const places = ["Home", "Building Gym", "Full Equipment Gym"];
const weakDefaultIds = new Set([138, 143, 144, 572]);
const roleLocationCoverage = new Set();
let scenariosChecked = 0;
let slotsChecked = 0;
let maximumPromptCharacters = 0;

for (const exercise of exercises) {
  assert(exercise.metadata_version === "exercise_metadata_v5", `Exercise ${exercise.exercise_id} is not Metadata V5`);
  assert(Number.isInteger(exercise.selection_priority) && exercise.selection_priority >= 1 && exercise.selection_priority <= 5, `Invalid priority for ${exercise.exercise_id}`);
  assert(["low", "moderate", "high"].includes(exercise.setup_complexity), `Invalid setup complexity for ${exercise.exercise_id}`);
  assert(["low", "moderate", "high"].includes(exercise.stability), `Invalid stability for ${exercise.exercise_id}`);
  assert(["low", "moderate", "high"].includes(exercise.general_programming_value), `Invalid programming value for ${exercise.exercise_id}`);
}

for (const days of schedules) {
  for (const duration of durations) {
    for (const place of places) {
      const generated = generate({ days, duration, place });
      assert(generated.candidate_validation.valid, `${days}/${duration}/${place}: ${generated.candidate_validation.errors.join(", ")}`);
      assert(generated.validation.valid, `${days}/${duration}/${place}: ${generated.validation.errors.join(", ")}`);
      for (const exercise of generated.plan.plan_days.flatMap((day) => day.exercises)) {
        assert(!/\b(?:lever|sled|alternate|one leg|military press)\b/i.test(exercise.exercise_name), `${days}/${duration}/${place}: unresolved display name ${exercise.exercise_name}`);
      }

      for (const [slotId, candidates] of Object.entries(generated.candidate_map)) {
        assert(candidates.length > 0, `${days}/${duration}/${place}/${slotId}: empty candidates`);
        const top = candidates[0];
        const bestPriority = Math.min(...candidates.map((candidate) => candidate.selection_priority));
        assert(top.selection_priority <= bestPriority + 1, `${days}/${duration}/${place}/${slotId}: top candidate ignores quality priority`);
        if (candidates.some((candidate) => candidate.general_programming_value !== "low")) {
          assert(top.general_programming_value !== "low", `${days}/${duration}/${place}/${slotId}: low-value candidate ranked first`);
        }
        assert(!weakDefaultIds.has(Number(top.exercise_id)), `${days}/${duration}/${place}/${slotId}: weak default ${top.name} ranked first`);
        roleLocationCoverage.add(`${place}|${top.training_role}`);
        slotsChecked += 1;
      }

      const prompt = buildWorkoutSelectionPromptV3({
        normalizedInput: generated.normalized_input,
        coachingStrategy: generated.coaching_strategy,
        skeleton: generated.skeleton,
        candidateMap: generated.candidate_map
      });
      assert(prompt.system.includes("ordered by backend preference"), "Prompt does not explain candidate preference order");
      const promptCharacters = prompt.system.length + prompt.user.length;
      assert(promptCharacters < 65000, `${days}/${duration}/${place}: prompt exceeds size guard`);
      maximumPromptCharacters = Math.max(maximumPromptCharacters, promptCharacters);
      scenariosChecked += 1;
    }
  }
}

for (const id of weakDefaultIds) {
  const exercise = exercises.find((item) => Number(item.exercise_id) === id);
  assert(exercise, `Weak-default regression exercise ${id} is missing`);
  assert(exercise.selection_priority >= 4, `Weak-default exercise ${id} is not sufficiently deprioritized`);
  assert(exercise.general_programming_value === "low", `Weak-default exercise ${id} is not marked low value`);
}

assert(roleLocationCoverage.size >= 40, `Insufficient role/location ranking coverage: ${roleLocationCoverage.size}`);

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_candidate_quality_ranking_v1",
  metadata_version: "exercise_metadata_v5",
  records_checked: exercises.length,
  scenarios_checked: scenariosChecked,
  slots_checked: slotsChecked,
  role_location_combinations_checked: roleLocationCoverage.size,
  weak_default_ids_checked: [...weakDefaultIds],
  maximum_prompt_characters: maximumPromptCharacters,
  ranking_position: "after_hard_eligibility",
  schema_changed: false
}, null, 2));

function generate({ days, duration, place }) {
  return generateWorkoutPlanV3({
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
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
