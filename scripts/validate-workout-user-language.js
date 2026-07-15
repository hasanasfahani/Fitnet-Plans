const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV3,
  validateWorkoutPlanV3,
  findInternalLanguageViolations
} = require("../lib/workout-engine");
const { repairActions } = require("../lib/production-services");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const generated = generateWorkoutPlanV3({
  goal: "Lose Weight",
  profile: { experience: "Intermediate" },
  workout: {
    days: "4",
    duration: "45 minutes",
    place: "Full Equipment Gym",
    split: "Auto",
    focusAreas: ["Full Body"],
    equipment: [],
    injuries: ["None"]
  }
}, exercises);

assert(generated.status === "valid_v3", `Baseline failed: ${generated.validation.errors.join(", ")}`);
assert(findInternalLanguageViolations(generated.plan).length === 0, "Baseline contains internal language");

const cardio = generated.plan.plan_days.flatMap((day) => day.exercises).find((exercise) => exercise.exercise_category === "cardio");
assert(cardio, "Test scenario has no cardio exercise");

const cases = [
  ["coaching_rationale", (plan) => { plan.program_summary.coaching_rationale += " The backend selected this."; }],
  ["repeat_instruction", (plan) => { plan.repeat_instruction += " Follow the validation result."; }],
  ["progression_increase_load", (plan) => { plan.progression_guidance.increase_load += " Keep the schema unchanged."; }],
  ["recovery_1", (plan) => { plan.recovery_guidance[0] += " Use the candidate pool."; }],
  ["safety_1", (plan) => { plan.pain_safety_guidance[0] += " Check the injury flags."; }],
  [`cue_${generated.plan.plan_days[0].exercises[0].slot_id}`, (plan) => { plan.plan_days[0].exercises[0].coaching_cue += " Follow the slot ID."; }],
  [`effort_${generated.plan.plan_days[0].exercises[0].slot_id}`, (plan) => { plan.plan_days[0].exercises[0].effort_guidance += " Use the approved exercise ID."; }],
  [`cardio_notes_${cardio.slot_id}`, (plan) => {
    plan.plan_days.flatMap((day) => day.exercises).find((exercise) => exercise.slot_id === cardio.slot_id).notes += " Check the catalog.";
  }]
];

for (const [field, mutate] of cases) {
  const plan = clone(generated.plan);
  mutate(plan);
  const validation = validateWorkoutPlanV3(plan, generated.skeleton, generated.candidate_map, generated.normalized_input, generated.coaching_strategy);
  assert(validation.errors.some((error) => error.startsWith(`quality:internal_language:${field}:`)), `${field}: internal language was not rejected`);
}

const allowed = clone(generated.plan);
allowed.progression_guidance.if_pain_occurs = "Stop the movement and use an approved alternative only when it feels comfortable and appropriate.";
assert(findInternalLanguageViolations(allowed).length === 0, "Natural 'approved alternative' wording was rejected");

const unavailableSubstitution = clone(generated.plan);
unavailableSubstitution.progression_guidance.if_pain_occurs = "Stop the movement and switch to a listed substitute that feels comfortable.";
const unavailableValidation = validateWorkoutPlanV3(unavailableSubstitution, generated.skeleton, generated.candidate_map, generated.normalized_input, generated.coaching_strategy);
assert(unavailableValidation.errors.includes("quality:unavailable_substitution_reference"), "Unavailable listed-substitute wording was not rejected");

const actions = repairActions(["quality:internal_language:safety_1:injury_flags"]);
assert(actions.includes("Rewrite the identified sentence as natural user-facing coaching guidance without changing its meaning."), "Targeted language repair instruction is missing");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_user_facing_language_v1",
  fields_checked: cases.map(([field]) => field),
  internal_terms_checked: ["backend", "candidate_pool", "catalog", "injury_flags", "validation", "schema", "approved_id", "slot_id"],
  natural_approved_alternative_allowed: true,
  unavailable_substitution_reference_rejected: true,
  targeted_repair_checked: true,
  schema_changed: false
}, null, 2));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
