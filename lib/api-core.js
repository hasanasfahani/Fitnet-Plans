const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { generateWorkoutPlan, generateWorkoutPlanV2, generateWorkoutPlanV3, validateWorkoutPlanV2, validateWorkoutPlanV3, readableSplit, normalizeWorkoutDuplicateSelections } = require("./workout-engine");
const { generateNutritionPlan, generateNutritionPlanV2, validateNutritionPlanV2, materializeNutritionSelectionV2, assessNutritionEligibility } = require("./nutrition-engine");
const {
  canonicalizeWorkoutPlan,
  canonicalizeWorkoutPlanV2,
  canonicalizeWorkoutPlanV3,
  canonicalizeNutritionPlan,
  canonicalizeNutritionPlanV2,
  buildWorkoutSelectionPromptV2,
  buildWorkoutSelectionPromptV3,
  buildNutritionSelectionPromptV2,
  validateWorkoutContract,
  validateNutritionContract
} = require("./plan-contracts");
const {
  createSecurityState,
  validateGenerationRequest,
  validateLeadSubmission,
  consumeSecurityEvents
} = require("./security-guards");
const {
  contentRevision,
  buildGenerationProvenance,
  compareProvenance,
  validateRecipeSemantics,
  validateNutritionPlanSemantics,
  validateWorkoutPlanSemantics
} = require("./generation-quality");

const DEFAULT_ROOT = path.join(__dirname, "..");
const DEFAULT_PYTHON =
  process.env.FITNET_PYTHON ||
  "/Users/hasanasfahani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const PDF_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_JOB_TIMEOUT_MS = Number(process.env.FITNET_JOB_TIMEOUT_MS || 5 * 60 * 1000);
const MAX_LLM_ATTEMPTS = Number(process.env.FITNET_LLM_ATTEMPTS || 3);
const WORKOUT_LLM_ATTEMPTS = Math.min(2, Math.max(1, Number(process.env.FITNET_WORKOUT_LLM_ATTEMPTS || 2)));
const CANONICAL_WORKOUT_LANGUAGE = "en";

