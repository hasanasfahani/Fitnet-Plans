const { Redis } = require("@upstash/redis");

let redisClient;

function getRedis() {
  if (redisClient) return redisClient;

  const url = String(
    process.env.UPSTASH_REDIS_REST_URL
      || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL
      || ""
  ).trim();
  const token = String(
    process.env.UPSTASH_REDIS_REST_TOKEN
      || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
      || ""
  ).trim();
  if (!url || !token) {
    const error = new Error("Upstash Redis is not configured.");
    error.code = "redis_not_configured";
    error.status_code = 503;
    throw error;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

module.exports = { getRedis };
