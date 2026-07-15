const fs = require("fs");
const path = require("path");
const {
  createSecurityState,
  validateGenerationRequest,
  validateLeadSubmission,
  consumeSecurityEvents
} = require("../lib/security-guards");

const root = path.join(__dirname, "..");
const policy = JSON.parse(fs.readFileSync(path.join(root, "data", "security-policy.json"), "utf8"));
const testPolicy = { ...policy, captcha: { ...policy.captcha, enabled: true } };

function memoryStorage() {
  const store = {};
  return {
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = String(value);
    }
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let now = 1000000;
const state = createSecurityState(testPolicy, memoryStorage(), () => now);

const firstGeneration = validateGenerationRequest(state, { fingerprint: "browser-a" });
assert(firstGeneration.allowed, "first generation should be allowed");

const duplicateGeneration = validateGenerationRequest(state, { fingerprint: "browser-a" });
assert(!duplicateGeneration.allowed && duplicateGeneration.reason === "duplicate_generation_debounced", "duplicate generation should debounce");

now += policy.limits.duplicate_generation_window_ms + 1;
for (let index = 0; index < policy.limits.generation_attempts_per_hour - 1; index += 1) {
  const attempt = validateGenerationRequest(state, { fingerprint: "browser-a" });
  assert(attempt.allowed, `generation attempt ${index + 2} should be allowed`);
  now += policy.limits.duplicate_generation_window_ms + 1;
}

const limitedGeneration = validateGenerationRequest(state, { fingerprint: "browser-a" });
assert(!limitedGeneration.allowed && limitedGeneration.reason === "generation_rate_limited", "generation rate limit should trigger");

let dailyNow = 2000000;
const dailyState = createSecurityState(testPolicy, memoryStorage(), () => dailyNow);
for (let index = 0; index < policy.limits.generation_attempts_per_day; index += 1) {
  const attempt = validateGenerationRequest(dailyState, { fingerprint: "browser-daily" });
  assert(attempt.allowed, `daily generation attempt ${index + 1} should be allowed`);
  dailyNow += policy.limits.duplicate_generation_window_ms + 1;
  if ((index + 1) % policy.limits.generation_attempts_per_hour === 0) {
    dailyNow += 60 * 60 * 1000;
  }
}
const dailyLimitedGeneration = validateGenerationRequest(dailyState, { fingerprint: "browser-daily" });
assert(
  !dailyLimitedGeneration.allowed && dailyLimitedGeneration.reason === "generation_daily_rate_limited",
  "daily generation rate limit should trigger"
);

const disposable = validateLeadSubmission(state, {
  name: "Test User",
  email: "person@mailinator.com",
  consent: true,
  captcha: "FITNET",
  honeypot: ""
});
assert(!disposable.allowed && disposable.reason === "disposable_email_blocked", "disposable email should be blocked");

const captchaFailed = validateLeadSubmission(state, {
  name: "Test User",
  email: "person@example.com",
  consent: true,
  captcha: "wrong",
  honeypot: ""
});
assert(!captchaFailed.allowed && captchaFailed.reason === "captcha_failed", "captcha should fail");

const honeypot = validateLeadSubmission(state, {
  name: "Test User",
  email: "person@example.com",
  consent: true,
  captcha: "FITNET",
  honeypot: "https://spam.example"
});
assert(!honeypot.allowed && honeypot.reason === "honeypot_triggered", "honeypot should fail");

const lead = validateLeadSubmission(state, {
  name: "Test User",
  email: "person@example.com",
  consent: true,
  captcha: "FITNET",
  honeypot: ""
});
assert(lead.allowed, "valid lead should be allowed");

const offState = createSecurityState({ ...testPolicy, llm_generation_enabled: false }, memoryStorage(), () => now);
const killed = validateGenerationRequest(offState, { fingerprint: "browser-b" });
assert(!killed.allowed && killed.reason === "generation_kill_switch", "kill switch should block generation");

const events = [
  ...consumeSecurityEvents(state),
  ...consumeSecurityEvents(dailyState),
  ...consumeSecurityEvents(offState)
];
const eventTypes = events.map((event) => event.event_type);

for (const expected of [
  "generation_allowed",
  "duplicate_generation_debounced",
  "generation_rate_limited",
  "generation_daily_rate_limited",
  "disposable_email_blocked",
  "captcha_failed",
  "honeypot_triggered",
  "lead_allowed",
  "generation_kill_switch"
]) {
  assert(eventTypes.includes(expected), `missing security event ${expected}`);
}

console.log(
  JSON.stringify(
    {
      status: "valid",
      checked_events: eventTypes.length,
      blocked_domains: policy.blocked_disposable_email_domains.length,
      generation_limit: policy.limits.generation_attempts_per_hour,
      daily_generation_limit: policy.limits.generation_attempts_per_day,
      email_limit: policy.limits.email_submissions_per_day
    },
    null,
    2
  )
);
