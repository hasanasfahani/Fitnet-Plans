const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createFitnetApi } = require("../lib/api-core");
const { createMockLlmServices } = require("../lib/mock-llm-services");
const { validateNutritionPlanSemantics, validateWorkoutPlanSemantics } = require("../lib/generation-quality");

const root = path.join(__dirname, "..");
const runtimeRoot = path.join(root, "tmp", "generation-quality-harness");
const scenarios = readJson(path.join(root, "data", "quality-golden-scenarios.json"));
const exercises = readJson(path.join(root, "data", "exercise_library.json"));
const meals = readJson(path.join(root, "data", "meal_library.json"));
const exerciseById = new Map(exercises.map((exercise) => [Number(exercise.exercise_id), exercise]));
const python = process.env.FITNET_PYTHON || "/Users/hasanasfahani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

fs.rmSync(runtimeRoot, { recursive: true, force: true });
const api = createFitnetApi({
  storageDir: path.join(runtimeRoot, "api"),
  pdfDir: path.join(runtimeRoot, "pdf"),
  tmpDir: path.join(runtimeRoot, "payloads"),
  runJobsInline: true,
  exposeDebug: true,
  services: createMockLlmServices({ exercises, meals })
});
let scenarioSequence = 0;
let activeScenarioIp = "127.0.0.1";

async function call(method, pathname, body = {}, allowError = false) {
  const result = await Promise.resolve(api.handleApiRequest({
    method, pathname, body,
    headers: { "user-agent": "fitnet-quality-harness", "x-forwarded-for": activeScenarioIp }
  }));
  if (!allowError && result.status >= 400) throw new Error(`${method} ${pathname}: ${JSON.stringify(result.body)}`);
  return result;
}

async function generateScenario(scenario) {
  scenarioSequence += 1;
  activeScenarioIp = `127.0.1.${scenarioSequence}`;
  const session = (await call("POST", "/api/generation/session")).body;
  const id = session.session_id;
  await call("POST", "/api/generation/goal", { session_id: id, goal: scenario.goal });
  await call("POST", "/api/generation/profile", { session_id: id, profile: scenario.profile });
  await call("POST", "/api/generation/plan-type", { session_id: id, plan_type: "Workout + Nutrition" });
  await call("POST", "/api/generation/workout-inputs", { session_id: id, workout: scenario.workout });
  await call("POST", "/api/generation/nutrition-inputs", { session_id: id, nutrition: scenario.nutrition });
  await call("POST", "/api/generation/start", { session_id: id });
  const status = await pollStatus(id);
  assert(status.status === "ready", `${scenario.label} did not finish ready: ${status.error || status.status}`);
  assert(status.artifact_compatible, `${scenario.label} produced an incompatible artifact`);
  assert(status.debug_log?.generation_provenance?.build_id, `${scenario.label} is missing build provenance`);

  const stored = readJson(path.join(runtimeRoot, "api", "sessions", `${id}.json`));
  assert(validateWorkoutPlanSemantics(stored.generated_plan.workout_plan).length === 0, `${scenario.label} failed workout semantics`);
  assert(validateNutritionPlanSemantics(stored.generated_plan.nutrition_plan).length === 0, `${scenario.label} failed nutrition semantics`);
  assertWorkoutQuality(stored.generated_plan.workout_plan, scenario);
  assertNutritionQuality(stored.generated_plan.nutrition_plan, scenario.label);

  const pdfTexts = {};
  for (const item of status.download_urls) {
    const download = await call("GET", item.url);
    assert(Buffer.isBuffer(download.body) && download.body.slice(0, 4).toString() === "%PDF", `${scenario.label} ${item.kind} download is not a PDF`);
    pdfTexts[item.kind] = extractPdfText(download.body, `${id}-${item.kind}`);
  }
  assert(!/warm the (?:whey protein|almonds|greek yogurt)|cut the (?:mixed berries|berries)|spoon over almonds/i.test(pdfTexts.nutrition), `${scenario.label} PDF contains incompatible cooking language`);
  assert(!/\bhalal\b/i.test(pdfTexts.nutrition), `${scenario.label} PDF exposes internal halal wording`);
  assert(!/cooking time|\bbudget\b/i.test(pdfTexts.nutrition), `${scenario.label} PDF claims hidden nutrition personalization`);
  assert(!/injuries or pain limitations/i.test(pdfTexts.workout), `${scenario.label} PDF exposes the hidden injury question`);
  assert(/progression/i.test(pdfTexts.workout) && /safety guidance/i.test(pdfTexts.workout), `${scenario.label} workout PDF is incomplete`);
  return { id, status, stored };
}

