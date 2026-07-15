const { Pool } = require("pg");
const { Resend } = require("resend");
const OpenAI = require("openai");
const { put } = require("@vercel/blob");
const {
  buildWorkoutSelectionPrompt,
  buildWorkoutSelectionPromptV2,
  buildWorkoutSelectionPromptV3,
  buildNutritionSelectionPrompt,
  buildNutritionSelectionPromptV2,
  canonicalizeWorkoutPlan,
  canonicalizeWorkoutPlanV2,
  canonicalizeWorkoutPlanV3,
  canonicalizeNutritionPlan,
  canonicalizeNutritionPlanV2,
  canonicalizeNutritionSelectionV1
} = require("./plan-contracts");
const workoutOutputV3Schema = require("../data/contracts/workout-output-v3.schema.json");
const nutritionSelectionV1Schema = require("../data/contracts/nutrition-selection-v1.schema.json");

function createProductionServices(options = {}) {
  require("dotenv").config();

  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const appBaseUrl = (options.appBaseUrl || process.env.API_BASE_URL || process.env.APP_BASE_URL || "http://localhost:3002").replace(/\/$/, "");
  const turnstileSecretKey = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  const turnstileRequired = process.env.TURNSTILE_REQUIRED === "true" || process.env.NODE_ENV === "production";

  const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
  const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;
  const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      })
    : null;

  return {
    usesAsync: true,
    model,
    appBaseUrl,
    hasOpenAI: Boolean(openai),
    hasDatabase: Boolean(pool),
    hasEmail: Boolean(resend),
    hasBlob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    turnstileRequired,
    turnstileSiteKey,

    async verifyTurnstile({ token, remoteIp }) {
      if (!turnstileRequired) return { success: true, bypassed: true };
      if (!turnstileSecretKey || !turnstileSiteKey || !token) {
        return { success: false, errorCodes: ["missing-input-or-secret"] };
      }

      const form = new URLSearchParams({
        secret: turnstileSecretKey,
        response: String(token)
      });
      if (remoteIp) form.set("remoteip", String(remoteIp));

      try {
        const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) return { success: false, errorCodes: ["verification-unavailable"] };
        const result = await response.json();
        return {
          success: Boolean(result.success),
          errorCodes: result["error-codes"] || []
        };
      } catch {
        return { success: false, errorCodes: ["verification-unavailable"] };
      }
    },

    async selectWorkoutPlan({ normalizedInput, skeleton, candidateMap }) {
      if (!openai) return null;
      const prompt = buildWorkoutSelectionPrompt({ normalizedInput, skeleton, candidateMap });
      const { json, text, response } = await requestJson(openai, model, prompt);
      return {
        plan: canonicalizeWorkoutPlan(json),
        raw: compactOpenAiResponse(response, text)
      };
    },

    async selectWorkoutPlanV2({ normalizedInput, coachingStrategy, skeleton, candidateMap, validationErrors = [], previousJson = null }) {
      if (!openai) return null;
      const prompt = withRetryContext(
        buildWorkoutSelectionPromptV2({ normalizedInput, coachingStrategy, skeleton, candidateMap }),
        validationErrors,
        previousJson
      );
      const { json, text, response } = await requestJson(openai, model, prompt);
      return {
        plan: canonicalizeWorkoutPlanV2(json),
        raw: { ...compactOpenAiResponse(response, text), prompt }
      };
    },

    async selectWorkoutPlanV3({ normalizedInput, coachingStrategy, skeleton, candidateMap, language = "en", validationErrors = [], previousJson = null }) {
      if (!openai) return null;
      const prompt = withRetryContext(
        buildWorkoutSelectionPromptV3({ normalizedInput, coachingStrategy, skeleton, candidateMap, language }),
        validationErrors,
        previousJson
      );
      const { json, text, response } = await requestJson(openai, model, prompt, workoutOutputV3Schema);
      return {
        plan: canonicalizeWorkoutPlanV3(json),
        raw: { ...compactOpenAiResponse(response, text), prompt }
      };
    },

    async selectNutritionPlan({ normalizedInput, skeleton, candidateMap }) {
      if (!openai) return null;
      const prompt = buildNutritionSelectionPrompt({ normalizedInput, skeleton, candidateMap });
      const { json, text, response } = await requestJson(openai, model, prompt);
      return {
        plan: canonicalizeNutritionPlan(json),
        raw: compactOpenAiResponse(response, text)
      };
    },

    async selectNutritionPlanV2({ normalizedInput, skeleton, candidateMap, language = "en", validationErrors = [], previousJson = null }) {
      if (!openai) return null;
      const prompt = withRetryContext(
        buildNutritionSelectionPromptV2({ normalizedInput, skeleton, candidateMap, language }),
        validationErrors,
        previousJson
      );
      const { json, text, response } = await requestJson(openai, model, prompt, nutritionSelectionV1Schema);
      return {
        plan: canonicalizeNutritionSelectionV1(json),
        raw: { ...compactOpenAiResponse(response, text), prompt }
      };
    },

    async localizePlanToArabic(plan) {
      if (!openai) return plan;
      const prompt = {
        system: [
          "You localize Fitnet plan JSON into natural Modern Standard Arabic.",
          "Translate only user-facing prose, headings, day names, meal names, ingredient names, cooking instructions, coaching cues, guidance, notes, and rationale strings.",
          "Never translate, transliterate, or change any exercise_name value. Exercise names must remain exactly in English.",
          "Do not change keys, IDs, numbers, quantities, units, arrays, object structure, nulls, booleans, URLs, schema versions, or plan metadata.",
          "Return one valid JSON object only."
        ].join(" "),
        user: JSON.stringify(plan)
      };
      const { json } = await requestJson(openai, model, prompt);
      return restoreProtectedPlanValues(plan, json);
    },

    async uploadPdf({ sessionId, kind = "plan", buffer }) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
      const filename = kind === "workout" ? "fitnet-workout-program.pdf" : kind === "nutrition" ? "fitnet-nutrition-plan.pdf" : "fitnet-plan.pdf";
      const blob = await put(`plans/${sessionId}/${filename}`, buffer, {
        access: "private",
        contentType: "application/pdf",
        addRandomSuffix: false
      });
      return {
        url: blob.url,
        pathname: blob.pathname
      };
    },

    async sendPlanEmail({ to, name, downloadUrl, downloadUrls = [], expiresAt, planType }) {
      if (!resend) return null;
      const result = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Fitnet <noreply@fitnetapp.com>",
        to,
        subject: "Your Fitnet plan is ready",
        html: planEmailHtml({ name, downloadUrl, downloadUrls, expiresAt, planType })
      });
      return result?.data || result;
    },

    async saveSession(session) {
      if (!pool) return;
      await pool.query(
        `
          INSERT INTO generation_sessions (
            session_id, status, goal, plan_type, raw_choices, normalized_choices,
            current_step, created_at, updated_at, completed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (session_id) DO UPDATE SET
            status = EXCLUDED.status,
            goal = EXCLUDED.goal,
            plan_type = EXCLUDED.plan_type,
            raw_choices = EXCLUDED.raw_choices,
            normalized_choices = EXCLUDED.normalized_choices,
            current_step = EXCLUDED.current_step,
            updated_at = EXCLUDED.updated_at,
            completed_at = EXCLUDED.completed_at
        `,
        [
          session.session_id,
          session.status,
          session.choices?.goal || null,
          session.choices?.plan_type || null,
          JSON.stringify(session.choices || {}),
          JSON.stringify(session.generated_plan || {}),
          session.status,
          session.created_at,
          session.updated_at,
          session.status === "ready" ? session.updated_at : null
        ]
      );
    },

    async saveGeneratedPlan(session) {
      if (!pool || !session.generated_plan) return;
      await pool.query(
        `
          INSERT INTO generated_plans (
            session_id, plan_type, prompt_version, model_name, llm_raw_json,
            validation_result, final_plan_json, final_pdf_url, email_delivery_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          session.session_id,
          session.generated_plan.plan_type,
          session.generated_plan.prompt_version,
          session.generated_plan.model_name || model,
          JSON.stringify(session.generated_plan.llm_raw_json || {}),
          JSON.stringify({
            workout: session.generated_plan.workout_generation?.contract_validation || null,
            nutrition: session.generated_plan.nutrition_generation?.contract_validation || null
          }),
          JSON.stringify(session.generated_plan),
          session.pdf_blob?.url || session.pdf_path || null,
          session.email_events?.length ? "sent" : "not_requested"
        ]
      );
    },

    async saveLead(session, lead) {
      if (!pool) return null;
      const result = await pool.query(
        `
          INSERT INTO user_leads (session_id, name, email, consent_fitnet_updates)
          VALUES ($1, $2, $3, $4)
          RETURNING lead_id
        `,
        [session.session_id, lead.name, lead.email, lead.consent]
      );
      return result.rows[0]?.lead_id || null;
    },

    async saveEmailEvent(session, event, leadId = null) {
      if (!pool) return;
      await pool.query(
        `
          INSERT INTO email_events (
            session_id, lead_id, provider, event_type, recipient_email,
            provider_message_id, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          session.session_id,
          leadId,
          event.provider,
          event.event_type,
          event.recipient_email,
          event.provider_message_id || null,
          JSON.stringify(event.metadata || {})
        ]
      );
    }
  };
}

