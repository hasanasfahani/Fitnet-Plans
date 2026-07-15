const fs = require("fs");
const path = require("path");
const { createFitnetApi } = require("../lib/api-core");
const { createMockLlmServices } = require("../lib/mock-llm-services");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const meals = JSON.parse(fs.readFileSync(path.join(root, "data", "meal_library.json"), "utf8"));

async function main() {
  const recovered = await runScenario("observability-recovered", false);
  const failed = await runScenario("observability-failed", true);

  assertObservability(recovered, "success");
  assert(recovered.repair_attempted, "Recovered scenario did not record a repair attempt");
  assert(recovered.repair_succeeded, "Recovered scenario did not record repair success");
  assert(recovered.accepted_attempt === 2, "Recovered scenario accepted the wrong attempt");
  assert(recovered.attempts[0].validation.error_categories.includes("coaching_quality"), "Quality validation category was not recorded");
  assert(recovered.attempts[1].validation_error_categories_sent.includes("coaching_quality"), "Repair input categories were not recorded");

  assertObservability(failed, "validation_failed");
  assert(failed.repair_attempted, "Failed scenario did not record a repair attempt");
  assert(!failed.repair_succeeded, "Failed scenario incorrectly recorded repair success");
  assert(failed.accepted_attempt === null, "Failed scenario recorded an accepted attempt");

  const serialized = JSON.stringify(recovered);
  assert(!serialized.includes("birth_date"), "Observability summary contains questionnaire profile data");
  assert(!serialized.includes("system_prompt"), "Observability summary contains a full system prompt");
  assert(!serialized.includes("previous_json"), "Observability summary contains generated plan JSON");

  console.log(JSON.stringify({
    status: "passed",
    observability_contract_version: recovered.contract_version,
    scenarios_checked: ["repair_recovered", "repair_exhausted"],
    metrics_checked: [
      "prompt_characters",
      "provider_latency",
      "response_characters",
      "normalization_changes",
      "validation_categories",
      "quality_score",
      "repair_outcome",
      "total_duration"
    ],
    privacy_summary_checked: true
  }, null, 2));
}

async function runScenario(label, alwaysInvalid) {
  const scenarioRoot = path.join(root, "tmp", label);
  fs.rmSync(scenarioRoot, { recursive: true, force: true });
  const base = createMockLlmServices({ exercises, meals });
  let calls = 0;
  const services = {
    ...base,
    async selectWorkoutPlanV3(args) {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 3));
      const response = await base.selectWorkoutPlanV3(args);
      if (alwaysInvalid || calls === 1) response.plan = makeShallow(response.plan);
      return response;
    }
  };
  const api = createFitnetApi({
    storageDir: path.join(scenarioRoot, "api"),
    pdfDir: path.join(scenarioRoot, "pdf"),
    tmpDir: path.join(scenarioRoot, "payloads"),
    runJobsInline: true,
    services,
    exposeDebug: true
  });

  const session = await call(api, "POST", "/api/generation/session");
  await call(api, "POST", "/api/generation/goal", { session_id: session.session_id, goal: "Build Muscle" });
  await call(api, "POST", "/api/generation/profile", {
    session_id: session.session_id,
    profile: { gender: "Male", birth_date: "2000-01-01", height_cm: "180", weight_kg: "80", experience: "Intermediate" }
  });
  await call(api, "POST", "/api/generation/plan-type", { session_id: session.session_id, plan_type: "Workout Only" });
  await call(api, "POST", "/api/generation/workout-inputs", {
    session_id: session.session_id,
    workout: { days: "3", duration: "60 minutes", place: "Full Equipment Gym", split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
  });
  await call(api, "POST", "/api/generation/start", { session_id: session.session_id });
  const status = await poll(api, session.session_id);
  const observability = status.debug_log.workout.observability;
  fs.rmSync(scenarioRoot, { recursive: true, force: true });
  return observability;
}

function assertObservability(metrics, expectedStatus) {
  assert(metrics.contract_version === "workout_generation_observability_v1", "Observability contract version mismatch");
  assert(metrics.final_status === expectedStatus, `Expected ${expectedStatus}, received ${metrics.final_status}`);
  assert(metrics.attempts.length === 2, "Observability must contain exactly two attempts for this scenario");
  assert(metrics.base_prompt_characters > 1000, "Base prompt size was not measured");
  assert(metrics.candidate_slots > 0 && metrics.candidate_records > 0, "Candidate counts were not measured");
  assert(metrics.total_duration_ms >= metrics.total_provider_latency_ms, "Total duration is below provider latency");
  for (const attempt of metrics.attempts) {
    assert(attempt.request_prompt_characters > 1000, "Attempt prompt size was not measured");
    assert(attempt.provider_latency_ms >= 1, "Provider latency was not measured");
    assert(attempt.response_characters > 100, "Response size was not measured");
    assert(typeof attempt.normalization.changed === "boolean", "Normalization summary is missing");
    assert(Array.isArray(attempt.validation.error_categories), "Validation categories are missing");
    assert(typeof attempt.validation.quality_score === "number", "Quality score is missing");
  }
}

function makeShallow(plan) {
  const copy = JSON.parse(JSON.stringify(plan));
  copy.program_summary.coaching_rationale = "Plan.";
  for (const key of Object.keys(copy.progression_guidance)) copy.progression_guidance[key] = key === "if_pain_occurs" ? "Stop." : "Okay.";
  copy.recovery_guidance = ["Rest."];
  for (const day of copy.plan_days) {
    for (const exercise of day.exercises) {
      exercise.coaching_cue = "Control.";
      exercise.effort_guidance = "Work.";
    }
  }
  return copy;
}

async function call(api, method, pathname, body = {}) {
  const response = await Promise.resolve(api.handleApiRequest({ method, pathname, body, headers: { "user-agent": "fitnet-observability-validator", "x-forwarded-for": "127.0.0.1" } }));
  if (response.status >= 400) throw new Error(`${method} ${pathname} failed: ${JSON.stringify(response.body)}`);
  return response.body;
}

async function poll(api, sessionId) {
  for (let index = 0; index < 60; index += 1) {
    const status = await call(api, "GET", `/api/generation/status/${sessionId}`);
    if (["ready", "failed", "partial_ready", "timed_out", "blocked"].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Observability validation polling timed out");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
