const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutPlanV3 } = require("../lib/workout-engine");
const { buildWorkoutSelectionPromptV3 } = require("../lib/plan-contracts");
const { DISPLAY_NAME_ALIASES, professionalDisplayName } = require("../lib/exercise-metadata");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const byId = new Map(exercises.map((exercise) => [Number(exercise.exercise_id), exercise]));

for (const [exerciseId, displayName] of Object.entries(DISPLAY_NAME_ALIASES)) {
  const exercise = byId.get(Number(exerciseId));
  assert(exercise, `Missing aliased exercise ${exerciseId}`);
  assert(exercise.name, `Source name was removed for ${exerciseId}`);
  assert(exercise.display_name === displayName, `Display name mismatch for ${exerciseId}`);
}

const rawImportPattern = /^(?:Lever|Sled)\b|\b(?:Gobelt|Pullove|Shoulders Press|One Arm|Two Legs|Close grip|Wide grip|Neutral grip|Reverse grip|plate loaded|T bar|Chin up|Pull Up|Push Up|Sit up)\b/i;
for (const exercise of exercises) {
  assert(!rawImportPattern.test(exercise.display_name), `Display name still contains raw import wording: ${exercise.exercise_id} ${exercise.display_name}`);
  assert(exercise.display_name === professionalDisplayName(exercise.display_name), `Display name is not canonical: ${exercise.exercise_id}`);
}

const generated = generateWorkoutPlanV3({
  goal: "Lose Weight",
  profile: { experience: "Intermediate" },
  workout: {
    days: "6",
    duration: "60 minutes",
    place: "Full Equipment Gym",
    split: "Auto",
    focusAreas: ["Full Body"],
    equipment: [],
    injuries: []
  }
}, exercises);

assert(generated.validation.valid, `Generated plan failed: ${generated.validation.errors.join(", ")}`);
const selected = generated.plan.plan_days.flatMap((day) => day.exercises);
for (const item of selected) {
  const source = byId.get(Number(item.exercise_id));
  assert(source, `Plan emitted unknown exercise ${item.exercise_id}`);
  assert(item.exercise_name === source.display_name, `Plan did not emit display name for ${item.exercise_id}`);
}

const prompt = buildWorkoutSelectionPromptV3({
  normalizedInput: generated.normalized_input,
  coachingStrategy: generated.coaching_strategy,
  skeleton: generated.skeleton,
  candidateMap: generated.candidate_map
});
const promptPayload = JSON.parse(prompt.user);
const candidateIds = new Set(Object.values(generated.candidate_map).flat().map((candidate) => Number(candidate.exercise_id)));
let promptAliasesChecked = 0;
for (const [exerciseId, displayName] of Object.entries(DISPLAY_NAME_ALIASES)) {
  if (!candidateIds.has(Number(exerciseId))) continue;
  const source = byId.get(Number(exerciseId));
  const promptExercise = promptPayload.approved_exercise_catalog[String(exerciseId)];
  assert(promptExercise?.name === displayName, `Prompt is missing display name for ${exerciseId}`);
  assert(promptExercise.name !== source.name, `Prompt exposed source name for ${exerciseId}`);
  promptAliasesChecked += 1;
}
assert(promptAliasesChecked > 0, "No curated aliases reached the generated candidate catalog");

const mutated = JSON.parse(JSON.stringify(generated.plan));
const aliasedSelection = mutated.plan_days.flatMap((day) => day.exercises).find((item) => {
  const source = byId.get(Number(item.exercise_id));
  return source && source.name !== source.display_name;
});
assert(aliasedSelection, "Generated plan did not select a curated alias");
aliasedSelection.exercise_name = byId.get(Number(aliasedSelection.exercise_id)).name;
const invalid = validateWorkoutPlanV3(
  mutated,
  generated.skeleton,
  generated.candidate_map,
  generated.normalized_input,
  generated.coaching_strategy
);
assert(
  invalid.errors.some((error) => error.startsWith(`exercise_name_mismatch:${aliasedSelection.slot_id}:`)),
  "Validator accepted a stale source exercise name"
);

console.log(JSON.stringify({
  status: "passed",
  catalog_records_checked: exercises.length,
  curated_aliases_checked: Object.keys(DISPLAY_NAME_ALIASES).length,
  prompt_aliases_checked: promptAliasesChecked,
  generated_exercises_checked: selected.length,
  source_names_preserved: true,
  stale_name_rejected: true,
  raw_import_wording_rejected: true
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
