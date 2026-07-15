const fs = require("fs");
const path = require("path");
const { createFitnetApi } = require("../lib/api-core");
const { createMockLlmServices } = require("../lib/mock-llm-services");

const root = path.join(__dirname, "..");
const storageDir = path.join(root, "tmp", "api-validation");
fs.rmSync(storageDir, { recursive: true, force: true });
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const meals = JSON.parse(fs.readFileSync(path.join(root, "data", "meal_library.json"), "utf8"));
let turnstileVerified = false;
const services = createMockLlmServices({ exercises, meals });
services.turnstileRequired = true;
services.turnstileSiteKey = "test-site-key";
services.verifyTurnstile = async ({ token, remoteIp }) => {
  turnstileVerified = token === "test-turnstile-token" && remoteIp === "127.0.0.1";
  return { success: turnstileVerified };
};

const api = createFitnetApi({
  storageDir,
  pdfDir: path.join(root, "output", "pdf"),
  tmpDir: path.join(root, "tmp", "api-validation-pdfs"),
  runJobsInline: true,
  services
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function call(method, pathname, body = {}) {
  const result = await Promise.resolve(api.handleApiRequest({
    method,
    pathname,
    body,
    headers: {
      "user-agent": "fitnet-phase-8-validator",
      "x-forwarded-for": "127.0.0.1"
    }
  }));

  if (result.status >= 400) {
    throw new Error(`${method} ${pathname} failed: ${JSON.stringify(result.body)}`);
  }

  return result.body;
}

async function pollStatus(sessionId) {
  for (let index = 0; index < 20; index += 1) {
    const status = await call("GET", `/api/generation/status/${sessionId}`);
    if (["ready", "partial_ready", "failed", "timed_out", "blocked"].includes(status.status)) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("status polling timed out");
}

async function main() {
const securityConfig = await call("GET", "/api/security/config");
assert(securityConfig.turnstile.required, "security config should require Turnstile");
assert(securityConfig.turnstile.site_key === "test-site-key", "security config should expose only the public site key");
const session = await call("POST", "/api/generation/session");
const sessionId = session.session_id;

await call("POST", "/api/generation/goal", {
  session_id: sessionId,
  goal: "Lose Weight"
});

await call("POST", "/api/generation/profile", {
  session_id: sessionId,
  profile: {
    gender: "Male",
    age_range: "25-34",
    height_range: "175-184 cm",
    weight_range: "80-94 kg",
    experience: "Intermediate"
  }
});

await call("POST", "/api/generation/plan-type", {
  session_id: sessionId,
  plan_type: "Workout + Nutrition"
});

await call("POST", "/api/generation/workout-inputs", {
  session_id: sessionId,
  workout: {
    days: "4",
    duration: "60 minutes",
    place: "Gym",
    split: "Upper/Lower",
    focusAreas: ["Back", "Chest"],
    equipment: ["Dumbbells", "Barbell", "Cable machine", "Machines", "Bench"],
    injuries: ["None"],
    dislikedExercises: []
  }
});

await call("POST", "/api/generation/nutrition-inputs", {
  session_id: sessionId,
  nutrition: {
    meals: "4",
    activityLevel: "Lightly active",
    safetyFlags: ["None"],
    dietStyle: "High Protein",
    restrictions: ["None"],
    allergies: ["None"],
    cookingTime: "Moderate",
    budget: "Medium",
    preferences: ["Chicken", "Rice"]
  }
});

await call("POST", "/api/generation/start", {
  session_id: sessionId,
  turnstile_token: "test-turnstile-token"
});
assert(turnstileVerified, "generation should verify Turnstile before starting");
const start = await pollStatus(sessionId);
assert(start.status === "ready", "inline job should finish ready");
assert(start.pdf_ready, "status should report a generated PDF");

const status = await call("GET", `/api/generation/status/${sessionId}`);
assert(status.status === "ready", "status endpoint should return ready");
assert(/^[a-f0-9]{12}$/.test(status.debug_log?.nutrition_library_revision || ""), "debug log is missing the active nutrition library revision");

const preview = await call("GET", `/api/generation/preview/${sessionId}`);
assert(preview.preview.goal === "Lose Weight", "preview should include goal");
assert(preview.preview.workout.days === 4, "preview should include workout day count");
assert(preview.preview.nutrition.daily_totals.calories > 0, "preview should include nutrition totals");
assert(preview.preview.nutrition.daily_calorie_target > 0, "preview should include the calculated calorie target");
assert(preview.preview.nutrition.average_daily_calories > 0, "preview should include average planned calories");
assert(!preview.preview.workout.plan_days, "preview must not expose the full workout plan");
assert(!preview.preview.nutrition.nutrition_days, "preview must not expose the full nutrition plan");

const access = await call("POST", "/api/generation/access", {
  session_id: sessionId,
  name: "Test User",
  email: "person@example.com",
  consent: true,
  captcha: "FITNET",
  website: ""
});
assert(access.status === "email_sent", "access endpoint should simulate an email send");
assert(access.download_url.startsWith("/api/download/dl_"), "access endpoint should return signed download URL");
assert(Array.isArray(access.download_urls), "access endpoint should return download_urls");
assert(access.download_urls.length === 2, "combined plans should return separate workout and nutrition download URLs");
assert(access.download_urls.some((item) => item.kind === "workout"), "download_urls should include workout PDF");
assert(access.download_urls.some((item) => item.kind === "nutrition"), "download_urls should include nutrition PDF");

const download = await Promise.resolve(api.handleApiRequest({
  method: "GET",
  pathname: access.download_url,
  headers: {}
}));
assert(download.status === 200, "download endpoint should return 200");
assert(Buffer.isBuffer(download.body), "download body should be a PDF buffer");
assert(download.body.slice(0, 4).toString("utf8") === "%PDF", "download should return PDF content");

fs.rmSync(storageDir, { recursive: true, force: true });
fs.rmSync(path.join(root, "tmp", "api-validation-pdfs"), { recursive: true, force: true });
fs.rmSync(path.join(root, "output", "pdf", `fitnet-${sessionId}.pdf`), { force: true });

console.log(
  JSON.stringify(
    {
      status: "valid",
      session_id: sessionId,
      endpoints_checked: 11,
      download_url_shape: "/api/download/:token",
      pdf_bytes: download.body.length,
      nutrition_library_revision_debugged: true
    },
    null,
    2
  )
);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
