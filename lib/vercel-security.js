const crypto = require("crypto");
const { getRedis } = require("./upstash-redis");

const RATE_LIMIT_SCRIPT = `#!lua flags=allow-key-locking
local now = tonumber(ARGV[1])
local member = ARGV[2]
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - 3600000)
redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, now - 86400000)
if redis.call('EXISTS', KEYS[3]) == 1 then return {1, 0, 0} end
local hourly = redis.call('ZCARD', KEYS[1])
local daily = redis.call('ZCARD', KEYS[2])
if hourly >= 3 then return {2, hourly, daily} end
if daily >= 6 then return {3, hourly, daily} end
redis.call('SET', KEYS[3], '1', 'PX', 8000)
redis.call('ZADD', KEYS[1], now, member)
redis.call('ZADD', KEYS[2], now, member)
redis.call('PEXPIRE', KEYS[1], 3600000)
redis.call('PEXPIRE', KEYS[2], 86400000)
return {0, hourly + 1, daily + 1}
`;

async function checkGenerationRateLimit(headers = {}) {
  const identity = requestIdentity(headers);
  const now = Date.now();
  let redis;
  try {
    redis = getRedis();
  } catch (error) {
    if (error.code === "redis_not_configured") {
      error.code = "rate_limit_not_configured";
      error.message = "Rate limiting is not configured.";
    }
    throw error;
  }
  const result = await redis.eval(
    RATE_LIMIT_SCRIPT,
    [`fitnet:generate:hour:${identity}`, `fitnet:generate:day:${identity}`, `fitnet:generate:lock:${identity}`],
    [now, `${now}:${crypto.randomUUID()}`]
  );
  const [code, hourly, daily] = result.map(Number);
  if (code === 1) return denied("duplicate_generation", now + 8000);
  if (code === 2) return denied("generation_rate_limited", now + 3600000);
  if (code === 3) return denied("generation_daily_rate_limited", now + 86400000);

  return {
    allowed: true,
    limits: {
      hourly_remaining: Math.max(0, 3 - hourly),
      daily_remaining: Math.max(0, 6 - daily)
    }
  };
}

function requestIdentity(headers = {}) {
  const ip = firstHeader(headers, "x-forwarded-for").split(",")[0].trim()
    || firstHeader(headers, "x-real-ip")
    || "unknown";
  const salt = String(process.env.RATE_LIMIT_SALT || process.env.PDF_SIGNING_SECRET || "fitnet");
  return crypto.createHmac("sha256", salt).update(ip).digest("hex");
}

function firstHeader(headers, name) {
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function denied(reason, reset) {
  return {
    allowed: false,
    reason,
    retry_after_seconds: Math.max(1, Math.ceil((Number(reset || Date.now()) - Date.now()) / 1000))
  };
}

module.exports = { checkGenerationRateLimit, requestIdentity };