function createFitnetApi(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const dataDir = path.join(root, "data");
  const storageDir = options.storageDir || path.join(root, "output", "api");
  const pdfDir = options.pdfDir || path.join(root, "output", "pdf");
  const tmpDir = options.tmpDir || path.join(root, "tmp", "api-pdfs");
  const python = options.python || DEFAULT_PYTHON;
  const runJobsInline = Boolean(options.runJobsInline);
  const autoRunJobs = options.autoRunJobs !== false;
  const now = options.now || (() => Date.now());
  const jobTimeoutMs = options.jobTimeoutMs || DEFAULT_JOB_TIMEOUT_MS;
  const services = options.services || null;
  const exposeDebug = options.exposeDebug !== undefined ? Boolean(options.exposeDebug) : process.env.NODE_ENV !== "production";
  const persistSessions = options.persistSessions !== false;
  const pdfSigningSecret = String(options.pdfSigningSecret || process.env.PDF_SIGNING_SECRET || (process.env.NODE_ENV === "production" ? "" : "fitnet-local-pdf-secret"));

  let libraries = {
    exercises: readJson(path.join(dataDir, "exercise_library.json")),
    foods: readJson(path.join(dataDir, "food_library.json")),
    ingredients: readJson(path.join(dataDir, "ingredient_library.json")),
    meals: readJson(path.join(dataDir, "meal_library.json")),
    securityPolicy: readJson(path.join(dataDir, "security-policy.json"))
  };
  const nutritionLibraryPaths = {
    ingredients: path.join(dataDir, "ingredient_library.json"),
    meals: path.join(dataDir, "meal_library.json")
  };
  let nutritionLibraryMtimes = nutritionLibraryModificationTimes();
  let nutritionLibraryRevision = validateAndRevisionNutritionLibraries(libraries.meals, libraries.ingredients);
  const exerciseLibraryRevision = contentRevision(libraries.exercises);
  const securityPolicy = options.securityPolicy || libraries.securityPolicy;
  const securityState = createSecurityState(securityPolicy, memoryStorage(), now);

  if (persistSessions) {
    ensureDir(path.join(storageDir, "sessions"));
    ensureDir(path.join(storageDir, "tokens"));
    ensureDir(path.join(storageDir, "events"));
    ensureDir(pdfDir);
  }

  function handleApiRequest({ method, pathname, body = {}, headers = {} }) {
    try {
      if (method === "GET" && pathname === "/api/health") {
        refreshNutritionLibrariesIfChanged();
        return jsonResponse(200, {
          status: "ok",
          generation_provenance: activeGenerationProvenance()
        });
      }
      if (method === "GET" && pathname === "/api/security/config") {
        return jsonResponse(200, {
          turnstile: {
            required: Boolean(services?.turnstileRequired),
            site_key: services?.turnstileSiteKey || ""
          }
        });
      }
      if (method === "POST" && pathname === "/api/generation/session") {
        return jsonResponse(201, createSession(headers, body));
      }
      if (method === "POST" && pathname === "/api/generate") {
        return maybeJsonResponse(200, generateStatelessPlan(body, headers, { enforceSecurity: true }));
      }

      const sessionPost = pathname.match(/^\/api\/generation\/(goal|profile|plan-type|workout-inputs|nutrition-inputs)$/);
      if (method === "POST" && sessionPost) {
        return jsonResponse(200, updateSessionSection(body.session_id, sessionPost[1], body));
      }

      if (method === "POST" && pathname === "/api/generation/start") {
        return maybeJsonResponse(202, startGeneration(body.session_id, headers, body.turnstile_token));
      }

      if (method === "POST" && pathname === "/api/generation/retry") {
        return jsonResponse(202, retryGeneration(body.session_id, headers));
      }

      const statusMatch = pathname.match(/^\/api\/generation\/status\/([^/]+)$/);
      if (method === "GET" && statusMatch) {
        return jsonResponse(200, getStatus(statusMatch[1]));
      }

      const previewMatch = pathname.match(/^\/api\/generation\/preview\/([^/]+)$/);
      if (method === "GET" && previewMatch) {
        return jsonResponse(200, getPreview(previewMatch[1]));
      }

      if (method === "POST" && pathname === "/api/generation/access") {
        return maybeJsonResponse(200, requestAccess(body));
      }

      const downloadMatch = pathname.match(/^\/api\/download\/([^/]+)$/);
      if (method === "GET" && downloadMatch) {
        return downloadPlan(downloadMatch[1]);
      }

      return jsonResponse(404, { error: "not_found" });
    } catch (error) {
      const status = error.status_code || 500;
      return jsonResponse(status, {
        error: error.code || "api_error",
        message: error.message
      });
    }
  }

  function createSession(headers = {}, body = {}) {
    const session = {
      session_id: crypto.randomUUID(),
      status: "draft",
      loading_state: "Not started",
      created_at: new Date(now()).toISOString(),
      updated_at: new Date(now()).toISOString(),
      fingerprint: fingerprintFromHeaders(headers),
      language: normalizeLanguage(body.language),
      choices: {
        goal: null,
        profile: null,
        plan_type: null,
        workout: null,
        nutrition: null
      },
      generation_attempts: [],
      security_events: [],
      email_events: [],
      generation_provenance: null
    };

    saveSession(session);
    return publicSession(session);
  }

  async function generateStatelessPlan(body = {}, headers = {}, generationOptions = {}) {
    const session = {
      session_id: crypto.randomUUID(),
      status: "generating",
      loading_state: "Generating plans",
      created_at: new Date(now()).toISOString(),
      updated_at: new Date(now()).toISOString(),
      fingerprint: fingerprintFromHeaders(headers),
      language: normalizeLanguage(body.language),
      choices: {
        goal: body.goal || null,
        profile: body.profile || null,
        plan_type: body.plan_type || body.planType || null,
        workout: body.workout || null,
        nutrition: body.nutrition || null
      },
      generation_attempts: [],
      security_events: [],
      email_events: [],
      generation_provenance: null
    };

    ensureGenerationInputs(session);
    if (generationOptions.enforceSecurity !== false) {
      const guard = validateGenerationRequest(securityState, { fingerprint: session.fingerprint });
      if (!guard.allowed) throw apiError(429, guard.reason, securityMessage(guard.reason));
      if (services?.turnstileRequired) {
        const verification = await services.verifyTurnstile?.({
          token: body.turnstile_token,
          remoteIp: remoteIpFromHeaders(headers)
        });
        if (!verification?.success) {
          throw apiError(403, "turnstile_failed", "Please complete the security check and try again.");
        }
      }
    }
    if (!services?.usesAsync) {
      throw apiError(503, "llm_not_configured", "LLM provider is not configured.");
    }

    const generated = await generatePlansWithProviders(session);
    if (!hasAnyGeneratedPlan(generated)) {
      throw apiError(422, "generation_failed", generationFailureMessage(generated));
    }
    if (!pdfSigningSecret) {
      throw apiError(503, "pdf_signing_not_configured", "PDF downloads are temporarily unavailable.");
    }

    const partial = hasFailedRequestedPlan(generated);
    return {
      session_id: session.session_id,
      status: partial ? "partial_ready" : "ready",
      preview: buildPreview(session, generated),
      plan_statuses: generated.plan_statuses || {},
      plan_errors: generated.plan_errors || {},
      failed_plan_kinds: failedPlanKinds(generated),
      pdf_downloads: buildStatelessPdfDownloads(session, generated)
    };
  }

  function buildStatelessPdfDownloads(session, generated) {
    const expiresAt = new Date(now() + 30 * 60 * 1000).toISOString();
    return [
      generated.workout_plan ? { kind: "workout", label: "Workout Program" } : null,
      generated.nutrition_plan ? { kind: "nutrition", label: "Nutrition Plan" } : null
    ].filter(Boolean).map(({ kind, label }) => {
      const envelope = {
        version: "fitnet.stateless-pdf.v1",
        expires_at: expiresAt,
        profile: generated.profile,
        plan_type: kind === "workout" ? "Workout Only" : "Nutrition Only",
        language: generated.language || session.language,
        prompt_version: generated.prompt_version,
        workout_plan: kind === "workout" ? generated.workout_plan : null,
        nutrition_plan: kind === "nutrition" ? generated.nutrition_plan : null
      };
      const payload = Buffer.from(JSON.stringify(envelope)).toString("base64url");
      const signature = crypto.createHmac("sha256", pdfSigningSecret).update(payload).digest("hex");
      return { kind, label, payload, signature, expires_at: expiresAt };
    });
  }

  function updateSessionSection(sessionId, section, body) {
    const session = requireSession(sessionId);
    const key = {
      goal: "goal",
      profile: "profile",
      "plan-type": "plan_type",
      "workout-inputs": "workout",
      "nutrition-inputs": "nutrition"
    }[section];

    session.choices[key] = extractSectionPayload(section, body);
    touch(session);
    saveSession(session);
    return publicSession(session);
  }

  async function startGeneration(sessionId, headers = {}, turnstileToken = "", options = {}) {
    const session = requireSession(sessionId);
    ensureGenerationInputs(session);
    prepareSessionForGeneration(session);

    const guard = validateGenerationRequest(securityState, {
      fingerprint: session.fingerprint || fingerprintFromHeaders(headers)
    });
    collectSecurity(session);

    if (!guard.allowed) {
      session.status = "blocked";
      session.loading_state = "Generation blocked";
      session.generation_attempts.push(attemptEvent("blocked", guard.reason));
      touch(session);
      saveSession(session);
      throw apiError(429, guard.reason, securityMessage(guard.reason));
    }

    if (services?.turnstileRequired && !options.skipTurnstile) {
      const verification = await services.verifyTurnstile?.({
        token: turnstileToken,
        remoteIp: remoteIpFromHeaders(headers)
      });
      if (!verification?.success) {
        session.status = "blocked";
        session.loading_state = "Generation blocked";
        session.generation_attempts.push(attemptEvent("blocked", "turnstile_failed"));
        touch(session);
        await saveSession(session);
        throw apiError(403, "turnstile_failed", "Please complete the security check and try again.");
      }
    }

    session.status = "queued";
    session.loading_state = "Analyzing your answers";
    session.job_started_at = new Date(now()).toISOString();
    session.job_timeout_at = new Date(now() + jobTimeoutMs).toISOString();
    session.generation_attempts.push(attemptEvent("queued", "generation_start"));
    touch(session);
    saveSession(session);

    if (runJobsInline) {
      const job = processGenerationJob(session.session_id);
      if (job && typeof job.catch === "function") {
        job.catch(() => {});
      }
    } else if (autoRunJobs) {
      setTimeout(() => {
        const job = processGenerationJob(session.session_id);
        if (job && typeof job.catch === "function") {
          job.catch(() => {});
        }
      }, 10);
    }

    return getStatus(session.session_id);
  }

  function retryGeneration(sessionId, headers = {}) {
    const session = requireSession(sessionId);
    refreshTimedOutSession(session);

    if (!["failed", "timed_out", "partial_ready"].includes(session.status)) {
      throw apiError(409, "retry_not_available", "Only failed, partial, or timed-out sessions can be retried.");
    }

    if (session.status === "partial_ready") {
      session.generation_attempts.push(attemptEvent("retrying", "manual_partial_retry"));
      touch(session);
      saveSession(session);
      return retryFailedPlanKinds(session.session_id);
    }

    session.generation_attempts.push(attemptEvent("retrying", "manual_retry"));
    touch(session);
    saveSession(session);
    return startGeneration(session.session_id, headers, "", { skipTurnstile: true });
  }

  function getStatus(sessionId) {
    const session = requireSession(sessionId);
    refreshTimedOutSession(session);
    const compatibility = sessionCompatibility(session);

    return {
      session_id: session.session_id,
      status: session.status,
      language: session.language || "ar",
      loading_state: session.loading_state,
      preview_ready: Boolean(session.preview),
      pdf_ready: hasReadyPdf(session),
      download_urls: session.download_tokens || [],
      generation_events: session.generation_attempts || [],
      error: session.error || null,
      retryable: ["failed", "timed_out", "partial_ready"].includes(session.status),
      failed_plan_kinds: session.failed_plan_kinds || [],
      plan_statuses: session.plan_statuses || null,
      debug_log: exposeDebug ? session.generation_debug || null : null,
      artifact_compatible: compatibility.compatible,
      compatibility_errors: exposeDebug ? compatibility.reasons : [],
      timeout_at: session.job_timeout_at || null,
      next_action: nextActionForStatus(session.status),
      updated_at: session.updated_at
    };
  }

  function getPreview(sessionId) {
    const session = requireSession(sessionId);
    requireCompatibleArtifact(session);
    if (!session.preview) {
      throw apiError(409, "preview_not_ready", "Plan preview is not ready yet.");
    }

    return {
      session_id: session.session_id,
      status: session.status,
      language: session.language || "ar",
      preview: session.preview,
      download_urls: session.download_tokens || [],
      failed_plan_kinds: session.failed_plan_kinds || [],
      plan_statuses: session.plan_statuses || null,
      debug_log: exposeDebug ? session.generation_debug || null : null
    };
  }

  function requestAccess(body) {
    if (services?.sendPlanEmail) {
      return requestAccessWithProviders(body);
    }

    const session = requireSession(body.session_id);
    requireCompatibleArtifact(session);
    if (session.status !== "ready" || !hasReadyPdf(session)) {
      throw apiError(409, "plan_not_ready", "The PDF is not ready yet.");
    }

    const guard = validateLeadSubmission(securityState, {
      name: body.name,
      email: body.email,
      consent: Boolean(body.consent),
      captcha: body.captcha,
      honeypot: body.website || body.honeypot || ""
    });
    collectSecurity(session);

    if (!guard.allowed) {
      touch(session);
      saveSession(session);
      throw apiError(429, guard.reason, securityMessage(guard.reason));
    }

    const tokens = createDownloadTokens(session);
    const primaryToken = tokens[0];
    const lead = {
      name: String(body.name || "").trim(),
      email: String(body.email || "").trim().toLowerCase(),
      consent: Boolean(body.consent),
      created_at: new Date(now()).toISOString()
    };
    const emailEvent = {
      event_type: "simulated_sent",
      provider: "local",
      recipient_hash: stableHash(lead.email),
      download_url: `/api/download/${primaryToken.token}`,
      download_urls: tokens.map(tokenToDownloadEntry),
      created_at: new Date(now()).toISOString()
    };

    session.lead = lead;
    session.access_token_id = primaryToken.token;
    session.email_events.push(emailEvent);
    touch(session);
    saveSession(session);

    return {
      session_id: session.session_id,
      status: "email_sent",
      download_url: emailEvent.download_url,
      download_urls: emailEvent.download_urls,
      expires_at: primaryToken.expires_at
    };
  }

  function downloadPlan(tokenValue) {
    const token = readToken(tokenValue);
    if (!token) {
      return jsonResponse(404, { error: "invalid_token" });
    }

    if (now() > Date.parse(token.expires_at)) {
      return jsonResponse(410, { error: "token_expired" });
    }

    const session = requireSession(token.session_id);
    requireCompatibleArtifact(session);
    const pdfPath = token.pdf_kind && session.pdfs?.[token.pdf_kind]?.path
      ? session.pdfs[token.pdf_kind].path
      : session.pdf_path;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return jsonResponse(404, { error: "pdf_not_found" });
    }

    return {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${path.basename(pdfPath)}"`
      },
      body: fs.readFileSync(pdfPath)
    };
  }

  function processGenerationJob(sessionId) {
    if (!services?.usesAsync) {
      const session = requireSession(sessionId);
      session.status = "failed";
      session.loading_state = "Generation failed";
      session.error = "LLM provider is not configured. Please connect OpenAI and try again.";
      session.failed_plan_kinds = requestedPlanKinds(session.choices.plan_type);
      session.plan_statuses = Object.fromEntries(session.failed_plan_kinds.map((kind) => [kind, "failed"]));
      session.generation_debug = buildBaseDebugLog(session, {
        final_status: "llm_failed",
        error_message: session.error,
        model: "not_configured"
      });
      session.generation_attempts.push(attemptEvent("failed", "llm_not_configured", session.error));
      touch(session);
      saveSession(session);
      return;
    }

    if (services?.usesAsync) {
      return processGenerationJobWithProviders(sessionId);
    }

    const session = requireSession(sessionId);

    try {
      session.status = "generating";
      session.loading_state = "Generating coach strategy";
      session.job_started_at = session.job_started_at || new Date(now()).toISOString();
      session.job_timeout_at = session.job_timeout_at || new Date(now() + jobTimeoutMs).toISOString();
      recordGenerationStep(session, "started", "local_generation_started");
      touch(session);
      saveSession(session);

      const generated = generatePlans(session);
      assertGeneratedPlanSemantics(generated);
      session.generated_plan = generated;
      session.generation_provenance = activeGenerationProvenance();
      session.preview = buildPreview(session, generated);

      session.status = "rendering_pdf";
      session.loading_state = "Preparing your downloads";
      recordGenerationStep(session, "rendering", "pdf_render_started");
      touch(session);
      saveSession(session);

      session.pdf_path = renderPdf(session, generated);
      session.pdfs = renderPlanPdfs(session, generated);
      session.download_tokens = createDownloadTokens(session).map(tokenToDownloadEntry);
      session.status = "ready";
      session.loading_state = "Plans ready";
      session.error = null;
      session.generation_attempts.push(attemptEvent("succeeded", "pdf_ready"));
      touch(session);
      saveSession(session);
    } catch (error) {
      session.status = "failed";
      session.loading_state = "Generation failed";
      session.error = error.message;
      session.generation_attempts.push(attemptEvent("failed", error.code || "generation_failed", error.message));
      touch(session);
      saveSession(session);
    }
  }

  async function processGenerationJobWithProviders(sessionId) {
    const session = requireSession(sessionId);

    try {
      session.status = "generating";
      session.loading_state = "Generating coach strategy";
      session.job_started_at = session.job_started_at || new Date(now()).toISOString();
      session.job_timeout_at = session.job_timeout_at || new Date(now() + jobTimeoutMs).toISOString();
      recordGenerationStep(session, "started", "provider_generation_started");
      touch(session);
      saveSession(session);

      const generated = await generatePlansWithProviders(session);
      session.generated_plan = generated;
      session.generation_provenance = activeGenerationProvenance();
      session.generation_debug = generated.debug_log || null;

      if (!hasAnyGeneratedPlan(generated)) {
        session.status = "failed";
        session.loading_state = "Generation failed";
        session.error = generationFailureMessage(generated);
        session.failed_plan_kinds = failedPlanKinds(generated);
        session.plan_statuses = generated.plan_statuses || {};
        session.generation_attempts.push(attemptEvent("failed", "llm_generation_failed", session.error));
        touch(session);
        await saveSession(session);
        return;
      }

      session.preview = buildPreview(session, generated);

      session.status = "rendering_pdf";
      session.loading_state = "Preparing your downloads";
      recordGenerationStep(session, "rendering", "pdf_render_started");
      touch(session);
      saveSession(session);

      session.pdfs = renderPlanPdfs(session, generated);
      session.pdf_path = session.pdfs.workout?.path || session.pdfs.nutrition?.path || renderPdf(session, generated);
      if (services.uploadPdf) {
        session.pdf_blobs = {};
        for (const [kind, pdf] of Object.entries(session.pdfs)) {
          const pdfBuffer = fs.readFileSync(pdf.path);
          session.pdf_blobs[kind] = await services.uploadPdf({
            sessionId: session.session_id,
            kind,
            buffer: pdfBuffer
          });
        }
        session.pdf_blob = session.pdf_blobs.workout || session.pdf_blobs.nutrition || null;
      }
      session.download_tokens = createDownloadTokens(session).map(tokenToDownloadEntry);

      const partial = hasFailedRequestedPlan(generated);
      session.status = partial ? "partial_ready" : "ready";
      session.loading_state = partial ? "Some plans are ready" : "Plans ready";
      session.error = partial ? generationFailureMessage(generated) : null;
      session.failed_plan_kinds = failedPlanKinds(generated);
      session.plan_statuses = generated.plan_statuses || {};
      session.generation_attempts.push(attemptEvent("succeeded", "pdf_ready"));
      touch(session);
      await saveSession(session);
      await safeServiceCall(() => services.saveGeneratedPlan?.(session));
    } catch (error) {
      session.status = "failed";
      session.loading_state = "Generation failed";
      session.error = error.message;
      session.generation_attempts.push(attemptEvent("failed", error.code || "generation_failed", error.message));
      touch(session);
      await saveSession(session);
    }
  }

  function prepareSessionForGeneration(session) {
    session.status = "draft";
    session.loading_state = "Not started";
    session.error = null;
    session.preview = null;
    session.generated_plan = null;
    session.pdf_path = null;
    session.pdfs = null;
    session.pdf_blobs = null;
    session.download_tokens = null;
    session.job_started_at = null;
    session.job_timeout_at = null;
    session.generation_provenance = activeGenerationProvenance();
  }

  function refreshTimedOutSession(session) {
    const timeoutAt = session.job_timeout_at ? Date.parse(session.job_timeout_at) : null;
    const canTimeout = ["queued", "generating", "rendering_pdf"].includes(session.status);

    if (canTimeout && timeoutAt && now() > timeoutAt) {
      session.status = "timed_out";
      session.loading_state = "Generation timed out";
      session.error = "The generation job took too long.";
      session.generation_attempts.push(attemptEvent("timed_out", "job_timeout"));
      touch(session);
      saveSession(session);
    }
  }

  function generatePlans(session) {
    refreshNutritionLibrariesIfChanged();
    const profile = buildProfile(session);
    const planType = session.choices.plan_type;
    const output = {
      profile,
      plan_type: planType,
      language: session.language,
      prompt_version: "api_generation_v1"
    };

    if (includesWorkout(planType)) {
      const workout = generateWorkoutPlanV3(
        {
          goal: session.choices.goal,
          profile,
          workout: session.choices.workout
        },
        libraries.exercises
      );
      const workoutPlan = canonicalizeWorkoutPlanV3(workout.plan);
      const workoutContract = validateWorkoutPlanV3(workoutPlan, workout.skeleton, workout.candidate_map, workout.normalized_input, workout.coaching_strategy);
      if (!workout.strategy_validation?.valid || !workout.candidate_validation?.valid || !workout.validation.valid || !workoutContract.valid) {
        throw apiError(422, "workout_validation_failed", [
          ...(workout.strategy_validation?.errors || []),
          ...(workout.candidate_validation?.errors || []),
          ...workout.validation.errors,
          ...workoutContract.errors
        ].join(", "));
      }

      output.workout_plan = workoutPlan;
      output.workout_generation = summarizeGeneration(workout, workoutContract);
    }

    if (includesNutrition(planType)) {
      const nutrition = generateNutritionPlanV2(
        {
          goal: session.choices.goal,
          profile,
          nutrition: session.choices.nutrition
        },
        libraries.meals,
        { ingredientLibrary: libraries.ingredients }
      );
      const nutritionPlan = canonicalizeNutritionPlanV2(nutrition.plan);
      const nutritionContract = validateNutritionPlanV2(nutritionPlan, nutrition.skeleton, nutrition.candidate_map, nutrition.normalized_input, libraries.meals, libraries.ingredients);
      if (!nutrition.validation.valid || !nutritionContract.valid) {
        throw apiError(422, "nutrition_validation_failed", [...nutrition.validation.errors, ...nutritionContract.errors].join(", "));
      }

      output.nutrition_plan = nutritionPlan;
      output.nutrition_generation = summarizeGeneration(nutrition, nutritionContract);
    }

    return output;
  }

  async function generatePlansWithProviders(session) {
    refreshNutritionLibrariesIfChanged();
    const profile = buildProfile(session);
    const planType = session.choices.plan_type;
    const output = {
      profile,
      plan_type: planType,
      language: session.language,
      prompt_version: "api_generation_openai_v1",
      model_name: services.model || process.env.OPENAI_MODEL || "configured-openai-model",
      llm_raw_json: {},
      plan_statuses: {},
      plan_errors: {},
      debug_log: buildBaseDebugLog(session, {
        model: services.model || process.env.OPENAI_MODEL || "configured-openai-model",
        final_status: "started",
        nutrition_library_revision: nutritionLibraryRevision,
        language_pipeline: {
          requested_language: session.language,
          workout_generation_language: CANONICAL_WORKOUT_LANGUAGE,
          final_localization_language: session.language === "ar" ? "ar" : null
        }
      })
    };

    if (includesWorkout(planType)) {
      recordGenerationStep(session, "workout_started", "workout_skeleton_started");
      const workout = generateWorkoutPlanV3(
        {
          goal: session.choices.goal,
          profile,
          workout: session.choices.workout
        },
        libraries.exercises
      );
      recordGenerationStep(session, "workout_local_ready", "workout_skeleton_ready");
      const prompt = buildWorkoutSelectionPromptV3({
        normalizedInput: workout.normalized_input,
        coachingStrategy: workout.coaching_strategy,
        skeleton: workout.skeleton,
        candidateMap: workout.candidate_map,
        language: CANONICAL_WORKOUT_LANGUAGE
      });
      if (!workout.strategy_validation?.valid) {
        throw apiError(422, "workout_strategy_invalid", workout.strategy_validation.errors.join(", "));
      }
      if (!workout.candidate_validation?.valid) {
        throw apiError(422, "workout_candidates_invalid", workout.candidate_validation.errors.join(", "));
      }
      const result = await generateLlmPlanWithRetries({
        kind: "workout",
        session,
        selector: services.selectWorkoutPlanV3,
        normalizedInput: workout.normalized_input,
        coachingStrategy: workout.coaching_strategy,
        skeleton: workout.skeleton,
        candidateMap: workout.candidate_map,
        language: CANONICAL_WORKOUT_LANGUAGE,
        prompt,
        candidateDebug: workoutCandidateDebug(workout.candidate_map),
        candidateDiagnostics: workout.candidate_diagnostics,
        maxAttempts: WORKOUT_LLM_ATTEMPTS,
        normalizePlan: (plan) => normalizeWorkoutPlanForValidation(plan, workout.skeleton, workout.candidate_map, workout.normalized_input),
        validate: (plan) => validateWorkoutPlanV3(plan, workout.skeleton, workout.candidate_map, workout.normalized_input, workout.coaching_strategy)
      });

      const useDurationFallback = canUseValidatedWorkoutDurationFallback(workout, result);
      output.debug_log.workout = useDurationFallback
        ? {
            ...result.debug,
            fallback_used: true,
            fallback_reason: "model_selection_exceeded_session_duration",
            fallback_validation: workout.validation
          }
        : result.debug;
      output.plan_statuses.workout = result.valid || useDurationFallback ? "ready" : "failed";
      if (result.valid) {
        output.workout_plan = result.plan;
        output.workout_generation = {
          ...summarizeGeneration({ ...workout, status: "openai_valid" }, result.validation),
          provider: "openai",
          attempts: result.attempts.length
        };
        output.llm_raw_json.workout = result.attempts[result.attempts.length - 1]?.raw || null;
      } else if (useDurationFallback) {
        output.workout_plan = workout.plan;
        output.workout_generation = {
          ...summarizeGeneration({ ...workout, status: "validated_duration_fallback" }, workout.validation),
          provider: "validated_local_fallback",
          attempts: result.attempts.length,
          fallback_reason: "model_selection_exceeded_session_duration"
        };
        output.llm_raw_json.workout = result.attempts[result.attempts.length - 1]?.raw || null;
        recordGenerationStep(session, "workout_fallback_ready", "workout_validated_duration_fallback_ready");
      } else {
        output.plan_errors.workout = result.error;
      }
    }

    if (includesNutrition(planType)) {
      recordGenerationStep(session, "nutrition_started", "nutrition_skeleton_started");
      const nutrition = generateNutritionPlanV2(
        {
          goal: session.choices.goal,
          profile,
          nutrition: session.choices.nutrition
        },
        libraries.meals
      );
      recordGenerationStep(session, "nutrition_local_ready", "nutrition_skeleton_ready");
      const prompt = buildNutritionSelectionPromptV2({
        normalizedInput: nutrition.normalized_input,
        skeleton: nutrition.skeleton,
        candidateMap: nutrition.candidate_map,
        language: session.language
      });
      const result = await generateLlmPlanWithRetries({
        kind: "nutrition",
        session,
        selector: services.selectNutritionPlanV2,
        normalizedInput: nutrition.normalized_input,
        skeleton: nutrition.skeleton,
        candidateMap: nutrition.candidate_map,
        language: session.language,
        prompt,
        candidateDebug: nutritionCandidateDebug(nutrition.candidate_map),
        maxAttempts: MAX_LLM_ATTEMPTS,
        normalizePlan: (selection) => materializeNutritionSelectionV2(
          selection,
          nutrition.skeleton,
          nutrition.candidate_map,
          nutrition.normalized_input,
          libraries.meals,
          libraries.ingredients
        ),
        validate: (plan) => validateNutritionPlanV2(plan, nutrition.skeleton, nutrition.candidate_map, nutrition.normalized_input, libraries.meals, libraries.ingredients)
      });

      output.debug_log.nutrition = result.debug;
      output.plan_statuses.nutrition = result.valid ? "ready" : "failed";
      if (result.valid) {
        output.nutrition_plan = result.plan;
        output.nutrition_generation = {
          ...summarizeGeneration({ ...nutrition, status: "openai_valid" }, result.validation),
          provider: "openai",
          attempts: result.attempts.length
        };
        output.llm_raw_json.nutrition = result.attempts[result.attempts.length - 1]?.raw || null;
      } else {
        output.plan_errors.nutrition = result.error;
      }
    }

    output.debug_log.final_status = hasFailedRequestedPlan(output)
      ? hasAnyGeneratedPlan(output) ? "partial_success" : "validation_failed"
      : "success";
    output.debug_log.plan_statuses = output.plan_statuses;
    output.debug_log.plan_errors = output.plan_errors;

    // Recipe and workout semantic rules validate the canonical generated prose.
    // Run them before localization so English-only safety patterns do not reject
    // an otherwise equivalent Arabic translation. The localization service's
    // protected-value restore keeps IDs, numbers, arrays, and object shape intact.
    assertGeneratedPlanSemantics(output);

    if (session.language === "ar" && typeof services.localizePlanToArabic === "function" && hasAnyGeneratedPlan(output)) {
      recordGenerationStep(session, "arabic_localization_started", "arabic_plan_localization_started");
      const localized = await services.localizePlanToArabic({
        workout_plan: output.workout_plan || null,
        nutrition_plan: output.nutrition_plan || null
      });
      output.workout_plan = localized.workout_plan || output.workout_plan;
      output.nutrition_plan = localized.nutrition_plan || output.nutrition_plan;
      recordGenerationStep(session, "arabic_localization_ready", "arabic_plan_localization_ready");
    }
    return output;
  }

  async function generateLlmPlanWithRetries({
    kind,
    session,
    selector,
    normalizedInput,
    coachingStrategy,
    skeleton,
    candidateMap,
    language,
    prompt,
    candidateDebug,
    candidateDiagnostics,
    maxAttempts = MAX_LLM_ATTEMPTS,
    normalizePlan,
    validate
  }) {
    const generationStartedAt = Date.now();
    const attempts = [];
    const debug = {
      normalized_input: normalizedInput,
      coaching_strategy: coachingStrategy || null,
      skeleton,
      candidates_by_slot: candidateDebug,
      candidate_filter_diagnostics: candidateDiagnostics || null,
      prompt_version: prompt.prompt_version || null,
      prompt_response_format: prompt.response_format || null,
      maximum_attempts: maxAttempts,
      observability: {
        contract_version: `${kind}_generation_observability_v1`,
        started_at: new Date(generationStartedAt).toISOString(),
        base_prompt_characters: promptCharacterCount(prompt),
        candidate_slots: Object.keys(candidateMap || {}).length,
        candidate_records: Object.values(candidateMap || {}).reduce((total, candidates) => total + (candidates?.length || 0), 0),
        attempts: []
      },
      system_prompt: prompt.system,
      user_prompt: prompt.user,
      attempts
    };

    if (typeof selector !== "function") {
      return {
        valid: false,
        attempts,
        debug: {
          ...debug,
          final_status: "llm_failed",
          error: "LLM provider is not configured."
        },
        error: "LLM provider is not configured."
      };
    }

    let validationErrors = [];
    let previousJson = null;
    for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
      recordGenerationStep(session, `${kind}_openai_started`, `${kind}_openai_attempt_${attemptIndex}_started`);
      const attempt = {
        attempt: attemptIndex,
        validation_errors_sent: validationErrors,
        raw: null,
        parsed_json: null,
        validation: null,
        error: null
      };
      const attemptStartedAt = Date.now();
      const attemptMetrics = {
        attempt: attemptIndex,
        attempt_type: attemptIndex === 1 ? "initial" : "targeted_repair",
        validation_error_categories_sent: categorizeValidationErrors(validationErrors),
        request_prompt_characters: null,
        provider_latency_ms: null,
        response_characters: 0,
        normalization: { changed: false, changed_field_count: 0, changed_paths: [] },
        validation: null,
        outcome: "started"
      };
      attempts.push(attempt);
      debug.observability.attempts.push(attemptMetrics);

      try {
        const selected = await selector.call(services, {
          normalizedInput,
          coachingStrategy,
          skeleton,
          candidateMap,
          language,
          validationErrors,
          previousJson
        });
        attemptMetrics.provider_latency_ms = Date.now() - attemptStartedAt;
        attemptMetrics.request_prompt_characters = promptCharacterCount(selected?.raw?.prompt || prompt);
        attemptMetrics.response_characters = responseCharacterCount(selected);
        attemptMetrics.token_usage = selected?.raw?.usage || null;
        attemptMetrics.malformed_json_repaired = Boolean(selected?.raw?.repaired_malformed_json);
        attempt.raw = selected?.raw || null;
        attempt.parsed_json = selected?.plan || null;

        if (!selected?.plan) {
          validationErrors = [`${kind}:missing_llm_plan`];
          attempt.validation = { valid: false, errors: validationErrors };
          attemptMetrics.validation = validationMetrics(attempt.validation);
          attemptMetrics.outcome = "missing_plan";
        } else {
          const normalizedPlan = typeof normalizePlan === "function" ? normalizePlan(selected.plan) : selected.plan;
          attemptMetrics.normalization = summarizeNormalization(selected.plan, normalizedPlan);
          if (normalizedPlan !== selected.plan) {
            attempt.normalized_json = normalizedPlan;
          }
          const validation = validate(normalizedPlan);
          attempt.validation = validation;
          attemptMetrics.validation = validationMetrics(validation);
          if (validation.valid) {
            attemptMetrics.outcome = "accepted";
            debug.observability = finalizeGenerationObservability(debug.observability, generationStartedAt, attemptIndex, "success");
            recordGenerationStep(session, `${kind}_openai_valid`, `${kind}_openai_attempt_${attemptIndex}_validated`);
            return {
              valid: true,
              plan: normalizedPlan,
              validation,
              attempts,
              debug: {
                ...debug,
                final_status: "success",
                accepted_attempt: attemptIndex,
                accepted_json: normalizedPlan
              }
            };
          }
          validationErrors = validation.errors || [`${kind}:validation_failed`];
          attemptMetrics.outcome = "rejected_validation";
          previousJson = kind === "nutrition" ? selected.plan : normalizedPlan;
        }

        recordGenerationStep(session, `${kind}_openai_rejected`, `${kind}_openai_attempt_${attemptIndex}_failed_validation`, validationErrors.join(", "));
      } catch (error) {
        attemptMetrics.provider_latency_ms ??= Date.now() - attemptStartedAt;
        attempt.error = error.message;
        validationErrors = [`${kind}:llm_error:${error.message}`];
        attemptMetrics.validation = validationMetrics({ valid: false, errors: validationErrors });
        attemptMetrics.outcome = "provider_error";
        recordGenerationStep(session, `${kind}_openai_error`, `${kind}_openai_attempt_${attemptIndex}_error`, error.message);
        if (isNonRetryableProviderError(error)) {
          attemptMetrics.outcome = "provider_error_non_retryable";
          break;
        }
      }
    }

    debug.observability = finalizeGenerationObservability(debug.observability, generationStartedAt, null, "validation_failed");

    return {
      valid: false,
      attempts,
      debug: {
        ...debug,
        final_status: "validation_failed",
        final_validation_errors: validationErrors,
        rejected_json: previousJson
      },
      error: validationErrors.join(", ") || `${kind} generation failed validation.`
    };
  }

  function buildBaseDebugLog(session, extra = {}) {
    return {
      session_id: session.session_id,
      timestamp: new Date(now()).toISOString(),
      environment: process.env.NODE_ENV || "development",
      plan_type: session.choices.plan_type,
      goal: session.choices.goal,
      raw_questionnaire_input: session.choices,
      retry_count: (session.generation_attempts || []).filter((event) => event.reason === "manual_retry" || event.reason === "manual_partial_retry").length,
      nutrition_library_revision: nutritionLibraryRevision,
      generation_provenance: activeGenerationProvenance(),
      ...extra
    };
  }

  function nutritionLibraryModificationTimes() {
    return Object.fromEntries(Object.entries(nutritionLibraryPaths).map(([key, filePath]) => [key, fs.statSync(filePath).mtimeMs]));
  }

  function refreshNutritionLibrariesIfChanged() {
    if (process.env.NODE_ENV === "production") return;
    const current = nutritionLibraryModificationTimes();
    if (current.meals === nutritionLibraryMtimes.meals && current.ingredients === nutritionLibraryMtimes.ingredients) return;
    const meals = readJson(nutritionLibraryPaths.meals);
    const ingredients = readJson(nutritionLibraryPaths.ingredients);
    const revision = validateAndRevisionNutritionLibraries(meals, ingredients);
    libraries = { ...libraries, meals, ingredients };
    nutritionLibraryMtimes = current;
    nutritionLibraryRevision = revision;
  }

  function validateAndRevisionNutritionLibraries(meals, ingredients) {
    const errors = [];
    const ingredientIds = new Set((ingredients || []).map((item) => String(item.ingredient_id || "")));
    const breakfasts = (meals || []).filter((meal) => meal.meal_type === "breakfast");
    if ((meals || []).length !== 100) errors.push(`expected_100_meals:${(meals || []).length}`);
    if (breakfasts.length !== 25) errors.push(`expected_25_breakfasts:${breakfasts.length}`);
    for (const meal of meals || []) {
      const steps = Array.isArray(meal.cooking_method) ? meal.cooking_method : [];
      if (steps.length < 3 || steps.length > 6) errors.push(`invalid_recipe_steps:${meal.meal_id}`);
      if (steps.some((step) => /slice or portion|combine .*finish with|prepare the cooked/i.test(step))) errors.push(`generic_recipe_steps:${meal.meal_id}`);
      if ((meal.ingredients || []).some((row) => !ingredientIds.has(String(row.ingredient_id || "")))) errors.push(`unknown_recipe_ingredient:${meal.meal_id}`);
      errors.push(...validateRecipeSemantics(meal));
    }
    for (const meal of breakfasts) {
      if (!meal.savory_breakfast || meal.contains_sweet_food || meal.carb_base || meal.contains_breakfast_carbs) errors.push(`invalid_breakfast_policy:${meal.meal_id}`);
      if ((meal.ingredients || []).some((row) => ["carb_base", "fruit", "legume"].includes(row.ingredient_role))) errors.push(`restricted_breakfast_ingredient:${meal.meal_id}`);
      if (Number(meal.calories || 0) > 650) errors.push(`breakfast_calorie_limit:${meal.meal_id}`);
    }
    if (errors.length) throw new Error(`Nutrition library validation failed: ${errors.slice(0, 10).join(", ")}`);
    return crypto.createHash("sha256").update(JSON.stringify({ meals, ingredients })).digest("hex").slice(0, 12);
  }

  function activeGenerationProvenance() {
    return buildGenerationProvenance({
      root,
      exerciseRevision: exerciseLibraryRevision,
      nutritionRevision: nutritionLibraryRevision
    });
  }

  function sessionCompatibility(session) {
    if (!session.generated_plan && !hasReadyPdf(session)) return { compatible: true, reasons: [] };
    return compareProvenance(session.generation_provenance, activeGenerationProvenance(), session.choices?.plan_type);
  }

  function requireCompatibleArtifact(session) {
    const compatibility = sessionCompatibility(session);
    if (!compatibility.compatible) {
      throw apiError(409, "stale_plan_version", "This plan was generated by an older Fitnet version. Please create a new plan.");
    }
  }

  function assertGeneratedPlanSemantics(generated) {
    const errors = [];
    if (generated.workout_plan) errors.push(...validateWorkoutPlanSemantics(generated.workout_plan));
    if (generated.nutrition_plan) errors.push(...validateNutritionPlanSemantics(generated.nutrition_plan));
    if (errors.length) throw apiError(422, "generated_plan_semantic_validation_failed", errors.slice(0, 12).join(", "));
  }

  function workoutCandidateDebug(candidateMap) {
    return Object.fromEntries(
      Object.entries(candidateMap).map(([slotId, candidates]) => [
        slotId,
        candidates.map((exercise) => ({
          exercise_id: exercise.exercise_id,
          exercise_name: exercise.display_name || exercise.name,
          source_exercise_name: exercise.name,
          category: exercise.category,
          primary_muscle: exercise.primary_muscle || exercise.category,
          muscle_group: exercise.category,
          movement_pattern: exercise.movement_pattern,
          movement_family: exercise.movement_family || exercise.movement_pattern,
          training_role: exercise.training_role,
          exercise_type: exercise.exercise_type,
          difficulty: exercise.difficulty,
          substitution_group: exercise.substitution_group,
          approved_substitution_ids: exercise.approved_substitution_ids || [],
          equipment: exercise.equipment,
          allowed_places: exercise.allowed_places,
          injury_flags: exercise.injury_flags || exercise.contraindications,
          is_cardio: exercise.category === "Cardio" || exercise.exercise_type === "cardio" || exercise.movement_pattern === "cardio"
        }))
      ])
    );
  }

  function nutritionCandidateDebug(candidateMap) {
    return Object.fromEntries(
      Object.entries(candidateMap).map(([slotId, candidates]) => [
        slotId,
        candidates.map((meal) => ({
          meal_id: meal.meal_id,
          meal_name: meal.meal_name,
          meal_type: meal.meal_type,
          calories: meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fat_g: meal.fat_g,
          fiber_g: meal.fiber_g,
          diet_tags: meal.diet_tags,
          goal_tags: meal.goal_tags,
          allergens: meal.allergens,
          restrictions: meal.restrictions,
          suitable_for_breakfast: meal.suitable_for_breakfast,
          savory_breakfast: meal.savory_breakfast,
          contains_sweet_food: meal.contains_sweet_food,
          contains_breakfast_carbs: meal.contains_breakfast_carbs
        }))
      ])
    );
  }

  function normalizeWorkoutPlanForValidation(plan, skeleton, candidateMap, normalized) {
    if (!plan || !Array.isArray(plan.plan_days)) return plan;
    const clone = JSON.parse(JSON.stringify(plan));
    if (clone.program_summary) {
      clone.program_summary.goal = normalized.goal;
      clone.program_summary.split = readableSplit(normalized.split);
      clone.program_summary.days_per_week = normalized.days;
      clone.program_summary.session_duration_minutes = normalized.duration_minutes;
      clone.program_summary.workout_place = normalized.place;
      clone.program_summary.available_equipment = [...(normalized.equipment || [])];
      clone.program_summary.focus_muscles = [...(normalized.focus_areas || [])];
      clone.program_summary.injuries = [...(normalized.injuries || [])];
      clone.program_summary.disliked_exercises = [...(normalized.disliked_exercises || [])];
    }
    const slotLookup = new Map(skeleton.flatMap((day) => day.slots).map((slot) => [slot.slot_id, slot]));
    const lowImpactNeeded = (normalized.injuries || []).some((injury) => /knee|ankle|hip|back/i.test(String(injury)));

    for (const [dayPosition, day] of (clone.plan_days || []).entries()) {
      const expectedDay = skeleton.find((item) => Number(item.day_index) === Number(day.day_index)) || skeleton[dayPosition];
      if (expectedDay) {
        day.day_index = Number(expectedDay.day_index);
        day.day_name = String(expectedDay.day_name);
        day.day_focus = String(expectedDay.day_name);
      }
      for (const exercise of day.exercises || []) {
        const slot = slotLookup.get(exercise.slot_id);
        const candidates = candidateMap[exercise.slot_id] || [];
        let selected = candidates.find((candidate) => Number(candidate.exercise_id) === Number(exercise.exercise_id));
        const isCardioSlot = slot?.exercise_type === "cardio";

        if (isCardioSlot && lowImpactNeeded && selected && isHighImpactCardioCandidate(selected)) {
          const replacement = candidates.find((candidate) => isCardioCandidate(candidate) && !isHighImpactCardioCandidate(candidate));
          if (replacement) {
            selected = replacement;
            applyExerciseCandidate(exercise, replacement);
          }
        } else if (selected) {
          applyExerciseCandidate(exercise, selected);
        }

        if (selected && Array.isArray(exercise.substitution_ids)) {
          const approvedSubstitutions = new Set((selected.approved_substitution_ids || []).map(Number));
          exercise.substitution_ids = [...new Set(exercise.substitution_ids.map(Number))]
            .filter((id) => Number.isInteger(id) && approvedSubstitutions.has(id) && id !== Number(selected.exercise_id))
            .slice(0, 3);
        }

        if (isCardioSlot) {
          exercise.sets = 1;
          exercise.rest = "-";
          const range = Array.isArray(slot.rep_range) ? slot.rep_range : [10, 20];
          // Cardio duration is backend-owned. Always restore the exact range so
          // equivalent model text such as "7 min" cannot fail a "7-7 min" slot.
          exercise.reps = `${range[0]}-${range[1]} min`;
          if (!String(exercise.notes || "").trim()) {
            exercise.notes = cardioNoteForCandidate(selected, slot);
          }
        } else {
          exercise.rest = normalizeRestText(exercise.rest);
          exercise.notes = "";
          if (typeof exercise.reps !== "string") {
            exercise.reps = Array.isArray(exercise.reps) ? `${exercise.reps[0]}-${exercise.reps[exercise.reps.length - 1]}` : String(exercise.reps || "");
          }
        }
      }
    }

    normalizeWorkoutDuplicateSelections(clone, candidateMap);

    return clone;
  }

  function canUseValidatedWorkoutDurationFallback(workout, result) {
    if (result?.valid || !workout?.validation?.valid || workout?.status !== "valid_v3") return false;
    const finalErrors = result?.attempts?.[result.attempts.length - 1]?.validation?.errors || [];
    return finalErrors.some((error) => String(error).startsWith("session_duration_exceeded:"));
  }

  function applyExerciseCandidate(exercise, candidate) {
    exercise.exercise_id = Number(candidate.exercise_id);
    exercise.exercise_name = String(candidate.display_name || candidate.name || exercise.exercise_name || "");
    exercise.exercise_category = isCardioCandidate(candidate) ? "cardio" : "strength";
    exercise.movement_pattern = String(candidate.movement_pattern || exercise.movement_pattern || "");
    exercise.muscle_group = String(candidate.category || exercise.muscle_group || "");
  }

  function normalizeRestText(rest) {
    const text = String(rest || "").trim();
    if (/\d+\s*sec/i.test(text)) return text.replace(/\s+/g, " ");
    const number = Number(text.replace(/[^\d.]/g, ""));
    if (Number.isFinite(number) && number > 0) return `${Math.round(number)} sec`;
    return "60 sec";
  }

  function isCardioCandidate(exercise) {
    return exercise?.category === "Cardio" || exercise?.exercise_type === "cardio" || exercise?.movement_pattern === "cardio";
  }

  function isHighImpactCardioCandidate(exercise) {
    const text = `${exercise?.name || ""} ${(exercise?.equipment || []).join(" ")}`.toLowerCase();
    if (/(bike|bicycle|elliptical|cross-trainer|recumbent|rowing|rower)/.test(text)) return false;
    return /(running|run|jump|rope|stepmill|stair)/.test(text);
  }

  function cardioNoteForCandidate(exercise, slot) {
    const range = Array.isArray(slot?.rep_range) ? slot.rep_range : [10, 20];
    const name = String(exercise?.name || "").toLowerCase();
    if (name.includes("bike") || name.includes("recumbent")) return `Resistance 4-6, ${range[0]}-${range[1]} min, steady moderate pace`;
    if (name.includes("elliptical") || name.includes("cross-trainer")) return `${range[0]}-${range[1]} min, easy-moderate pace`;
    if (name.includes("row")) return `${range[0]}-${range[1]} min, smooth moderate pace`;
    return `${range[0]}-${range[1]} min, low-impact moderate pace`;
  }

  async function requestAccessWithProviders(body) {
    const session = requireSession(body.session_id);
    requireCompatibleArtifact(session);
    if (session.status !== "ready" || !hasReadyPdf(session)) {
      throw apiError(409, "plan_not_ready", "The PDF is not ready yet.");
    }

    const guard = validateLeadSubmission(securityState, {
      name: body.name,
      email: body.email,
      consent: Boolean(body.consent),
      captcha: body.captcha,
      honeypot: body.website || body.honeypot || ""
    });
    collectSecurity(session);

    if (!guard.allowed) {
      touch(session);
      await saveSession(session);
      throw apiError(429, guard.reason, securityMessage(guard.reason));
    }

    const tokens = createDownloadTokens(session);
    const primaryToken = tokens[0];
    const lead = {
      name: String(body.name || "").trim(),
      email: String(body.email || "").trim().toLowerCase(),
      consent: Boolean(body.consent),
      created_at: new Date(now()).toISOString()
    };
    const downloadUrls = tokens.map((token) => ({
      ...tokenToDownloadEntry(token),
      absolute_url: `${services.appBaseUrl || ""}/api/download/${token.token}`
    }));
    const downloadUrl = downloadUrls[0].absolute_url;
    const sent = await services.sendPlanEmail({
      to: lead.email,
      name: lead.name,
      downloadUrl,
      downloadUrls,
      expiresAt: primaryToken.expires_at,
      planType: session.choices.plan_type
    });
    const emailEvent = {
      event_type: "sent",
      provider: "resend",
      recipient_email: lead.email,
      recipient_hash: stableHash(lead.email),
      provider_message_id: sent?.id || null,
      download_url: `/api/download/${primaryToken.token}`,
      download_urls: downloadUrls.map(({ kind, label, url }) => ({ kind, label, url })),
      metadata: {
        download_url: downloadUrl,
        download_urls: downloadUrls,
        expires_at: primaryToken.expires_at
      },
      created_at: new Date(now()).toISOString()
    };

    session.lead = lead;
    session.access_token_id = primaryToken.token;
    session.email_events.push(emailEvent);
    touch(session);
    await saveSession(session);
    const leadId = await safeServiceCall(() => services.saveLead?.(session, lead));
    await safeServiceCall(() => services.saveEmailEvent?.(session, emailEvent, leadId));

    return {
      session_id: session.session_id,
      status: "email_sent",
      download_url: emailEvent.download_url,
      download_urls: emailEvent.download_urls,
      expires_at: primaryToken.expires_at
    };
  }

  async function retryFailedPlanKinds(sessionId) {
    const session = requireSession(sessionId);
    if (!services?.usesAsync) {
      throw apiError(503, "llm_not_configured", "LLM provider is not configured.");
    }
    const failedKinds = session.failed_plan_kinds || [];
    if (!failedKinds.length) {
      throw apiError(409, "retry_not_available", "No failed plan is available to retry.");
    }

    session.status = "generating";
    session.loading_state = "Retrying failed plan";
    session.job_started_at = new Date(now()).toISOString();
    session.job_timeout_at = new Date(now() + jobTimeoutMs).toISOString();
    touch(session);
    saveSession(session);

    const retrySession = {
      ...session,
      choices: {
        ...session.choices,
        plan_type: failedKinds.length === 2 ? "Workout + Nutrition" : failedKinds[0] === "workout" ? "Workout Only" : "Nutrition Only"
      }
    };
    const generated = await generatePlansWithProviders(retrySession);
    const existing = session.generated_plan || {};
    session.generated_plan = mergeGeneratedPlans(existing, generated);
    session.generation_debug = mergeDebugLogs(session.generation_debug, generated.debug_log);
    session.preview = buildPreview(session, session.generated_plan);

    session.status = "rendering_pdf";
    session.loading_state = "Preparing your downloads";
    touch(session);
    saveSession(session);

    session.pdfs = {
      ...(session.pdfs || {}),
      ...renderPlanPdfs(session, generated)
    };
    session.pdf_path = session.pdfs.workout?.path || session.pdfs.nutrition?.path || session.pdf_path || null;
    session.download_tokens = createDownloadTokens(session).map(tokenToDownloadEntry);
    session.failed_plan_kinds = failedPlanKinds(session.generated_plan);
    session.plan_statuses = session.generated_plan.plan_statuses || {};
    session.status = session.failed_plan_kinds.length ? "partial_ready" : "ready";
    session.loading_state = session.failed_plan_kinds.length ? "Some plans are ready" : "Plans ready";
    session.error = session.failed_plan_kinds.length ? generationFailureMessage(session.generated_plan) : null;
    touch(session);
    await saveSession(session);
    return getStatus(session.session_id);
  }

  function mergeGeneratedPlans(existing, generated) {
    const merged = {
      ...existing,
      profile: existing.profile || generated.profile,
      language: generated.language || existing.language || "ar",
      plan_type: existing.plan_type || generated.plan_type,
      prompt_version: generated.prompt_version || existing.prompt_version,
      model_name: generated.model_name || existing.model_name,
      llm_raw_json: {
        ...(existing.llm_raw_json || {}),
        ...(generated.llm_raw_json || {})
      },
      plan_statuses: {
        ...(existing.plan_statuses || {}),
        ...(generated.plan_statuses || {})
      },
      plan_errors: {
        ...(existing.plan_errors || {}),
        ...(generated.plan_errors || {})
      }
    };
    if (generated.workout_plan) {
      merged.workout_plan = generated.workout_plan;
      merged.workout_generation = generated.workout_generation;
      delete merged.plan_errors.workout;
    }
    if (generated.nutrition_plan) {
      merged.nutrition_plan = generated.nutrition_plan;
      merged.nutrition_generation = generated.nutrition_generation;
      delete merged.plan_errors.nutrition;
    }
    return merged;
  }

  function mergeDebugLogs(existing, latest) {
    if (!existing) return latest;
    return {
      ...existing,
      latest_retry: latest,
      retries: [...(existing.retries || []), latest]
    };
  }

  function renderPdf(session, generated) {
    ensureDir(tmpDir);
    ensureDir(pdfDir);
    const filename = `fitnet-${session.session_id}`;
    const payloadPath = path.join(tmpDir, `${filename}.json`);
    const outputPath = path.join(pdfDir, `${filename}.pdf`);
    const payload = {
      profile: generated.profile,
      plan_type: generated.plan_type,
      language: generated.language || session.language,
      prompt_version: generated.prompt_version,
      workout_plan: generated.workout_plan,
      nutrition_plan: generated.nutrition_plan
    };

    fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);

    const result = spawnSync(
      python,
      [
        path.join(root, "scripts", "render_plan_pdf.py"),
        "--payload",
        payloadPath,
        "--output",
        outputPath,
        "--exercises",
        path.join(dataDir, "exercise_library.json"),
        "--foods",
        path.join(dataDir, "food_library.json")
      ],
      { encoding: "utf8" }
    );

    if (result.status !== 0) {
      throw apiError(500, "pdf_render_failed", result.stderr || result.stdout || "PDF render failed.");
    }

    return outputPath;
  }

  function renderPlanPdfs(session, generated) {
    const pdfs = {};
    if (generated.workout_plan) {
      pdfs.workout = {
        kind: "workout",
        label: "Workout Program",
        path: renderPdfForKind(session, generated, "workout")
      };
    }
    if (generated.nutrition_plan) {
      pdfs.nutrition = {
        kind: "nutrition",
        label: "Nutrition Plan",
        path: renderPdfForKind(session, generated, "nutrition")
      };
    }
    return pdfs;
  }

  function renderPdfForKind(session, generated, kind) {
    ensureDir(tmpDir);
    ensureDir(pdfDir);
    const filename = `fitnet-${session.session_id}-${kind}`;
    const payloadPath = path.join(tmpDir, `${filename}.json`);
    const outputPath = path.join(pdfDir, `${filename}.pdf`);
    const payload = {
      profile: generated.profile,
      plan_type: kind === "workout" ? "Workout Only" : "Nutrition Only",
      language: generated.language || session.language,
      prompt_version: generated.prompt_version,
      workout_plan: kind === "workout" ? generated.workout_plan : null,
      nutrition_plan: kind === "nutrition" ? generated.nutrition_plan : null
    };

    fs.writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);
    const result = spawnSync(
      python,
      [
        path.join(root, "scripts", "render_plan_pdf.py"),
        "--payload",
        payloadPath,
        "--output",
        outputPath,
        "--exercises",
        path.join(dataDir, "exercise_library.json"),
        "--foods",
        path.join(dataDir, "food_library.json")
      ],
      { encoding: "utf8" }
    );

    if (result.status !== 0) {
      throw apiError(500, "pdf_render_failed", result.stderr || result.stdout || "PDF render failed.");
    }

    return outputPath;
  }

  function buildPreview(session, generated) {
    const preview = {
      goal: session.choices.goal,
      plan_type: generated.plan_type,
      language: generated.language || session.language,
      plan_statuses: generated.plan_statuses || {},
      plan_errors: generated.plan_errors || {}
    };

    if (generated.workout_plan) {
      const firstWeek = generated.workout_plan.weeks?.[0];
      const firstDay = firstWeek ? firstWeek.days[0] : generated.workout_plan.plan_days[0];
      preview.workout = {
        weeks: generated.workout_plan.weeks?.length || 1,
        days: firstWeek ? firstWeek.days.length : generated.workout_plan.plan_days.length,
        sample_day: {
          day_name: firstDay.day_name,
          exercise_count: firstDay.exercises.length,
          first_exercise_id: firstDay.exercises[0]?.exercise_id || null
        }
      };
    }

    if (generated.nutrition_plan) {
      const day = generated.nutrition_plan.days?.[0] || generated.nutrition_plan.nutrition_days?.[0];
      const nutritionSummary = generated.nutrition_plan.nutrition_summary || {};
      const dailyCalorieTarget = Number(
        nutritionSummary.daily_calorie_target
          || generated.nutrition_generation?.normalized_input?.calorie_target
          || 0
      ) || null;
      const nutritionDays = generated.nutrition_plan.days || generated.nutrition_plan.nutrition_days || [];
      const averageDailyCalories = nutritionDays.length
        ? Math.round(nutritionDays.reduce((total, item) => total + Number(item.daily_totals?.calories || 0), 0) / nutritionDays.length)
        : null;
      preview.nutrition = {
        daily_calorie_target: dailyCalorieTarget,
        average_daily_calories: averageDailyCalories,
        daily_totals: day.daily_totals,
        meals: day.meals.length,
        sample_meal: day.meals[0]?.meal_name || null,
        calorie_calculation: {
          target_is_estimate: nutritionSummary.target_is_estimate !== false,
          estimated_maintenance_calories: nutritionSummary.estimated_maintenance_calories || null,
          goal_adjustment_calories: nutritionSummary.goal_adjustment_calories || 0,
          activity_level: nutritionSummary.activity_level || null
        }
      };
    }

    return preview;
  }

  function requestedPlanKinds(planType) {
    const kinds = [];
    if (includesWorkout(planType)) kinds.push("workout");
    if (includesNutrition(planType)) kinds.push("nutrition");
    return kinds;
  }

  function hasAnyGeneratedPlan(generated) {
    return Boolean(generated.workout_plan || generated.nutrition_plan);
  }

  function failedPlanKinds(generated) {
    return requestedPlanKinds(generated.plan_type)
      .filter((kind) => generated.plan_statuses?.[kind] === "failed" || (kind === "workout" ? !generated.workout_plan : !generated.nutrition_plan));
  }

  function hasFailedRequestedPlan(generated) {
    return failedPlanKinds(generated).length > 0;
  }

  function generationFailureMessage(generated) {
    const errors = generated.plan_errors || {};
    const failed = failedPlanKinds(generated);
    if (!failed.length) return null;
    return failed
      .map((kind) => `${kind === "workout" ? "Workout" : "Nutrition"} generation failed validation${errors[kind] ? `: ${errors[kind]}` : "."}`)
      .join(" ");
  }

  function createDownloadToken(session, pdfKind = null) {
    ensureDir(path.join(storageDir, "tokens"));
    const token = {
      token: `dl_${crypto.randomBytes(18).toString("hex")}`,
      session_id: session.session_id,
      pdf_kind: pdfKind,
      expires_at: new Date(now() + PDF_EXPIRY_MS).toISOString(),
      created_at: new Date(now()).toISOString()
    };

    fs.writeFileSync(tokenPath(token.token), `${JSON.stringify(token, null, 2)}\n`);
    return token;
  }

  function createDownloadTokens(session) {
    if (session.pdfs && Object.keys(session.pdfs).length) {
      return Object.keys(session.pdfs).map((kind) => createDownloadToken(session, kind));
    }
    return [createDownloadToken(session)];
  }

  function tokenToDownloadEntry(token) {
    const kind = token.pdf_kind || "plan";
    const label = kind === "workout" ? "Workout Program" : kind === "nutrition" ? "Nutrition Plan" : "Fitnet Plan";
    return {
      kind,
      label,
      url: `/api/download/${token.token}`,
      expires_at: token.expires_at
    };
  }

  function collectSecurity(session) {
    session.security_events.push(...consumeSecurityEvents(securityState));
  }

  function recordGenerationStep(session, status, reason, message = null) {
    session.generation_attempts = session.generation_attempts || [];
    session.generation_attempts.push(attemptEvent(status, reason, message));
    touch(session);
    saveSession(session);
  }

  function requireSession(sessionId) {
    if (!sessionId) {
      throw apiError(400, "missing_session_id", "A session_id is required.");
    }

    const file = sessionPath(sessionId);
    if (!fs.existsSync(file)) {
      throw apiError(404, "session_not_found", "Generation session was not found.");
    }

    return readJson(file);
  }

  function saveSession(session) {
    if (!persistSessions) return null;
    ensureDir(path.join(storageDir, "sessions"));
    fs.writeFileSync(sessionPath(session.session_id), `${JSON.stringify(session, null, 2)}\n`);
    if (services?.saveSession) {
      return safeServiceCall(() => services.saveSession(session));
    }
    return null;
  }

  function readToken(token) {
    ensureDir(path.join(storageDir, "tokens"));
    const file = tokenPath(token);
    return fs.existsSync(file) ? readJson(file) : null;
  }

  function sessionPath(sessionId) {
    return path.join(storageDir, "sessions", `${safeId(sessionId)}.json`);
  }

  function tokenPath(token) {
    return path.join(storageDir, "tokens", `${safeId(token)}.json`);
  }

  function ensureGenerationInputs(session) {
    if (!session.choices.goal) throw apiError(400, "missing_goal", "Goal has not been saved.");
    if (!session.choices.profile) throw apiError(400, "missing_profile", "Profile has not been saved.");
    if (!session.choices.plan_type) throw apiError(400, "missing_plan_type", "Plan type has not been saved.");
    if (includesWorkout(session.choices.plan_type) && !session.choices.workout) {
      throw apiError(400, "missing_workout_inputs", "Workout inputs have not been saved.");
    }
    if (includesNutrition(session.choices.plan_type) && !session.choices.nutrition) {
      throw apiError(400, "missing_nutrition_inputs", "Nutrition inputs have not been saved.");
    }
    if (includesNutrition(session.choices.plan_type)) {
      const eligibility = assessNutritionEligibility(session.choices.profile, session.choices.nutrition, session.choices.goal);
      if (!eligibility.eligible) {
        throw apiError(422, "nutrition_safety_referral_required", `This automated nutrition plan is not suitable for this profile: ${eligibility.reasons.join(", ")}.`);
      }
    }
  }

  function buildProfile(session) {
    return {
      ...session.choices.profile,
      goal: session.choices.goal
    };
  }

  return {
    handleApiRequest,
    generateStatelessPlan,
    processGenerationJob,
    getStatus,
    getPreview,
    requestAccess,
    downloadPlan
  };
}

