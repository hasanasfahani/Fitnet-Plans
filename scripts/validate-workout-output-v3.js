const fs = require("fs");
const path = require("path");
const {
  generateWorkoutPlanV3,
  validateWorkoutPlanV3
} = require("../lib/workout-engine");
const { canonicalizeWorkoutPlanV3 } = require("../lib/plan-contracts");
const { buildResponseTextFormat } = require("../lib/production-services");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "data/contracts/workout-output-v3.schema.json"), "utf8"));
const generated = generateWorkoutPlanV3(
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
      injuries: ["Knee", "Neck"]
    }
  },
  exercises
);
const plan = canonicalizeWorkoutPlanV3(generated.plan);
const validation = validateWorkoutPlanV3(plan, generated.skeleton, generated.candidate_map, generated.normalized_input, generated.coaching_strategy);

assert(schema.$id === "fitnet.workout.output.v3", "Workout v3 schema ID mismatch");
assertStrictObjects(schema, "root");
assertTypedConstants(schema, "root");
assert(validation.valid, `Valid workout v3 rejected: ${validation.errors.join(", ")}`);
assert(plan.program_version === schema.$id, "Program version mismatch");
assert(plan.plan_days.length === 3, "Workout v3 day count mismatch");
assert(plan.plan_days.every((day) => day.exercises.every((exercise) => exercise.effort_guidance && exercise.coaching_cue)), "Coaching fields are incomplete");

const strictFormat = buildResponseTextFormat(schema);
assert(strictFormat.type === "json_schema", "Provider format is not JSON Schema");
assert(strictFormat.strict === true, "Provider schema is not strict");
assert(!strictFormat.schema.$id && !strictFormat.schema.$schema, "Provider schema retained documentation-only keywords");
assert(strictFormat.schema.properties.program_version.const === schema.$id, "Provider schema version mismatch");
assert(strictFormat.schema.properties.program_version.type === "string", "Provider schema version has no explicit type");

expectError(mutate(plan, (copy) => delete copy.progression_guidance.increase_load), "schema:missing_progression_guidance:increase_load");
expectError(mutate(plan, (copy) => { copy.plan_days[0].exercises[0].effort_guidance = "Work at RPE 8"; }), "schema:forbidden_effort_scale");
expectError(mutate(plan, (copy) => { copy.plan_days[0].exercises[0].coaching_cue = ""; }), "schema:invalid_coaching_cue");
expectError(mutate(plan, (copy) => { copy.plan_days[0].exercises[0].substitution_ids = [999999]; }), "unapproved_substitution_id");
expectError(mutate(plan, (copy) => { copy.unsupported = true; }), "schema:extra_v3_field:unsupported");

console.log(
  JSON.stringify(
    {
      status: "passed",
      schema_id: schema.$id,
      provider_format: strictFormat.type,
      provider_strict: strictFormat.strict,
      days: plan.plan_days.length,
      exercises: plan.plan_days.reduce((sum, day) => sum + day.exercises.length, 0),
      rejection_cases_checked: 5
    },
    null,
    2
  )
);

function expectError(candidate, prefix) {
  const result = validateWorkoutPlanV3(candidate, generated.skeleton, generated.candidate_map, generated.normalized_input, generated.coaching_strategy);
  assert(!result.valid, `Invalid workout unexpectedly passed: ${prefix}`);
  assert(result.errors.some((error) => error.startsWith(prefix)), `Missing expected error ${prefix}: ${result.errors.join(", ")}`);
}

function mutate(value, callback) {
  const copy = JSON.parse(JSON.stringify(value));
  callback(copy);
  return copy;
}

function assertStrictObjects(node, label) {
  if (!node || typeof node !== "object") return;
  if (node.type === "object") {
    assert(node.additionalProperties === false, `${label} allows additional properties`);
    const properties = Object.keys(node.properties || {});
    const required = new Set(node.required || []);
    assert(properties.every((field) => required.has(field)), `${label} has optional strict-schema fields`);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "properties") {
      for (const [field, propertySchema] of Object.entries(child)) assertStrictObjects(propertySchema, `${label}.${field}`);
    } else if (key === "items") {
      assertStrictObjects(child, `${label}[]`);
    }
  }
}

function assertTypedConstants(node, label) {
  if (!node || typeof node !== "object") return;
  if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, "const")) {
    assert(Boolean(node.type), `${label} uses const without an explicit type`);
  }
  for (const [key, child] of Object.entries(node)) {
    if (child && typeof child === "object") assertTypedConstants(child, `${label}.${key}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
