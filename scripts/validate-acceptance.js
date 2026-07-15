const fs = require("fs");
const path = require("path");
const { createFitnetApi } = require("../lib/api-core");
const { createMockLlmServices } = require("../lib/mock-llm-services");
const {
  generateWorkoutPlan,
  normalizeWorkoutInput,
  buildWorkoutSkeleton,
  filterCandidatesForSkeleton,
  validateWorkoutPlan,
  buildFallbackWorkoutPlan
} = require("../lib/workout-engine");
const {
  generateNutritionPlan,
  normalizeNutritionInput,
  buildNutritionSkeleton,
  filterFoodCandidates,
  validateNutritionPlan,
  buildFallbackNutritionPlan
} = require("../lib/nutrition-engine");

const root = path.join(__dirname, "..");
const storageDir = path.join(root, "tmp", "acceptance-api");
const pdfDir = path.join(root, "output", "pdf");
const tmpPdfDir = path.join(root, "tmp", "acceptance-pdfs");
const exercises = readJson(path.join(root, "data", "exercise_library.json"));
const foods = readJson(path.join(root, "data", "food_library.json"));
const meals = readJson(path.join(root, "data", "meal_library.json"));
let clock = 2000000;

fs.rmSync(storageDir, { recursive: true, force: true });
fs.rmSync(tmpPdfDir, { recursive: true, force: true });

const api = createFitnetApi({
  storageDir,
  pdfDir,
  tmpDir: tmpPdfDir,
  runJobsInline: true,
  now: () => clock,
  services: createMockLlmServices({ exercises, meals })
});

const baseProfile = {
  gender: "Female",
  age_range: "25-34",
  height_range: "165-174 cm",
  weight_range: "65-79 kg",
  experience: "Beginner"
};

const baseWorkout = {
  days: "3",
  duration: "45 minutes",
  place: "Gym",
  split: "Auto",
  focusAreas: ["Legs", "Core"],
  equipment: ["Dumbbells", "Cable machine", "Machines", "Bench"],
  injuries: ["None"],
  dislikedExercises: []
};