function extractSectionPayload(section, body) {
  if (section === "goal") return body.goal || null;
  if (section === "profile") return body.profile || null;
  if (section === "plan-type") return body.plan_type || body.planType || null;
  if (section === "workout-inputs") return body.workout || null;
  if (section === "nutrition-inputs") return body.nutrition || null;
  return null;
}

function publicSession(session) {
  return {
    session_id: session.session_id,
    status: session.status,
    loading_state: session.loading_state,
    language: session.language || "ar",
    choices: session.choices,
    updated_at: session.updated_at
  };
}

function normalizeLanguage(value) {
  return String(value || "ar").toLowerCase().startsWith("en") ? "en" : "ar";
}

function touch(session) {
  session.updated_at = new Date().toISOString();
}

function summarizeGeneration(result, contract) {
  return {
    status: result.status,
    validation: result.validation,
    contract_validation: contract,
    normalized_input: result.normalized_input,
    coaching_strategy: result.coaching_strategy || null,
    strategy_validation: result.strategy_validation || null,
    candidate_validation: result.candidate_validation || null,
    candidate_diagnostics: result.candidate_diagnostics || null,
    quality_score: contract?.quality_score || result.validation?.quality_score || null
  };
}

function promptCharacterCount(prompt) {
  if (!prompt) return 0;
  return String(prompt.system || "").length + String(prompt.user || "").length;
}

