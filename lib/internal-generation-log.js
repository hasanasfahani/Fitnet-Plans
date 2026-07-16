const { getRedis } = require("./upstash-redis");

const EVENT_KEY = "fitnet:internal:generation-events:v1";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RETENTION_SECONDS = 8 * 24 * 60 * 60;
const MAX_EVENTS = 500;
const STATUS_VALUES = new Set(["success", "partial", "failed", "blocked"]);
const PLAN_TYPES = new Set(["Workout Only", "Nutrition Only", "Workout + Nutrition", "unknown"]);
const PLAN_KINDS = new Set(["workout", "nutrition"]);

async function recordInternalGenerationEvent(event, redis = getRedis()) {
  const sanitized = sanitizeInternalGenerationEvent(event);
  const timestamp = Date.parse(sanitized.timestamp);
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(EVENT_KEY, 0, Date.now() - RETENTION_MS);
  pipeline.zadd(EVENT_KEY, { score: timestamp, member: JSON.stringify(sanitized) });
  pipeline.zremrangebyrank(EVENT_KEY, 0, -(MAX_EVENTS + 1));
  pipeline.expire(EVENT_KEY, RETENTION_SECONDS);
  await pipeline.exec();
  return sanitized;
}

async function listInternalGenerationEvents(limit = 100, redis = getRedis()) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 100));
  await redis.zremrangebyscore(EVENT_KEY, 0, Date.now() - RETENTION_MS);
  const values = await redis.zrange(EVENT_KEY, 0, safeLimit - 1, { rev: true });
  return (values || []).map(parseStoredEvent).filter(Boolean);
}

function sanitizeInternalGenerationEvent(event = {}) {
  const parsedTimestamp = Date.parse(event.timestamp || "");
  const status = STATUS_VALUES.has(event.status) ? event.status : "failed";
  const planType = PLAN_TYPES.has(event.plan_type) ? event.plan_type : "unknown";
  return {
    request_id: safeReference(event.request_id),
    timestamp: new Date(Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now()).toISOString(),
    status,
    plan_type: planType,
    language: ["ar", "en"].includes(event.language) ? event.language : "unknown",
    requested_plans: [...new Set((Array.isArray(event.requested_plans) ? event.requested_plans : []).filter((kind) => PLAN_KINDS.has(kind)))],
    stage: safeToken(event.stage, "unknown"),
    error_code: event.error_code ? safeToken(event.error_code, "unknown") : null,
    status_code: clampInteger(event.status_code, 0, 599),
    duration_ms: clampInteger(event.duration_ms, 0, 10 * 60 * 1000),
    validation_categories: [...new Set((Array.isArray(event.validation_categories) ? event.validation_categories : []).map((value) => safeToken(value, "")).filter(Boolean))].slice(0, 8)
  };
}

function summarizeInternalGenerationEvents(events = []) {
  const summary = { total: events.length, success: 0, partial: 0, failed: 0, blocked: 0 };
  for (const event of events) {
    if (Object.prototype.hasOwnProperty.call(summary, event.status)) summary[event.status] += 1;
  }
  return summary;
}

function parseStoredEvent(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? sanitizeInternalGenerationEvent(parsed) : null;
  } catch {
    return null;
  }
}

function safeReference(value) {
  const normalized = String(value || "").toUpperCase();
  return /^FIT-[A-F0-9]{10}$/.test(normalized) ? normalized : "FIT-UNKNOWN";
}

function safeToken(value, fallback) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function clampInteger(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

module.exports = {
  EVENT_KEY,
  MAX_EVENTS,
  RETENTION_MS,
  listInternalGenerationEvents,
  recordInternalGenerationEvent,
  sanitizeInternalGenerationEvent,
  summarizeInternalGenerationEvents
};
