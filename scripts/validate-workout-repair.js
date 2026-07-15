const fs = require("fs");
const path = require("path");
const { createFitnetApi } = require("../lib/api-core");
const { createMockLlmServices } = require("../lib/mock-llm-services");
const { withRetryContext } = require("../lib/production-services");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const meals = JSON.parse(fs.readFileSync(path.join(root, "data", "meal_library.json"), "utf8"));

async function main() {
  const success = await runRepairScenario("repair-success", false);
  assert(success.status.status === "ready", `Repaired workout did not finish ready: ${success.status.status}`);
  assert(success.calls.length === 2, `Successful repair used ${success.calls.length} attempts`);
  assert(success.calls[1].validationErrors.some((error) => error.startsWith("quality:score_below_threshold")), "Repair did not receive score failure");
  assert(success.calls[1].previousJson, "Repair did not receive previous JSON");
  assert(success.status.debug_log.workout.maximum_attempts === 2, "Workout attempt limit is not two");
  assert(success.status.debug_log.workout.accepted_attempt === 2, "Second attempt was not accepted");

  const exhausted = await runRepairScenario("repair-exhausted", true);
  assert(exhausted.status.status === "failed", `Exhausted repair should fail, received ${exhausted.status.status}`);
  assert(exhausted.calls.length === 2, `Exhausted repair used ${exhausted.calls.length} attempts`);
  assert(exhausted.status.debug_log.workout.attempts.length === 2, "Debug log does not contain exactly two workout attempts");
  assert(exhausted.status.debug_log.workout.final_status === "validation_failed", "Exhausted repair final status mismatch");

  const durationFallback = await runDurationFallbackScenario();
  assert(durationFallback.status.status === "ready", `Validated duration fallback did not finish ready: ${durationFallback.status.status}`);
  assert(durationFallback.calls === 2, `Duration fallback used ${durationFallback.calls} attempts`);
  assert(durationFallback.status.debug_log.workout.fallback_used === true, "Duration fallback was not recorded");
  assert(
    durationFallback.status.debug_log.workout.fallback_reason === "model_selection_exceeded_session_duration",
    "Duration fallback reason was not recorded"
  );
  assert(durationFallback.status.plan_statuses.workout === "ready", "Duration fallback did not mark the workout ready");

  const repairPrompt = withRetryContext(
    { prompt_version: "workout_program_v3_1", user: "BASE", system: "SYSTEM" },
    ["quality:score_below_threshold:78:85", "quality:score_reason:exercise_coaching_depth", "quality:rest_outside_safe_range:day1_slot1"],
    { program_version: "fitnet.workout.output.v3" }
  );
  assert(repairPrompt.user.includes("preserve every valid field"), "Repair prompt does not preserve valid work");
  assert(repairPrompt.user.includes("Repair only the identified failures"), "Repair prompt is not targeted");
  assert(repairPrompt.user.includes("repair_actions"), "Repair prompt lacks compact actions");
  assert(!repairPrompt.user.includes("from scratch"), "Repair prompt still requests a full redesign");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        repair_policy_version: "workout_targeted_repair_v1",
        maximum_workout_attempts: 2,
        successful_repair_attempts: success.calls.length,
        exhausted_repair_attempts: exhausted.calls.length,
        score_feedback_received: true,
        previous_json_received: true,
        targeted_prompt_checked: true,
        validated_duration_fallback_checked: true
      },
      null,
      2
    )
  );
}

async function runDurationFallbackScenario() {
  const label = "repair-duration-fallback";
  const storageDir = path.join(root, "tmp", label, "api");
  const pdfDir = path.join(root, "tmp", label, "pdf");
  const tmpDir = path.join(root, "tmp", label, "payloads");
  fs.rmSync(path.join(root, "tmp", label), { recursive: true, force: true });
  const base = createMockLlmServices({ exercises, meals });
  let calls = 0;
  const services = {
    ...base,
    async selectWorkoutPlanV3(args) {
      calls += 1;
      const response = await base.selectWorkoutPlanV3(args);
      const overloadedDay = response.plan.plan_days.find((day) => day.day_index === 4);
      for (const exercise of overloadedDay.exercises) {
        if (exercise.exercise_category === "cardio") {
          exercise.reps = "7 min";
        } else {
          exercise.sets = 4;
          exercise.rest = "120 sec";
        }
      }
      return response;
    }
  };
  const api = createFitnetApi({ storageDir, pdfDir, tmpDir, runJobsInline: true, services, exposeDebug: true });

  const session = await call(api, "POST", "/api/generation/session");
  await call(api, "POST", "/api/generation/goal", { session_id: session.session_id, goal: "Lose Weight" });
  await call(api, "POST", "/api/generation/profile", {
    session_id: session.session_id,
    profile: { gender: "Male", birth_date: "1995-08-08", height_cm: "170", weight_kg: "80", experience: "Intermediate" }
  });
  await call(api, "POST", "/api/generation/plan-type", { session_id: session.session_id, plan_type: "Workout Only" });
  await call(api, "POST", "/api/generation/workout-inputs", {
    session_id: session.session_id,
    workout: { days: "5", duration: "30 minutes", place: "Full Equipment Gym", split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
  });
  await call(api, "POST", "/api/generation/start", { session_id: session.session_id });
  const status = await poll(api, session.session_id);
  fs.rmSync(path.join(root, "tmp", label), { recursive: true, force: true });
  return { status, calls };
}

async function runRepairScenario(label, alwaysInvalid) {
  const storageDir = path.join(root, "tmp", label, "api");
  const pdfDir = path.join(root, "tmp", label, "pdf");
  const tmpDir = path.join(root, "tmp", label, "payloads");
  fs.rmSync(path.join(root, "tmp", label), { recursive: true, force: true });
  const base = createMockLlmServices({ exercises, meals });
  const calls = [];
  const services = {
    ...base,
    async selectWorkoutPlanV3(args) {
      calls.push({ validationErrors: [...(args.validationErrors || [])], previousJson: args.previousJson });
      const response = await base.selectWorkoutPlanV3(args);
      if (alwaysInvalid || calls.length === 1) response.plan = makeShallow(response.plan);
      return response;
    }
  };
  const api = createFitnetApi({
    storageDir,
    pdfDir,
    tmpDir,
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
  fs.rmSync(path.join(root, "tmp", label), { recursive: true, force: true });
  return { status, calls };
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
  const response = await Promise.resolve(api.handleApiRequest({ method, pathname, body, headers: { "user-agent": "fitnet-repair-validator", "x-forwarded-for": "127.0.0.1" } }));
  if (response.status >= 400) throw new Error(`${method} ${pathname} failed: ${JSON.stringify(response.body)}`);
  return response.body;
}

async function poll(api, sessionId) {
  for (let index = 0; index < 60; index += 1) {
    const status = await call(api, "GET", `/api/generation/status/${sessionId}`);
    if (["ready", "failed", "partial_ready", "timed_out", "blocked"].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Repair validation polling timed out");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