function responseCharacterCount(selected) {
  const outputText = selected?.raw?.output_text;
  if (typeof outputText === "string") return outputText.length;
  try {
    return JSON.stringify(selected?.plan || null).length;
  } catch (_error) {
    return 0;
  }
}

function summarizeNormalization(before, after) {
  const changedPaths = [];
  collectChangedPaths(before, after, "$", changedPaths, 25);
  return {
    changed: changedPaths.length > 0,
    changed_field_count: changedPaths.length,
    changed_paths: changedPaths
  };
}

function collectChangedPaths(before, after, pathName, output, limit) {
  if (output.length >= limit || Object.is(before, after)) return;
  if (!before || !after || typeof before !== "object" || typeof after !== "object") {
    output.push(pathName);
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (output.length >= limit) break;
    collectChangedPaths(before[key], after[key], `${pathName}.${key}`, output, limit);
  }
}

function categorizeValidationErrors(errors = []) {
  const categories = new Set();
  for (const error of errors || []) {
    const value = String(error).toLowerCase();
    if (/quality:score|coaching|rationale|guidance|cue/.test(value)) categories.add("coaching_quality");
    if (/duration|sets|reps|rest/.test(value)) categories.add("session_feasibility");
    if (/muscle|focus|volume|coverage|pattern/.test(value)) categories.add("training_balance");
    if (/duplicate|redundan|repetition/.test(value)) categories.add("exercise_variety");
    if (/substitution|candidate|exercise_id/.test(value)) categories.add("approved_catalog");
    if (/injury|pain|contraindicat|unsafe|high_impact/.test(value)) categories.add("safety");
    if (/schema|missing|invalid|extra|required|slot|day/.test(value)) categories.add("contract_structure");
    if (/llm_error|provider/.test(value)) categories.add("provider");
  }
  if ((errors || []).length && categories.size === 0) categories.add("other");
  return [...categories].sort();
}

