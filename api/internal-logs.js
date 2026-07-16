const crypto = require("crypto");
const {
  listInternalGenerationEvents,
  summarizeInternalGenerationEvents
} = require("../lib/internal-generation-log");

async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store, private");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "method_not_allowed" });
  }

  const configuredKey = String(process.env.INTERNAL_ADMIN_KEY || "");
  if (!configuredKey) {
    return response.status(503).json({ error: "internal_dashboard_not_configured" });
  }
  if (!isAuthorized(request.headers.authorization, configuredKey)) {
    return response.status(401).json({ error: "invalid_admin_key" });
  }

  try {
    const limit = Number(request.query?.limit || 100);
    const events = await listInternalGenerationEvents(limit);
    return response.status(200).json({
      generated_at: new Date().toISOString(),
      retention_days: 7,
      summary: summarizeInternalGenerationEvents(events),
      events
    });
  } catch (error) {
    console.error(JSON.stringify({
      service: "fitnet-internal-dashboard",
      event: "internal.logs_failed",
      error_code: error.code || "internal_logs_unavailable"
    }));
    return response.status(503).json({ error: "internal_logs_unavailable" });
  }
}

function isAuthorized(authorizationHeader, configuredKey) {
  const supplied = String(authorizationHeader || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const suppliedHash = crypto.createHash("sha256").update(supplied).digest();
  const configuredHash = crypto.createHash("sha256").update(String(configuredKey || "")).digest();
  return Boolean(supplied) && crypto.timingSafeEqual(suppliedHash, configuredHash);
}

module.exports = handler;
module.exports.isAuthorized = isAuthorized;