function withRetryContext(prompt, validationErrors = [], previousJson = null) {
  if (!validationErrors.length) return prompt;
  const uniqueErrors = [...new Set(validationErrors)].slice(0, 40);
  return {
    ...prompt,
    user: [
      prompt.user,
      "",
      "Previous output failed Fitnet backend validation.",
      "Return the complete JSON object, but preserve every valid field and selection unless it must change to fix an error.",
      "Repair only the identified failures. Keep the same schema, fixed days, fixed slots, approved catalog, and candidate IDs.",
      "Do not add explanations or markdown.",
      JSON.stringify(
        {
          repair_actions: repairActions(uniqueErrors),
          validation_errors: uniqueErrors,
          previous_json: previousJson
        }
      )
    ].join("\n")
  };
}

function repairActions(errors) {
  const actions = [];
  for (const error of errors) {
    if (/score_reason|score_below_threshold/.test(error)) actions.push("Improve only the deducted coaching-quality categories while preserving valid selections.");
    if (/session_duration|rest_outside|reps_outside|unsafe_sets/.test(error)) actions.push("Adjust sets, rep ranges, or rest only where required to satisfy safe ranges and session time.");
    if (/missing_required|weekly_muscle|focus_area|volume_imbalance/.test(error)) actions.push("Repair the affected muscle, movement, focus, or weekly-volume coverage using approved candidates for those slots.");
    if (/duplicate|redundancy|repetition/.test(error)) actions.push("Replace only unnecessary repetition with an unused approved candidate from the same slot; Fitnet will normalize repeat reasons.");
    if (/substitution/.test(error)) actions.push("Use substitution IDs only from the selected candidate's approved list for that slot.");
    if (/injury|restricted|high_impact|pain_response|unsafe_coaching|critical_safety/.test(error)) actions.push("Repair the safety conflict conservatively without inventing medical details.");
    if (/internal_language/.test(error)) actions.push("Rewrite the identified sentence as natural user-facing coaching guidance without changing its meaning.");
    if (/repetitive_coaching|repetitive_effort|generic_cue_wording/.test(error)) actions.push("Rewrite repeated coaching as concise, exercise-specific technique and effort guidance with varied natural wording.");
    if (/recovery_repeats|repetitive_recovery/.test(error)) actions.push("Rewrite recovery guidance to cover fatigue and scheduling without repeating progression or the four-week instruction.");
    if (/schema|missing_v3|extra_v3|invalid_/.test(error)) actions.push("Correct the specified field while preserving the rest of the strict v3 object.");
  }
  return [...new Set(actions)];
}