function validationMetrics(validation) {
  const errors = validation?.errors || [];
  return {
    valid: Boolean(validation?.valid),
    error_count: errors.length,
    error_categories: categorizeValidationErrors(errors),
    quality_score: validation?.quality_score?.score ?? null,
    quality_threshold: validation?.quality_score?.threshold ?? null
  };
}

function isNonRetryableProviderError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || "").toLowerCase();
  return [400, 401, 403].includes(status)
    || /invalid schema|invalid response_format|incorrect api key|authentication/.test(message);
}

function finalizeGenerationObservability(observability, startedAt, acceptedAttempt, finalStatus) {
  const attempts = observability.attempts || [];
  return {
    ...observability,
    completed_at: new Date().toISOString(),
    total_duration_ms: Date.now() - startedAt,
    total_provider_latency_ms: attempts.reduce((total, attempt) => total + (attempt.provider_latency_ms || 0), 0),
    accepted_attempt: acceptedAttempt,
    repair_attempted: attempts.length > 1,
    repair_succeeded: acceptedAttempt === 2,
    final_status: finalStatus
  };
}

function attemptEvent(status, reason, message = null) {
  return {
    status,
    reason,
    message,
    created_at: new Date().toISOString()
  };
}

function includesWorkout(planType) {
  return planType === "Workout Only" || planType === "Workout + Nutrition";
}

