const fs = require("fs");
const path = require("path");
const { createFitnetApi } = require("../lib/api-core");
const { createMockLlmServices } = require("../lib/mock-llm-services");
const { readableSplit } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const meals = JSON.parse(fs.readFileSync(path.join(root, "data", "meal_library.json"), "utf8"));

async function main() {
  const calorieBoundary = await testCalorieBoundary();
  const providerFailure = await testNonRetryableProviderFailure();
  const splitCanonicalization = await testSplitCanonicalization();
  const arabicLanguagePipeline = await testArabicWorkoutLanguagePipeline();
  const arabicNutritionSafetyLocalization = await testArabicNutritionSafetyLocalization();

  console.log(JSON.stringify({
    status: "passed",
    calorie_boundary: calorieBoundary,
    provider_failure: providerFailure,
    split_canonicalization: splitCanonicalization,
    arabic_language_pipeline: arabicLanguagePipeline,
    arabic_nutrition_safety_localization: arabicNutritionSafetyLocalization
  }, null, 2));
}

async function testArabicNutritionSafetyLocalization() {
  const base = createMockLlmServices({ exercises, meals });
  let localizationCalls = 0;
  let localizedTemperatureCount = 0;
  const services = {
    ...base,
    async localizePlanToArabic(payload) {
      localizationCalls += 1;
      const localized = JSON.parse(JSON.stringify(payload));
      for (const day of localized.nutrition_plan.days) {
        for (const meal of day.meals) {
          const steps = Array.isArray(meal.cooking_method) ? meal.cooking_method : [meal.cooking_method];
          meal.cooking_method = steps.map((step) => String(step)
            .replace(/74\s*(?:degrees?\s*)?c\b/gi, () => { localizedTemperatureCount += 1; return "٧٤ درجة مئوية"; })
            .replace(/71\s*(?:degrees?\s*)?c\b/gi, () => { localizedTemperatureCount += 1; return "٧١ درجة مئوية"; })
            .replace(/63\s*(?:degrees?\s*)?c\b/gi, () => { localizedTemperatureCount += 1; return "٦٣ درجة مئوية"; }));
        }
      }
      return localized;
    }
  };
  const { api, cleanup } = createScenario("generation-boundary-arabic-nutrition-safety", services);
  const sessionId = await createSession(api, "Nutrition Only", "ar");
  await call(api, "POST", "/api/generation/nutrition-inputs", {
    session_id: sessionId,
    nutrition: { meals: "3", dietStyle: "High Protein", restrictions: ["None"], allergies: ["Eggs"], cookingTime: "Flexible", budget: "Flexible", preferences: ["Chicken", "Beef", "Fish"], foodsToAvoid: ["Eggs", "Spicy food"] }
  });
  await call(api, "POST", "/api/generation/start", { session_id: sessionId });
  const status = await poll(api, sessionId);
  assert(status.status === "ready", `Arabic nutrition localization failed after canonical validation: ${status.error || status.status}`);
  assert(localizationCalls === 1, `Arabic nutrition localizer ran ${localizationCalls} times`);
  assert(localizedTemperatureCount > 0, "Arabic nutrition test did not localize any safe-temperature instruction");
  cleanup();
  return {
    canonical_validation: "passed_before_localization",
    localized_temperature_instructions: localizedTemperatureCount,
    final_status: status.status
  };
}

