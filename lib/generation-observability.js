const crypto = require("crypto");

const VALID_LOG_LEVELS = new Set(["log", "info", "warn", "error"]);

function createGenerationRequestId() {
  return `FIT-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function generationContext(body = {}) {
  const planType = safeEnum(body.plan_type || body.planType, ["Workout Only", "Nutrition Only", "Workout + Nutrition"]);
  return {
    language: safeEnum(body.language, ["ar", "en"]) || "unknown",
    plan_type: planType || "unknown",
    requested_plans: [
      planType?.includes("Workout") ? "workout" : null,
      planType?.includes("Nutrition") ? "nutrition" : null
    ].filter(Boolean)
  };
}

function failureStage(error, currentStage = "unknown") {
  const code = String(error?.code || "");
  const stages = {
    missing_goal: "input_validation",
    missing_profile: "input_validation",
    missing_plan_type: "input_validation",
    missing_workout_inputs: "input_validation",
    missing_nutrition_inputs: "input_validation",
    nutrition_safety_referral_required: "nutrition_eligibility",
    workout_strategy_invalid: "workout_strategy_validation",
    workout_candidates_invalid: "workout_candidate_validation",
    workout_validation_failed: "workout_plan_validation",
    nutrition_validation_failed: "nutrition_plan_validation",
    generated_plan_semantic_validation_failed: "semantic_validation",
    generation_failed: "plan_generation_validation",
    llm_not_configured: "provider_configuration",
    pdf_signing_not_configured: "download_configuration"
  };
  return stages[code] || currentStage;
}

function validationCategories(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const source = `${code} ${message}`;
  if (code === "nutrition_safety_referral_required") return ["safety_eligibility"];
  const categories = new Set();

  if (/nutrition_safety|adult_only|clinical_referral|supported_range|safe_deficit|safe_surplus/.test(source)) categories.add("safety_eligibility");
  if (/candidate|exercise_pool|missing_exercise|slot/.test(source)) categories.add("candidate_availability");
  if (/strategy|split|volume|coverage|pattern|balance/.test(source)) categories.add("programming_strategy");
  if (/duration|session_time|time_limit/.test(source)) categories.add("session_duration");
  if (/quality|coaching|instruction|rationale|variety/.test(source)) categories.add("content_quality");
  if (/nutrition|calorie|macro|meal|recipe|ingredient|grocery/.test(source)) categories.add("nutrition_quality");
  if (/schema|contract|semantic|json|missing_required|required_field|invalid_format/.test(source)) categories.add("schema_contract");
  if (/openai|provider|model|llm|authentication|api key/.test(source)) categories.add("provider");
  if (!categories.size) categories.add("uncategorized");

  return [...categories];
}

function validationSignals(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code === "nutrition_safety_referral_required") return [];

  return [...new Set(String(error?.message || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().split(":").slice(0, 2))
    .filter((parts) => parts.length && parts.every((part) => /^[a-z][a-z0-9_]{2,64}$/.test(part)))
    .map((parts) => parts.join(":")))]
    .slice(0, 12);
}

function providerFailureClass(error) {
  const message = String(error?.message || "").toLowerCase();
  if (/timeout|timed out|abort/.test(message)) return "timeout";
  if (/authentication|api key|unauthorized|forbidden/.test(message)) return "authentication";
  if (/rate limit|too many requests|quota/.test(message)) return "rate_limit";
  if (/schema|response_format|invalid json/.test(message)) return "response_format";
  if (/unavailable|connection|network|fetch/.test(message)) return "unavailable";
  return null;
}

function planFailureCategories(planErrors = {}) {
  return Object.fromEntries(
    Object.entries(planErrors)
      .filter(([, message]) => Boolean(message))
      .map(([kind, message]) => [kind, validationCategories({
        code: `${kind}_generation_failed`,
        message
      })])
  );
}

function logGenerationEvent(level, event, details = {}, logger = console) {
  const method = VALID_LOG_LEVELS.has(level) ? level : "log";
  const payload = {
    service: "fitnet-plan-generation",
    event,
    timestamp: new Date().toISOString(),
    ...removeUndefined(details)
  };
  logger[method](JSON.stringify(payload));
  return payload;
}

function safeEnum(value, allowed) {
  const normalized = String(value || "");
  return allowed.includes(normalized) ? normalized : null;
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

module.exports = {
  createGenerationRequestId,
  failureStage,
  generationContext,
  logGenerationEvent,
  planFailureCategories,
  providerFailureClass,
  validationCategories,
  validationSignals
};