function includesNutrition(planType) {
  return planType === "Nutrition Only" || planType === "Workout + Nutrition";
}

function nextActionForStatus(status) {
  const actions = {
    draft: "complete_inputs",
    queued: "poll_status",
    generating: "poll_status",
    rendering_pdf: "poll_status",
    ready: "request_access",
    partial_ready: "retry_generation",
    failed: "retry_generation",
    timed_out: "retry_generation",
    blocked: "wait_or_contact_support"
  };

  return actions[status] || "poll_status";
}

function hasReadyPdf(session) {
  if (session.pdfs && Object.keys(session.pdfs).length) {
    return Object.values(session.pdfs).some((pdf) => pdf?.path);
  }
  return Boolean(session.pdf_path);
}

function fingerprintFromHeaders(headers = {}) {
  const ip = remoteIpFromHeaders(headers);
  const agent = headers["user-agent"] || "unknown-agent";
  return stableHash(`${ip}|${agent}`);
}

function remoteIpFromHeaders(headers = {}) {
  return String(headers["x-forwarded-for"] || headers["x-real-ip"] || headers.host || "local")
    .split(",")[0]
    .trim();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function securityMessage(reason) {
  const messages = {
    generation_kill_switch: "Plan generation is temporarily paused. Please try again later.",
    duplicate_generation_debounced: "Your plan is already being prepared. Give it a moment before trying again.",
    generation_rate_limited: "Too many plan attempts from this browser. Please try again later.",
    generation_daily_rate_limited: "You have reached today's plan limit. Please try again tomorrow.",
    honeypot_triggered: "We could not submit this request.",
    lead_missing_required_fields: "Please complete all required fields.",
    lead_invalid_email: "Please enter a valid email address.",
    disposable_email_blocked: "Please use a non-temporary email address.",
    captcha_failed: "Please complete the Fitnet verification prompt.",
    turnstile_failed: "Please complete the security check and try again.",
    email_rate_limited: "Too many requests for this email address. Please try again later."
  };

  return messages[reason] || "Request blocked.";
}

function jsonResponse(status, body) {
  return {
    status,
    headers: { "content-type": "application/json" },
    body
  };
}

function maybeJsonResponse(status, body) {
  if (!body || typeof body.then !== "function") {
    return jsonResponse(status, body);
  }

  return body
    .then((resolved) => jsonResponse(status, resolved))
    .catch((error) => {
      const errorStatus = error.status_code || 500;
      return jsonResponse(errorStatus, {
        error: error.code || "api_error",
        message: error.message
      });
    });
}

async function safeServiceCall(callback) {
  try {
    return await callback();
  } catch (error) {
    console.warn(`Fitnet provider warning: ${error.message}`);
    return null;
  }
}

function apiError(status, code, message) {
  const error = new Error(message);
  error.status_code = status;
  error.code = code;
  return error;
}

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

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

module.exports = {
  createFitnetApi
};
