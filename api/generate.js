const { createFitnetApi } = require("../lib/api-core");
const { createProductionServices } = require("../lib/production-services");
const { checkGenerationRateLimit } = require("../lib/vercel-security");

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
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  if (!isAllowedOrigin(request)) {
    return response.status(403).json({ error: "origin_not_allowed", message: "This request origin is not allowed." });
  }

  try {
    const body = parseBody(request.body);
    const verification = await services.verifyTurnstile({
      token: body.turnstile_token,
      remoteIp: remoteIp(request.headers)
    });
    if (!verification?.success) {
      return response.status(403).json({
        error: "turnstile_failed",
        message: "Please complete the security check and try again."
      });
    }

    const rateLimit = await checkGenerationRateLimit(request.headers);
    if (!rateLimit.allowed) {
      response.setHeader("Retry-After", String(rateLimit.retry_after_seconds));
      return response.status(429).json({
        error: rateLimit.reason,
        message: rateLimitMessage(rateLimit.reason)
      });
    }

    const result = await api.generateStatelessPlan(body, request.headers, { enforceSecurity: false });
    return response.status(200).json(result);
  } catch (error) {
    const status = Number(error.status_code || 500);
    return response.status(status).json({
      error: error.code || "generation_failed",
      message: status >= 500 ? "We could not prepare your plan right now. Please try again." : error.message
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
