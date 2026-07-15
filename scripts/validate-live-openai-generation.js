const fs = require("fs");
const path = require("path");
const { createFitnetApi } = require("../lib/api-core");
const { createProductionServices } = require("../lib/production-services");
const { validateNutritionPlanSemantics, validateWorkoutPlanSemantics } = require("../lib/generation-quality");

const root = path.join(__dirname, "..");
const runtimeRoot = path.join(root, "tmp", "live-openai-release-gate");
const scenario = JSON.parse(fs.readFileSync(path.join(root, "data", "quality-golden-scenarios.json"), "utf8"))[0];
const production = createProductionServices();

if (!production.hasOpenAI) {
  console.error("OPENAI_API_KEY is required for the opt-in live release gate.");
  process.exit(1);
}

fs.rmSync(runtimeRoot, { recursive: true, force: true });
const services = {
  usesAsync: true,
  model: production.model,
  hasOpenAI: true,
  selectWorkoutPlanV3: production.selectWorkoutPlanV3,
  selectNutritionPlanV2: production.selectNutritionPlanV2
};
const api = createFitnetApi({
  storageDir: path.join(runtimeRoot, "api"),
  pdfDir: path.join(runtimeRoot, "pdf"),
  tmpDir: path.join(runtimeRoot, "payloads"),
  runJobsInline: true,
  exposeDebug: true,
  services
});

async function call(method, pathname, body = {}) {
  const result = await Promise.resolve(api.handleApiRequest({
    method, pathname, body,
    headers: { "user-agent": "fitnet-live-release-gate", "x-forwarded-for": "127.0.0.240" }
  }));
  if (result.status >= 400) throw new Error(`${method} ${pathname}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function main() {
  const session = await call("POST", "/api/generation/session");
  const id = session.session_id;
  await call("POST", "/api/generation/goal", { session_id: id, goal: scenario.goal });
  await call("POST", "/api/generation/profile", { session_id: id, profile: scenario.profile });
  await call("POST", "/api/generation/plan-type", { session_id: id, plan_type: "Workout + Nutrition" });
  await call("POST", "/api/generation/workout-inputs", { session_id: id, workout: scenario.workout });
  await call("POST", "/api/generation/nutrition-inputs", { session_id: id, nutrition: scenario.nutrition });
  await call("POST", "/api/generation/start", { session_id: id });

  const status = await poll(id);
  assert(status.status === "ready", status.error || `Live generation ended ${status.status}`);
  assert(status.artifact_compatible, "Live generation produced an incompatible artifact");
  const stored = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "api", "sessions", `${id}.json`), "utf8"));
  assert(validateWorkoutPlanSemantics(stored.generated_plan.workout_plan).length === 0, "Live workout failed semantic validation");
  assert(validateNutritionPlanSemantics(stored.generated_plan.nutrition_plan).length === 0, "Live nutrition failed semantic validation");
  for (const download of status.download_urls) {
    const response = await callRaw("GET", download.url);
    assert(Buffer.isBuffer(response.body) && response.body.slice(0, 4).toString() === "%PDF", `${download.kind} PDF download failed`);
  }

  console.log(JSON.stringify({
    status: "passed",
    policy: "fitnet_live_openai_release_gate_v1",
    model: production.model,
    scenario: scenario.label,
    workout_attempts: stored.generated_plan.workout_generation?.attempts,
    nutrition_attempts: stored.generated_plan.nutrition_generation?.attempts,
    pdfs: status.download_urls.map((item) => item.kind)
  }, null, 2));
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
}

async function poll(id) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const status = await call("GET", `/api/generation/status/${id}`);
    if (["ready", "partial_ready", "failed", "timed_out", "blocked"].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Live generation polling timed out");
}

async function callRaw(method, pathname) {
  const result = await Promise.resolve(api.handleApiRequest({ method, pathname, headers: {} }));
  if (result.status >= 400) throw new Error(`${method} ${pathname}: ${JSON.stringify(result.body)}`);
  return result;
}

function assert(condition, message) { if (!condition) throw new Error(message); }
main().catch((error) => { console.error(error); process.exit(1); });