async function testArabicWorkoutLanguagePipeline() {
  const base = createMockLlmServices({ exercises, meals });
  const selectorLanguages = [];
  let localizationCalls = 0;
  let exerciseNamesPreserved = false;
  const services = {
    ...base,
    async selectWorkoutPlanV3(args) {
      selectorLanguages.push(args.language);
      return base.selectWorkoutPlanV3(args);
    },
    async localizePlanToArabic(payload) {
      localizationCalls += 1;
      const localized = JSON.parse(JSON.stringify(payload));
      const before = payload.workout_plan.plan_days.flatMap((day) => day.exercises.map((exercise) => exercise.exercise_name));
      localized.workout_plan.program_summary.coaching_rationale = "خطة أسبوعية مخصصة لهدف المستخدم وجدوله وخبرته.";
      const after = localized.workout_plan.plan_days.flatMap((day) => day.exercises.map((exercise) => exercise.exercise_name));
      exerciseNamesPreserved = JSON.stringify(before) === JSON.stringify(after);
      return localized;
    }
  };
  const { api, cleanup } = createScenario("generation-boundary-arabic-language", services);
  const sessionId = await createSession(api, "Workout Only", "ar");
  await call(api, "POST", "/api/generation/workout-inputs", {
    session_id: sessionId,
    workout: { days: "4", duration: "45 minutes", place: "Full Equipment Gym", split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
  });
  await call(api, "POST", "/api/generation/start", { session_id: sessionId });
  const status = await poll(api, sessionId);
  const promptPayload = JSON.parse(status.debug_log.workout.user_prompt);
  assert(status.status === "ready", `Arabic workout pipeline did not finish ready: ${status.status}`);
  assert(selectorLanguages.length === 1 && selectorLanguages[0] === "en", `Workout selector received languages: ${selectorLanguages.join(",")}`);
  assert(promptPayload.output_language === "English", `Workout prompt requested ${promptPayload.output_language}`);
  assert(status.debug_log.workout.system_prompt.includes("user-facing coaching field in English"), "Workout system prompt was not canonical English");
  assert(status.debug_log.language_pipeline.requested_language === "ar", "Requested Arabic language was not preserved");
  assert(status.debug_log.language_pipeline.workout_generation_language === "en", "Canonical workout language was not recorded");
  assert(status.debug_log.language_pipeline.final_localization_language === "ar", "Arabic final localization was not recorded");
  assert(localizationCalls === 1, `Arabic localizer ran ${localizationCalls} times`);
  assert(exerciseNamesPreserved, "Arabic localization changed English exercise names");
  cleanup();
  return {
    requested_language: "ar",
    workout_generation_language: selectorLanguages[0],
    localization_calls: localizationCalls,
    exercise_names_preserved: exerciseNamesPreserved
  };
}

async function testSplitCanonicalization() {
  const supportedSplits = {
    full_body_2: "Full Body A / Full Body B",
    upper_lower_full_body_3: "Upper / Lower / Full Body",
    upper_lower_ab_4: "Upper A / Lower A / Upper B / Lower B",
    ppl_upper_lower_5: "Push / Pull / Legs / Upper / Lower",
    ppl_x2_6: "Push / Pull / Legs repeated"
  };
  for (const [split, label] of Object.entries(supportedSplits)) {
    assert(readableSplit(split) === label, `Canonical label mismatch for ${split}`);
  }
  const base = createMockLlmServices({ exercises, meals });
  let calls = 0;
  const services = {
    ...base,
    async selectWorkoutPlanV3(args) {
      calls += 1;
      const response = await base.selectWorkoutPlanV3(args);
      response.plan.program_summary.split = args.normalizedInput.split;
      return response;
    }
  };
  const { api, cleanup } = createScenario("generation-boundary-split", services);
  const sessionId = await createSession(api, "Workout Only");
  await call(api, "POST", "/api/generation/workout-inputs", {
    session_id: sessionId,
    workout: { days: "4", duration: "60 minutes", place: "Full Equipment Gym", split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
  });
  await call(api, "POST", "/api/generation/start", { session_id: sessionId });
  const status = await poll(api, sessionId);
  const accepted = status.debug_log.workout.accepted_json;
  assert(status.status === "ready", `Canonical split workout did not finish ready: ${status.status}`);
  assert(calls === 1, `Split canonicalization used ${calls} model attempts`);
  assert(accepted.program_summary.split === "Upper A / Lower A / Upper B / Lower B", `Unexpected canonical split: ${accepted.program_summary.split}`);
  cleanup();
  return { supported_splits_checked: Object.keys(supportedSplits).length, model_value: "upper_lower_ab_4", canonical_value: accepted.program_summary.split, model_attempts: calls };
}

async function testCalorieBoundary() {
  const base = createMockLlmServices({ exercises, meals });
  let calls = 0;
  const services = {
    ...base,
    async selectNutritionPlanV2(args) {
      calls += 1;
      const response = await base.selectNutritionPlanV2(args);
      response.plan.days[0].meals[0].calories = 1;
      response.plan.days[0].meals[0].ingredients = [{ name: "Invented ingredient", quantity_g: 9999 }];
      return response;
    }
  };
  const { api, cleanup } = createScenario("generation-boundary-calories", services);
  const sessionId = await createSession(api, "Nutrition Only");
  await call(api, "POST", "/api/generation/nutrition-inputs", {
    session_id: sessionId,
    nutrition: { meals: "4", dietStyle: "High Protein", restrictions: ["None"], allergies: ["None"], cookingTime: "Flexible", budget: "Flexible", preferences: ["Chicken"] }
  });
  await call(api, "POST", "/api/generation/start", { session_id: sessionId });
  const status = await poll(api, sessionId);
  const attempt = status.debug_log.nutrition.attempts[0];
  const materializedMeal = attempt.normalized_json.days[0].meals[0];
  const normalizedCalories = attempt.normalized_json.days[0].daily_totals.calories;
  assert(status.status === "ready", `Backend-owned nutrition did not finish ready: ${status.status}`);
  assert(calls === 1, `Backend materialization used ${calls} model attempts`);
  assert(materializedMeal.calories > 1, "Model-authored calories reached the final plan");
  assert(!materializedMeal.ingredients.some((item) => item.name === "Invented ingredient"), "Model-authored ingredients reached the final plan");
  cleanup();
  return { model_calories_discarded: true, model_ingredients_discarded: true, normalized_calories: normalizedCalories, model_attempts: calls };
}

async function testNonRetryableProviderFailure() {
  const base = createMockLlmServices({ exercises, meals });
  let calls = 0;
  const services = {
    ...base,
    async selectWorkoutPlanV3() {
      calls += 1;
      const error = new Error("400 Invalid schema for response_format 'fitnet_workout_output_v3'");
      error.status = 400;
      throw error;
    }
  };
  const { api, cleanup } = createScenario("generation-boundary-provider", services);
  const sessionId = await createSession(api, "Workout Only");
  await call(api, "POST", "/api/generation/workout-inputs", {
    session_id: sessionId,
    workout: { days: "3", duration: "45 minutes", place: "Full Equipment Gym", split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["None"] }
  });
  await call(api, "POST", "/api/generation/start", { session_id: sessionId });
  const status = await poll(api, sessionId);
  const attempts = status.debug_log.workout.attempts;
  assert(status.status === "failed", `Provider schema failure should fail, received ${status.status}`);
  assert(calls === 1 && attempts.length === 1, `Non-retryable provider error used ${calls} calls and ${attempts.length} attempts`);
  assert(status.debug_log.workout.observability.attempts[0].outcome === "provider_error_non_retryable", "Provider error was not classified as non-retryable");
  cleanup();
  return { model_attempts: calls, retry_stopped: true };
}

function createScenario(label, services) {
  const scenarioRoot = path.join(root, "tmp", label);
  fs.rmSync(scenarioRoot, { recursive: true, force: true });
  return {
    api: createFitnetApi({ storageDir: path.join(scenarioRoot, "api"), pdfDir: path.join(scenarioRoot, "pdf"), tmpDir: path.join(scenarioRoot, "payloads"), runJobsInline: true, services, exposeDebug: true }),
    cleanup: () => fs.rmSync(scenarioRoot, { recursive: true, force: true })
  };
}

async function createSession(api, planType, language) {
  const session = await call(api, "POST", "/api/generation/session", language ? { language } : {});
  await call(api, "POST", "/api/generation/goal", { session_id: session.session_id, goal: "Lose Weight" });
  await call(api, "POST", "/api/generation/profile", { session_id: session.session_id, profile: { gender: "Male", birth_date: "2002-04-05", height_cm: "170", weight_kg: "90", experience: "Intermediate" } });
  await call(api, "POST", "/api/generation/plan-type", { session_id: session.session_id, plan_type: planType });
  return session.session_id;
}

async function call(api, method, pathname, body = {}) {
  const response = await Promise.resolve(api.handleApiRequest({ method, pathname, body, headers: { "user-agent": "fitnet-boundary-validator", "x-forwarded-for": "127.0.0.1" } }));
  if (response.status >= 400) throw new Error(`${method} ${pathname} failed: ${JSON.stringify(response.body)}`);
  return response.body;
}

async function poll(api, sessionId) {
  for (let index = 0; index < 60; index += 1) {
    const status = await call(api, "GET", `/api/generation/status/${sessionId}`);
    if (["ready", "failed", "partial_ready", "timed_out", "blocked"].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Generation boundary validation timed out");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
