const assert = require("assert");
const {
  createGenerationRequestId,
  failureStage,
  generationContext,
  logGenerationEvent,
  planFailureCategories,
  providerFailureClass,
  validationCategories,
  validationSignals
} = require("../lib/generation-observability");

const requestId = createGenerationRequestId();
assert.match(requestId, /^FIT-[A-F0-9]{10}$/);

const context = generationContext({
  language: "ar",
  plan_type: "Workout + Nutrition",
  profile: { birth_date: "1990-01-01", weight_kg: 75 },
  nutrition: { safetyFlags: ["private-medical-selection"] },
  turnstile_token: "private-turnstile-token"
});
assert.deepStrictEqual(context, {
  language: "ar",
  plan_type: "Workout + Nutrition",
  requested_plans: ["workout", "nutrition"]
});
assert(!JSON.stringify(context).includes("1990-01-01"));
assert(!JSON.stringify(context).includes("private"));

const safetyError = Object.assign(new Error("clinical_referral:private-medical-selection"), {
  code: "nutrition_safety_referral_required",
  status_code: 422
});
assert.strictEqual(failureStage(safetyError, "plan_generation"), "nutrition_eligibility");
assert.deepStrictEqual(validationCategories(safetyError), ["safety_eligibility"]);
assert.deepStrictEqual(validationSignals(safetyError), []);
const coverageError = Object.assign(new Error("weekly_variety:insufficient_unique_recipes:lunch"), {
  code: "nutrition_recipe_coverage_insufficient",
  status_code: 422
});
assert.strictEqual(failureStage(coverageError, "plan_generation"), "nutrition_recipe_coverage");
assert.deepStrictEqual(validationCategories(coverageError), ["candidate_availability", "nutrition_quality"]);
assert.strictEqual(providerFailureClass(new Error("upstream request timed out")), "timeout");
assert.deepStrictEqual(
  validationSignals({ code: "workout_candidates_invalid", message: "candidate_shortage:horizontal_pull:private-id, quality:score_below_threshold:73" }),
  ["candidate_shortage:horizontal_pull", "quality:score_below_threshold"]
);
const partialCategories = planFailureCategories({
  workout: "candidate_missing:private-generated-detail",
  nutrition: "quality:calorie_balance"
});
assert.deepStrictEqual(partialCategories.workout, ["candidate_availability"]);
assert(partialCategories.nutrition.includes("nutrition_quality"));
assert(!JSON.stringify(partialCategories).includes("private-generated-detail"));

const records = [];
const logger = {
  log: (line) => records.push(line),
  info: (line) => records.push(line),
  warn: (line) => records.push(line),
  error: (line) => records.push(line)
};
const logged = logGenerationEvent("warn", "generation.request_failed", {
  request_id: requestId,
  stage: failureStage(safetyError),
  status_code: 422,
  error_code: safetyError.code,
  validation_categories: validationCategories(safetyError),
  ...context
}, logger);

assert.strictEqual(records.length, 1);
assert.deepStrictEqual(JSON.parse(records[0]), logged);
assert(!records[0].includes("private-medical-selection"));
assert(!records[0].includes("turnstile"));
assert(!records[0].includes("birth_date"));

console.log(JSON.stringify({
  status: "passed",
  correlation_id_checked: true,
  structured_events_checked: true,
  pii_redaction_checked: true,
  failure_stages_checked: true,
  partial_failures_checked: true
}, null, 2));
