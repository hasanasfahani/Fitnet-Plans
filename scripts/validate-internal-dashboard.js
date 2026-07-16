const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  EVENT_KEY,
  RETENTION_MS,
  listInternalGenerationEvents,
  recordInternalGenerationEvent,
  sanitizeInternalGenerationEvent,
  summarizeInternalGenerationEvents
} = require("../lib/internal-generation-log");
const { isAuthorized } = require("../api/internal-logs");

const root = path.join(__dirname, "..");

async function main() {
  const redis = new FakeRedis();
  const raw = {
    request_id: "fit-a1b2c3d4e5",
    timestamp: "2026-07-17T10:00:00.000Z",
    status: "failed",
    plan_type: "Workout + Nutrition",
    language: "ar",
    requested_plans: ["workout", "nutrition", "private-plan"],
    stage: "nutrition_recipe_coverage",
    error_code: "nutrition_recipe_coverage_insufficient",
    status_code: 422,
    duration_ms: 2300,
    validation_categories: ["nutrition_quality", "candidate_availability"],
    profile: { birth_date: "1990-01-01", weight_kg: 70 },
    medical_selection: "private-medical-value",
    prompt: "private prompt",
    generated_plan: { private: true }
  };

  const sanitized = sanitizeInternalGenerationEvent(raw);
  assert.strictEqual(sanitized.request_id, "FIT-A1B2C3D4E5");
  assert.deepStrictEqual(sanitized.requested_plans, ["workout", "nutrition"]);
  const serialized = JSON.stringify(sanitized);
  for (const privateValue of ["birth_date", "weight_kg", "medical", "private prompt", "generated_plan"]) {
    assert(!serialized.includes(privateValue), `Sanitized event leaked ${privateValue}`);
  }

  await recordInternalGenerationEvent(raw, redis);
  await recordInternalGenerationEvent({
    request_id: "FIT-0011223344",
    timestamp: "2026-07-17T10:01:00.000Z",
    status: "success",
    plan_type: "Workout Only",
    language: "en",
    requested_plans: ["workout"],
    stage: "completed",
    status_code: 200,
    duration_ms: 900
  }, redis);
  const events = await listInternalGenerationEvents(100, redis);
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].request_id, "FIT-0011223344");
  assert.deepStrictEqual(summarizeInternalGenerationEvents(events), { total: 2, success: 1, partial: 0, failed: 1, blocked: 0 });
  assert(redis.expirySeconds === 8 * 24 * 60 * 60, "Redis retention expiry was not configured");
  assert(RETENTION_MS === 7 * 24 * 60 * 60 * 1000, "Seven-day retention changed unexpectedly");
  assert(EVENT_KEY.startsWith("fitnet:internal:"), "Internal event namespace is not isolated");

  assert(isAuthorized("Bearer correct-key", "correct-key"), "Valid internal key was rejected");
  assert(!isAuthorized("Bearer incorrect-key", "correct-key"), "Invalid internal key was accepted");
  assert(!isAuthorized("", "correct-key"), "Missing internal key was accepted");

  const html = fs.readFileSync(path.join(root, "internal", "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "internal", "internal.js"), "utf8");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert(html.includes("noindex, nofollow, noarchive"), "Internal page can be indexed");
  assert(html.includes("/internal/internal.js"), "Internal page script is missing");
  assert(script.includes("Authorization: `Bearer ${state.key}`"), "Dashboard does not authenticate API requests");
  assert(script.includes("sessionStorage") && !script.includes("localStorage"), "Admin key must remain tab-scoped");
  assert(vercel.rewrites.some((rewrite) => rewrite.source === "/internal" && rewrite.destination === "/internal/index.html"), "Internal route rewrite is missing");

  console.log(JSON.stringify({
    status: "passed",
    sanitized_fields_only: true,
    retention_days: 7,
    maximum_events: 500,
    authentication_checked: true,
    responsive_dashboard_assets_checked: true
  }, null, 2));
}

class FakeRedis {
  constructor() {
    this.entries = [];
    this.expirySeconds = 0;
  }

  pipeline() {
    const commands = [];
    const pipeline = {
      zremrangebyscore: (...args) => { commands.push(() => this.zremrangebyscore(...args)); return pipeline; },
      zadd: (...args) => { commands.push(() => this.zadd(...args)); return pipeline; },
      zremrangebyrank: (...args) => { commands.push(() => this.zremrangebyrank(...args)); return pipeline; },
      expire: (...args) => { commands.push(() => this.expire(...args)); return pipeline; },
      exec: async () => Promise.all(commands.map((command) => command()))
    };
    return pipeline;
  }

  async zadd(_key, entry) {
    this.entries = this.entries.filter((item) => item.member !== entry.member);
    this.entries.push({ score: Number(entry.score), member: entry.member });
    this.entries.sort((a, b) => a.score - b.score);
  }

  async zremrangebyscore(_key, minimum, maximum) {
    this.entries = this.entries.filter((item) => item.score < Number(minimum) || item.score > Number(maximum));
  }

  async zremrangebyrank(_key, start, end) {
    const resolvedEnd = end < 0 ? this.entries.length + end : end;
    if (resolvedEnd < start) return;
    this.entries.splice(start, resolvedEnd - start + 1);
  }

  async expire(_key, seconds) {
    this.expirySeconds = Number(seconds);
  }

  async zrange(_key, start, end, options = {}) {
    const entries = options.rev ? [...this.entries].reverse() : [...this.entries];
    return entries.slice(start, end + 1).map((entry) => entry.member);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