function assertWorkoutQuality(plan, scenario) {
  const targetExercises = scenario.workout.duration.startsWith("30") ? 5
    : scenario.workout.duration.startsWith("45") ? 6
    : scenario.workout.duration.startsWith("60") ? 7 : 8;
  assert((plan.plan_days || []).length === Number(scenario.workout.days), `${scenario.label} workout day count changed`);
  for (const day of plan.plan_days || []) {
    assert((day.exercises || []).length === targetExercises, `${scenario.label} day ${day.day_index} exercise count changed`);
    if (!/Lower|Legs/.test(day.day_name) || (day.exercises || []).length < 4) continue;
    const roles = (day.exercises || [])
      .map((exercise) => exerciseById.get(Number(exercise.exercise_id))?.training_role)
      .filter(Boolean);
    const quadriceps = roles.filter((role) => ["knee_dominant", "unilateral_lower_body", "quadriceps_isolation"].includes(role)).length;
    const posterior = roles.filter((role) => ["hip_dominant", "hamstring_isolation"].includes(role)).length;
    assert(quadriceps <= 3, `${scenario.label} day ${day.day_index} has redundant quadriceps selections`);
    assert(quadriceps >= 1 && posterior >= 1, `${scenario.label} day ${day.day_index} does not train both lower-body chains`);
  }
}

function assertNutritionQuality(plan, label) {
  const target = plan.nutrition_summary.daily_macro_targets;
  const calorieTarget = plan.nutrition_summary.daily_calorie_target;
  let weeklyCalories = 0;
  for (const day of plan.days || []) {
    const totals = day.daily_totals;
    weeklyCalories += Number(totals.calories || 0);
    assert(Math.abs(totals.calories - calorieTarget) / calorieTarget <= 0.05, `${label} day ${day.day_index} calories exceed 5% tolerance`);
    assert(Math.abs(totals.carbs_g - target.carbs_g) / Math.max(1, target.carbs_g) <= 0.15, `${label} day ${day.day_index} carbohydrate target drift`);
    assert(Math.abs(totals.fat_g - target.fat_g) / Math.max(1, target.fat_g) <= 0.15, `${label} day ${day.day_index} fat target drift`);
    for (const meal of day.meals || []) {
      for (const ingredient of meal.ingredients || []) {
        if (ingredient.ingredient_role === "sauce") assert(Number(ingredient.quantity_g || 0) <= 45, `${label} contains an oversized sauce portion`);
      }
    }
  }
  const weeklyAverage = weeklyCalories / Math.max(1, (plan.days || []).length);
  assert(Math.abs(weeklyAverage - calorieTarget) / calorieTarget <= 0.05, `${label} weekly calorie average exceeds 5% tolerance`);
}

async function pollStatus(sessionId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const status = (await call("GET", `/api/generation/status/${sessionId}`)).body;
    if (["ready", "partial_ready", "failed", "timed_out", "blocked"].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out polling ${sessionId}`);
}

function extractPdfText(buffer, label) {
  const file = path.join(runtimeRoot, `${label}.pdf`);
  fs.writeFileSync(file, buffer);
  const result = spawnSync(python, ["-c", "from pypdf import PdfReader; import sys; print('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))", file], { encoding: "utf8" });
  assert(result.status === 0, result.stderr || `Could not inspect ${label}`);
  return result.stdout;
}

async function verifyStaleArtifactRejection(result) {
  const sessionPath = path.join(runtimeRoot, "api", "sessions", `${result.id}.json`);
  const stale = readJson(sessionPath);
  stale.generation_provenance.build_id = "local-obsolete";
  fs.writeFileSync(sessionPath, `${JSON.stringify(stale, null, 2)}\n`);
  const status = (await call("GET", `/api/generation/status/${result.id}`)).body;
  assert(status.artifact_compatible === false, "Stale status was not identified");
  const preview = await call("GET", `/api/generation/preview/${result.id}`, {}, true);
  assert(preview.status === 409 && preview.body.error === "stale_plan_version", "Stale preview was not rejected");
  const download = await call("GET", result.status.download_urls[0].url, {}, true);
  assert(download.status === 409 && download.body.error === "stale_plan_version", "Stale download was not rejected");
}

async function main() {
  const results = [];
  for (const scenario of scenarios) results.push(await generateScenario(scenario));
  await verifyStaleArtifactRejection(results[0]);
  console.log(JSON.stringify({
    status: "passed",
    policy: "fitnet_generation_quality_harness_v3",
    golden_scenarios: scenarios.map((scenario) => scenario.label),
    checks: ["generation_provenance", "stale_build_rejection", "workout_semantics", "lower_day_coherence", "exercise_count", "nutrition_semantics", "weekly_macro_alignment", "cooking_safety", "sauce_limits", "api_pdf_download", "hidden_input_language"]
  }, null, 2));
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function assert(condition, message) { if (!condition) throw new Error(message); }

main().catch((error) => { console.error(error); process.exit(1); });
