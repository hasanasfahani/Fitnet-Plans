const { createFitnetApi } = require("../lib/api-core");
const { createProductionServices } = require("../lib/production-services");
const { checkGenerationRateLimit } = require("../lib/vercel-security");
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

const services = createProductionServices();
const api = createFitnetApi({
  services,
  persistSessions: false,
  autoRunJobs: false,
  exposeDebug: false,
  storageDir: "/tmp/fitnet-api",
  pdfDir: "/tmp/fitnet-pdf",
  tmpDir: "/tmp/fitnet-pdf"
});

module.exports = async function handler(request, response) {
  const requestId = createGenerationRequestId();
  const startedAt = Date.now();
  const vercelRequestId = String(request.headers["x-vercel-id"] || "") || undefined;
  let stage = "request_validation";
  let context = { language: "unknown", plan_type: "unknown", requested_plans: [] };

  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Fitnet-Request-Id", requestId);

  if (request.method !== "POST") {
    logGenerationEvent("warn", "generation.request_rejected", {
      request_id: requestId,
      vercel_request_id: vercelRequestId,
      stage,
      reason: "method_not_allowed"
    });
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "method_not_allowed", request_id: requestId });
  }
  if (!isAllowedOrigin(request)) {
    logGenerationEvent("warn", "generation.request_rejected", {
      request_id: requestId,
      vercel_request_id: vercelRequestId,
      stage,
      reason: "origin_not_allowed"
    });
    return response.status(403).json({ error: "origin_not_allowed", message: "This request origin is not allowed.", request_id: requestId });
  }

  try {
    const body = parseBody(request.body);
    context = generationContext(body);
    logGenerationEvent("info", "generation.request_started", {
      request_id: requestId,
      vercel_request_id: vercelRequestId,
      ...context
    });

    stage = "turnstile_verification";
    const verification = await services.verifyTurnstile({
      token: body.turnstile_token,
      remoteIp: remoteIp(request.headers)
    });
    if (!verification?.success) {
      logGenerationEvent("warn", "generation.security_rejected", {
        request_id: requestId,
        vercel_request_id: vercelRequestId,
        stage,
        reason: "turnstile_failed",
        provider_codes: verification?.errorCodes || [],
        duration_ms: Date.now() - startedAt,
        ...context
      });
      return response.status(403).json({
        error: "turnstile_failed",
        message: "Please complete the security check and try again.",
        request_id: requestId
      });
    }

    stage = "rate_limit";
    const rateLimit = await checkGenerationRateLimit(request.headers);
    if (!rateLimit.allowed) {
      logGenerationEvent("warn", "generation.security_rejected", {
        request_id: requestId,
        vercel_request_id: vercelRequestId,
        stage,
        reason: rateLimit.reason,
        duration_ms: Date.now() - startedAt,
        ...context
      });
      response.setHeader("Retry-After", String(rateLimit.retry_after_seconds));
      return response.status(429).json({
        error: rateLimit.reason,
        message: rateLimitMessage(rateLimit.reason),
        request_id: requestId
      });
    }

    stage = "plan_generation";
    const result = await api.generateStatelessPlan(body, request.headers, { enforceSecurity: false });
    const partial = result.status === "partial_ready";
    logGenerationEvent(partial ? "warn" : "info", partial ? "generation.request_partial" : "generation.request_completed", {
      request_id: requestId,
      vercel_request_id: vercelRequestId,
      session_id: result.session_id,
      result_status: result.status,
      plan_statuses: result.plan_statuses,
      failed_plans: result.failed_plan_kinds,
      failed_plan_categories: partial ? planFailureCategories(result.plan_errors) : undefined,
      duration_ms: Date.now() - startedAt,
      ...context
    });
    return response.status(200).json({ ...result, request_id: requestId });
  } catch (error) {
    const status = Number(error.status_code || 500);
    const code = error.code || "generation_failed";
    const resolvedStage = failureStage(error, stage);
    logGenerationEvent(status >= 500 || status === 422 ? "error" : "warn", "generation.request_failed", {
      request_id: requestId,
      vercel_request_id: vercelRequestId,
      stage: resolvedStage,
      status_code: status,
      error_code: code,
      validation_categories: validationCategories(error),
      validation_signals: validationSignals(error),
      provider_failure_class: providerFailureClass(error) || undefined,
      duration_ms: Date.now() - startedAt,
      ...context
    });
    return response.status(status).json({
      error: code,
      message: status >= 500 ? "We could not prepare your plan right now. Please try again." : error.message,
      request_id: requestId
    });
  }
};

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") {
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 256 * 1024) {
      const error = new Error("Request is too large.");
      error.code = "request_too_large";
      error.status_code = 413;
      throw error;
    }
    return body;
  }
  if (Buffer.byteLength(String(body), "utf8") > 256 * 1024) {
    const error = new Error("Request is too large.");
    error.code = "request_too_large";
    error.status_code = 413;
    throw error;
  }
  try {
    return JSON.parse(String(body));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "invalid_json";
    error.status_code = 400;
    throw error;
  }
}

function isAllowedOrigin(request) {
  const origin = String(request.headers.origin || "").replace(/\/$/, "");
  if (!origin) return true;
  const allowed = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (allowed.length) return allowed.includes(origin);
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return origin === `https://${host}` || (process.env.NODE_ENV !== "production" && origin === `http://${host}`);
}

function remoteIp(headers = {}) {
  return String(headers["x-forwarded-for"] || headers["x-real-ip"] || "").split(",")[0].trim();
}

function rateLimitMessage(reason) {
  if (reason === "generation_daily_rate_limited") {
    return "You have reached the daily limit of 6 plan generations. Please try again later.";
  }
  if (reason === "duplicate_generation") {
    return "A plan is already being requested. Please wait a few seconds.";
  }
  return "You have reached the limit of 3 plan generations per hour. Please try again later.";
}