const baseNutrition = {
  meals: "3",
  activityLevel: "Mostly sitting",
  safetyFlags: ["None"],
  dietStyle: "Balanced",
  restrictions: ["None"],
  allergies: ["None"],
  cookingTime: "Moderate",
  budget: "Medium",
  preferences: ["Chicken", "Rice"]
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function call(method, pathname, body = {}, client = "qa") {
  const result = await Promise.resolve(api.handleApiRequest({
    method,
    pathname,
    body,
    headers: {
      "user-agent": `fitnet-acceptance-${client}`,
      "x-forwarded-for": `10.0.0.${client.length}`
    }
  }));

  if (result.status >= 400) {
    throw new Error(`${method} ${pathname} failed: ${JSON.stringify(result.body)}`);
  }

  return result.body;
}

async function callRaw(method, pathname, body = {}, client = "qa") {
  return Promise.resolve(api.handleApiRequest({
    method,
    pathname,
    body,
    headers: {
      "user-agent": `fitnet-acceptance-${client}`,
      "x-forwarded-for": `10.0.1.${client.length}`
    }
  }));
}

async function pollStatus(targetApi, sessionId) {
  for (let index = 0; index < 40; index += 1) {
    const result = await Promise.resolve(targetApi.handleApiRequest({
      method: "GET",
      pathname: `/api/generation/status/${sessionId}`,
      body: {},
      headers: {}
    }));
    if (["ready", "partial_ready", "failed", "timed_out", "blocked"].includes(result.body.status)) {
      return result.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`status polling timed out for ${sessionId}`);
}

async function runFlow({ label, goal, planType, workout = null, nutrition = null }) {
  clock += 10000;
  const session = await call("POST", "/api/generation/session", {}, label);
  const sessionId = session.session_id;

  await call("POST", "/api/generation/goal", { session_id: sessionId, goal }, label);
  await call("POST", "/api/generation/profile", { session_id: sessionId, profile: baseProfile }, label);
  await call("POST", "/api/generation/plan-type", { session_id: sessionId, plan_type: planType }, label);

  if (workout) {
    await call("POST", "/api/generation/workout-inputs", { session_id: sessionId, workout }, label);
  }

  if (nutrition) {
    await call("POST", "/api/generation/nutrition-inputs", { session_id: sessionId, nutrition }, label);
  }

  await call("POST", "/api/generation/start", { session_id: sessionId }, label);
  const start = await pollStatus(api, sessionId);
  assert(start.status === "ready", `${label}: generation should succeed`);
  assert(start.pdf_ready, `${label}: PDF should be ready`);
  assert(start.next_action === "request_access", `${label}: ready state should request access`);

  const preview = (await call("GET", `/api/generation/preview/${sessionId}`, {}, label)).preview;
  assert(preview.goal === goal, `${label}: preview should reuse selected goal`);
  assert(preview.plan_type === planType, `${label}: preview should reuse plan type`);
  assert(!JSON.stringify(preview).includes("plan_days"), `${label}: preview must not expose full workout JSON`);
  assert(!JSON.stringify(preview).includes("nutrition_days"), `${label}: preview must not expose full nutrition JSON`);

  if (planType.includes("Workout")) {
    assert(preview.workout?.days === Number(workout.days), `${label}: workout preview should include day count`);
  } else {
    assert(!preview.workout, `${label}: non-workout preview should not include workout`);
  }

  if (planType.includes("Nutrition")) {
    assert(preview.nutrition?.daily_totals?.calories > 0, `${label}: nutrition preview should include macros`);
    assert(preview.nutrition?.daily_calorie_target > 0, `${label}: nutrition preview should include the calculated calorie target`);
  } else {
    assert(!preview.nutrition, `${label}: non-nutrition preview should not include nutrition`);
  }

  let stored = readSession(sessionId);
  assert(stored.email_events.length === 0, `${label}: email must not send before access request`);
  assert(stored.generated_plan.profile.goal === goal, `${label}: generated plan should preserve goal`);

  if (stored.generated_plan.workout_plan) {
    assert(stored.generated_plan.workout_generation.normalized_input.goal === goal, `${label}: workout engine should receive goal`);
    assertWorkoutUsesApprovedExercises(stored.generated_plan.workout_plan);
  }

  if (stored.generated_plan.nutrition_plan) {
    assert(stored.generated_plan.nutrition_generation.normalized_input.goal === goal, `${label}: nutrition engine should receive goal`);
    assertNutritionUsesApprovedFoods(stored.generated_plan.nutrition_plan);
  }

  const access = await call(
    "POST",
    "/api/generation/access",
    {
      session_id: sessionId,
      name: "QA User",
      email: `${label}@example.com`,
      consent: true,
      captcha: "FITNET",
      website: ""
    },
    label
  );
  assert(access.status === "email_sent", `${label}: access should simulate email send`);
  assert(access.download_url.startsWith("/api/download/dl_"), `${label}: download URL should be tokenized`);
  assert(!access.download_url.includes("output/pdf"), `${label}: download URL must not expose raw file path`);
  assert(Array.isArray(access.download_urls), `${label}: access should return download_urls array`);
  const expectedPdfCount = planType === "Workout + Nutrition" ? 2 : 1;
  assert(access.download_urls.length === expectedPdfCount, `${label}: access should return one PDF per plan type`);
  if (planType.includes("Workout")) {
    assert(access.download_urls.some((item) => item.kind === "workout"), `${label}: workout PDF link missing`);
  }
  if (planType.includes("Nutrition")) {
    assert(access.download_urls.some((item) => item.kind === "nutrition"), `${label}: nutrition PDF link missing`);
  }

  stored = readSession(sessionId);
  assert(stored.email_events.length === 1, `${label}: email event should be stored after access`);

  const download = await Promise.resolve(api.handleApiRequest({ method: "GET", pathname: access.download_url, body: {}, headers: {} }));
  assert(download.status === 200, `${label}: signed download should succeed`);
  assert(Buffer.isBuffer(download.body), `${label}: download should return a file buffer`);
  assert(download.body.slice(0, 4).toString("utf8") === "%PDF", `${label}: download should be a PDF`);

  return sessionId;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const workoutOnly = await runFlow({
    label: "workout-only",
    goal: "Gain Strength",
    planType: "Workout Only",
    workout: { ...baseWorkout, days: "3", split: "Full Body" }
  });

  const nutritionOnly = await runFlow({
    label: "nutrition-only",
    goal: "Lose Weight",
    planType: "Nutrition Only",
    nutrition: baseNutrition
  });

  const combined = await runFlow({
    label: "combined",
    goal: "Improve Fitness",
    planType: "Workout + Nutrition",
    workout: baseWorkout,
    nutrition: baseNutrition
  });

  assertNoOpenTextQuestionnaireFields(readSession(combined));
  assertRepairAndFallbackPaths();
  await assertSpamControls();
  await assertLoadingFailureTimeoutAndRetryStates();

  cleanupGeneratedPdf(workoutOnly);
  cleanupGeneratedPdf(nutritionOnly);
  cleanupGeneratedPdf(combined);
  fs.rmSync(storageDir, { recursive: true, force: true });
  fs.rmSync(tmpPdfDir, { recursive: true, force: true });

  console.log(
    JSON.stringify(
      {
        status: "accepted",
        flows_checked: ["Workout Only", "Nutrition Only", "Workout + Nutrition"],
        acceptance_criteria_checked: 14,
        signed_downloads_checked: 3,
        spam_controls_checked: true,
        loading_states_checked: ["ready", "failed", "timed_out", "retryable"]
      },
      null,
      2
    )
  );
}

function assertRepairAndFallbackPaths() {
  const workoutInput = {
    goal: "Gain Strength",
    profile: baseProfile,
    workout: baseWorkout
  };
  const normalizedWorkout = normalizeWorkoutInput(workoutInput);
  const workoutSkeleton = buildWorkoutSkeleton(normalizedWorkout);
  const workoutCandidates = filterCandidatesForSkeleton(workoutSkeleton, normalizedWorkout, exercises);
  const invalidWorkout = {
    plan_days: [
      {
        day_index: 1,
        day_name: "Invented",
        exercises: [{ slot_id: "fake_slot", exercise_id: 999999, sets: 1, reps: [10], rest_seconds: 60, notes: null }]
      }
    ]
  };
  const invalidWorkoutValidation = validateWorkoutPlan(
    invalidWorkout,
    workoutSkeleton,
    workoutCandidates,
    normalizedWorkout
  );
  assert(!invalidWorkoutValidation.valid, "invalid workout JSON should be rejected");
  const workoutFallback = buildFallbackWorkoutPlan(workoutSkeleton, workoutCandidates);
  assert(
    validateWorkoutPlan(workoutFallback, workoutSkeleton, workoutCandidates, normalizedWorkout).valid,
    "workout fallback should produce valid output"
  );
  assert(generateWorkoutPlan(workoutInput, exercises).validation.valid, "workout engine should repair or fallback to valid output");

  const nutritionInput = {
    goal: "Lose Weight",
    profile: baseProfile,
    nutrition: baseNutrition
  };
  const normalizedNutrition = normalizeNutritionInput(nutritionInput);
  const nutritionSkeleton = buildNutritionSkeleton(normalizedNutrition);
  const nutritionCandidates = filterFoodCandidates(nutritionSkeleton, normalizedNutrition, foods);
  const invalidNutrition = {
    nutrition_days: [
      {
        day_index: 1,
        meals: [
          {
            meal_slot: "breakfast",
            meal_name: "Invented Meal",
            food_ids: [999999],
            calories: 10,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            notes: "bad"
          }
        ],
        daily_totals: { calories: 10, protein_g: 0, carbs_g: 0, fat_g: 0 }
      }
    ]
  };
  const invalidNutritionValidation = validateNutritionPlan(
    invalidNutrition,
    nutritionSkeleton,
    nutritionCandidates,
    normalizedNutrition
  );
  assert(!invalidNutritionValidation.valid, "invalid nutrition JSON should be rejected");
  const nutritionFallback = buildFallbackNutritionPlan(nutritionSkeleton, nutritionCandidates, normalizedNutrition);
  assert(
    validateNutritionPlan(nutritionFallback, nutritionSkeleton, nutritionCandidates, normalizedNutrition).valid,
    "nutrition fallback should produce valid output"
  );
  assert(generateNutritionPlan(nutritionInput, foods).validation.valid, "nutrition engine should repair or fallback to valid output");
}

async function assertSpamControls() {
  clock += 10000;
  const session = await call("POST", "/api/generation/session", {}, "spam");
  const sessionId = session.session_id;
  await call("POST", "/api/generation/goal", { session_id: sessionId, goal: "Lose Weight" }, "spam");
  await call("POST", "/api/generation/profile", { session_id: sessionId, profile: baseProfile }, "spam");
  await call("POST", "/api/generation/plan-type", { session_id: sessionId, plan_type: "Nutrition Only" }, "spam");
  await call("POST", "/api/generation/nutrition-inputs", { session_id: sessionId, nutrition: baseNutrition }, "spam");
  await call("POST", "/api/generation/start", { session_id: sessionId }, "spam");

  const duplicate = await callRaw("POST", "/api/generation/start", { session_id: sessionId }, "spam");
  assert(duplicate.status === 429, "duplicate generation should be blocked by anti-spam controls");

  clock += 10000;
  const readySession = await call("POST", "/api/generation/session", {}, "disposable");
  const readyId = readySession.session_id;
  await call("POST", "/api/generation/goal", { session_id: readyId, goal: "Lose Weight" }, "disposable");
  await call("POST", "/api/generation/profile", { session_id: readyId, profile: baseProfile }, "disposable");
  await call("POST", "/api/generation/plan-type", { session_id: readyId, plan_type: "Nutrition Only" }, "disposable");
  await call("POST", "/api/generation/nutrition-inputs", { session_id: readyId, nutrition: baseNutrition }, "disposable");
  await call("POST", "/api/generation/start", { session_id: readyId }, "disposable");
  await pollStatus(api, readyId);
  const disposable = await callRaw(
    "POST",
    "/api/generation/access",
    {
      session_id: readyId,
      name: "Blocked User",
      email: "blocked@mailinator.com",
      consent: true,
      captcha: "FITNET",
      website: ""
    },
    "disposable"
  );
  assert(disposable.status === 429, "disposable email should be blocked");

  cleanupGeneratedPdf(sessionId);
  cleanupGeneratedPdf(readyId);
}

async function assertLoadingFailureTimeoutAndRetryStates() {
  let failedClock = 5000000;
  const failingApi = createFitnetApi({
    storageDir: path.join(root, "tmp", "acceptance-failing-api"),
    pdfDir,
    tmpDir: path.join(root, "tmp", "acceptance-failing-pdfs"),
    python: "/not/a/python",
    runJobsInline: true,
    now: () => failedClock,
    services: createMockLlmServices({ exercises, meals })
  });
  const failedSession = failingApi.handleApiRequest({ method: "POST", pathname: "/api/generation/session", body: {}, headers: {} }).body;
  const failedId = failedSession.session_id;
  await postTo(failingApi, "/api/generation/goal", { session_id: failedId, goal: "Lose Weight" });
  await postTo(failingApi, "/api/generation/profile", { session_id: failedId, profile: baseProfile });
  await postTo(failingApi, "/api/generation/plan-type", { session_id: failedId, plan_type: "Nutrition Only" });
  await postTo(failingApi, "/api/generation/nutrition-inputs", { session_id: failedId, nutrition: baseNutrition });
  await postTo(failingApi, "/api/generation/start", { session_id: failedId });
  const failed = await pollStatus(failingApi, failedId);
  assert(failed.status === "failed", "loading status should expose failed jobs");
  assert(failed.retryable, "failed loading status should be retryable");
  assert(failed.next_action === "retry_generation", "failed status should point to retry");

  failedClock += 10000;
  await postTo(failingApi, "/api/generation/retry", { session_id: failedId });
  const retried = await pollStatus(failingApi, failedId);
  assert(retried.status === "failed", "retry route should restart the failed job");
  assert(retried.retryable, "retried failure should remain retryable");

  let timeoutClock = 8000000;
  const timeoutApi = createFitnetApi({
    storageDir: path.join(root, "tmp", "acceptance-timeout-api"),
    pdfDir,
    tmpDir: path.join(root, "tmp", "acceptance-timeout-pdfs"),
    runJobsInline: false,
    autoRunJobs: false,
    jobTimeoutMs: 1,
    now: () => timeoutClock
  });
  const timeoutSession = timeoutApi.handleApiRequest({ method: "POST", pathname: "/api/generation/session", body: {}, headers: {} }).body;
  const timeoutId = timeoutSession.session_id;
  await postTo(timeoutApi, "/api/generation/goal", { session_id: timeoutId, goal: "Lose Weight" });
  await postTo(timeoutApi, "/api/generation/profile", { session_id: timeoutId, profile: baseProfile });
  await postTo(timeoutApi, "/api/generation/plan-type", { session_id: timeoutId, plan_type: "Nutrition Only" });
  await postTo(timeoutApi, "/api/generation/nutrition-inputs", { session_id: timeoutId, nutrition: baseNutrition });
  await postTo(timeoutApi, "/api/generation/start", { session_id: timeoutId });
  timeoutClock += 10;
  const timedOut = timeoutApi.handleApiRequest({
    method: "GET",
    pathname: `/api/generation/status/${timeoutId}`,
    body: {},
    headers: {}
  }).body;
  assert(timedOut.status === "timed_out", "loading status should expose timeout");
  assert(timedOut.retryable, "timed-out loading status should be retryable");

  fs.rmSync(path.join(root, "tmp", "acceptance-failing-api"), { recursive: true, force: true });
  fs.rmSync(path.join(root, "tmp", "acceptance-failing-pdfs"), { recursive: true, force: true });
  fs.rmSync(path.join(root, "tmp", "acceptance-timeout-api"), { recursive: true, force: true });
  fs.rmSync(path.join(root, "tmp", "acceptance-timeout-pdfs"), { recursive: true, force: true });
}

function assertWorkoutUsesApprovedExercises(plan) {
  const approved = new Set(exercises.map((exercise) => Number(exercise.exercise_id)));
  for (const day of plan.plan_days) {
    for (const exercise of day.exercises) {
      assert(approved.has(Number(exercise.exercise_id)), `unapproved exercise id ${exercise.exercise_id}`);
    }
  }
}

function assertNutritionUsesApprovedFoods(plan) {
  if (plan.program_version === "fitnet.nutrition.output.v2") {
    const approvedMeals = new Set(meals.map((meal) => String(meal.meal_id)));
    for (const day of plan.days) {
      assert(day.meals.length > 0, "nutrition v2 day must contain meals");
      for (const meal of day.meals) {
        assert(approvedMeals.has(String(meal.meal_id)), `unapproved meal id ${meal.meal_id}`);
        assert(Array.isArray(meal.ingredients) && meal.ingredients.length > 0, `meal ${meal.meal_id} must include ingredients`);
        assert(meal.cooking_method, `meal ${meal.meal_id} must include cooking method`);
      }
    }
    assert(Array.isArray(plan.weekly_grocery_list) && plan.weekly_grocery_list.length > 0, "nutrition v2 must include weekly grocery list");
    assert(plan.repeat_instruction.includes("7-day"), "nutrition v2 must include 7-day repeat instruction");
    assert(!plan.weeks, "nutrition v2 must not include weeks");
    return;
  }

  const approved = new Set(foods.map((food) => Number(food.food_id)));
  for (const day of plan.nutrition_days) {
    for (const meal of day.meals) {
      for (const foodId of meal.food_ids) {
        assert(approved.has(Number(foodId)), `unapproved food id ${foodId}`);
      }
    }
  }
}

function assertNoOpenTextQuestionnaireFields(session) {
  const allowedChoiceKeys = ["goal", "profile", "plan_type", "workout", "nutrition"];
  for (const key of Object.keys(session.choices)) {
    assert(allowedChoiceKeys.includes(key), `unexpected questionnaire key ${key}`);
  }

  const textLikeKeys = JSON.stringify(session.choices).match(/notes|comments|free_text|description/gi) || [];
  assert(textLikeKeys.length === 0, "questionnaire should not include free-text planning fields");
}

function readSession(sessionId) {
  return readJson(path.join(storageDir, "sessions", `${sessionId}.json`));
}

async function postTo(targetApi, pathname, body) {
  const result = await Promise.resolve(targetApi.handleApiRequest({ method: "POST", pathname, body, headers: {} }));
  if (result.status >= 400) {
    throw new Error(`${pathname} failed: ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

function cleanupGeneratedPdf(sessionId) {
  fs.rmSync(path.join(pdfDir, `fitnet-${sessionId}.pdf`), { force: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