async function requestJson(openai, model, prompt, responseSchema = null) {
  const response = await openai.responses.create({
    model,
    text: {
      format: buildResponseTextFormat(responseSchema)
    },
    input: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ]
  });
  const text = response.output_text || extractResponseText(response);
  const cleaned = cleanJsonText(text);
  const parsed = await parseJsonOrRepair(openai, model, cleaned);
  return {
    json: parsed.json,
    text,
    response: parsed.repaired ? { ...response, fitnet_repaired_json: true } : response
  };
}

function buildResponseTextFormat(responseSchema = null) {
  const schemaName = String(responseSchema?.$id || "fitnet_structured_output").replace(/[^a-zA-Z0-9_-]+/g, "_");
  return responseSchema
    ? {
        type: "json_schema",
        name: schemaName,
        description: "A strict Fitnet structured generation response.",
        schema: toProviderSchema(responseSchema),
        strict: true
      }
    : { type: "json_object" };
}

function restoreProtectedPlanValues(source, translated, key = "") {
  if (Array.isArray(source)) {
    if (!Array.isArray(translated) || translated.length !== source.length) return source;
    return source.map((item, index) => restoreProtectedPlanValues(item, translated[index], key));
  }
  if (!source || typeof source !== "object") {
    const protectedString = key === "exercise_name" || /(^|_)id$/.test(key) || key === "slot_id" || key === "program_version" || key === "selection_version";
    return protectedString || typeof source !== "string" ? source : (typeof translated === "string" ? translated : source);
  }
  if (!translated || typeof translated !== "object" || Array.isArray(translated)) return source;
  return Object.fromEntries(Object.entries(source).map(([childKey, value]) => [
    childKey,
    restoreProtectedPlanValues(value, translated[childKey], childKey)
  ]));
}

function toProviderSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toProviderSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== "$schema" && key !== "$id")
      .map(([key, value]) => [key, toProviderSchema(value)])
  );
}

async function parseJsonOrRepair(openai, model, text) {
  try {
    return { json: JSON.parse(text), repaired: false };
  } catch (error) {
    const repaired = await repairJsonText(openai, model, text, error);
    return { json: JSON.parse(repaired), repaired: true };
  }
}

async function repairJsonText(openai, model, text, parseError) {
  const response = await openai.responses.create({
    model,
    text: {
      format: { type: "json_object" }
    },
    input: [
      {
        role: "system",
        content: "You repair malformed JSON. Return only valid JSON. Do not add markdown, explanations, comments, or extra prose."
      },
      {
        role: "user",
        content: [
          `JSON parse error: ${parseError.message}`,
          "Repair this malformed JSON without changing its meaning, keys, IDs, numbers, arrays, or object structure:",
          text
        ].join("\n\n")
      }
    ]
  });
  return cleanJsonText(response.output_text || extractResponseText(response));
}

function extractResponseText(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function cleanJsonText(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  return trimmed;
}

function compactOpenAiResponse(response, text) {
  return {
    id: response.id,
    model: response.model,
    usage: response.usage
      ? {
          input_tokens: response.usage.input_tokens ?? null,
          output_tokens: response.usage.output_tokens ?? null,
          total_tokens: response.usage.total_tokens ?? null
        }
      : null,
    repaired_malformed_json: Boolean(response.fitnet_repaired_json),
    output_text: text
  };
}

function planEmailHtml({ name, downloadUrl, downloadUrls = [], expiresAt, planType }) {
  const safeName = escapeHtml(name || "there");
  const links = downloadUrls.length
    ? downloadUrls
    : [{ label: "Download my plan", absolute_url: downloadUrl || "" }];
  const linkHtml = links
    .map((link) => {
      const safeUrl = escapeHtml(link.absolute_url || link.url || "");
      const safeLabel = escapeHtml(link.label || "Download my plan");
      return `<p><a href="${safeUrl}" style="display:inline-block;background:#03c978;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">${safeLabel}</a></p>`;
    })
    .join("");
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h1>Your Fitnet plan is ready</h1>
      <p>Hi ${safeName},</p>
      <p>Your ${escapeHtml(planType || "Fitnet")} plan is ready. Use the private links below to download your file${links.length > 1 ? "s" : ""}.</p>
      ${linkHtml}
      <p>This link expires on ${escapeHtml(new Date(expiresAt).toLocaleDateString("en-US"))}.</p>
      <p>Keep going,<br/>Fitnet</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

module.exports = {
  createProductionServices,
  buildResponseTextFormat,
  withRetryContext,
  repairActions
};
