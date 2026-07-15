(function attachSecurityGuards(root) {
  const DEFAULT_POLICY = {
    llm_generation_enabled: true,
    captcha: {
      enabled: true,
      challenge: "Type FITNET to continue",
      expected_answer: "FITNET"
    },
    limits: {
      generation_attempts_per_hour: 3,
      generation_attempts_per_day: 6,
      email_submissions_per_day: 3,
      duplicate_generation_window_ms: 8000
    },
    blocked_disposable_email_domains: []
  };
  const memoryStore = {};

  function createSecurityState(policy = DEFAULT_POLICY, storage = null, now = () => Date.now()) {
    return {
      policy: mergePolicy(DEFAULT_POLICY, policy),
      storage: storage || getDefaultStorage(),
      now,
      events: []
    };
  }

  function buildBrowserFingerprint(source = root) {
    const navigator = source.navigator || {};
    const screen = source.screen || {};
    return stableHash(
      [
        navigator.userAgent || "unknown-agent",
        navigator.language || "unknown-language",
        screen.width || 0,
        screen.height || 0,
        source.devicePixelRatio || 1,
        Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown-zone"
      ].join("|")
    );
  }

  function validateGenerationRequest(securityState, context = {}) {
    const policy = securityState.policy;
    const fingerprint = context.fingerprint || buildBrowserFingerprint();

    if (!policy.llm_generation_enabled) {
      return deny(securityState, "generation_kill_switch", { fingerprint });
    }

    const duplicateKey = `duplicate_generation:${fingerprint}`;
    const lastGeneration = Number(read(securityState, duplicateKey) || 0);
    const duplicateWindow = policy.limits.duplicate_generation_window_ms;

    if (securityState.now() - lastGeneration < duplicateWindow) {
      return deny(securityState, "duplicate_generation_debounced", { fingerprint });
    }

    const rate = incrementWindow(securityState, `generation_hour:${fingerprint}`, 60 * 60 * 1000);

    if (rate.count > policy.limits.generation_attempts_per_hour) {
      return deny(securityState, "generation_rate_limited", {
        fingerprint,
        count: rate.count
      });
    }

    const dailyRate = incrementWindow(securityState, `generation_day:${fingerprint}`, 24 * 60 * 60 * 1000);
    if (dailyRate.count > policy.limits.generation_attempts_per_day) {
      return deny(securityState, "generation_daily_rate_limited", {
        fingerprint,
        count: dailyRate.count
      });
    }

    write(securityState, duplicateKey, String(securityState.now()));
    return allow(securityState, "generation_allowed", {
      fingerprint,
      hourly_count: rate.count,
      daily_count: dailyRate.count
    });
  }

  function validateLeadSubmission(securityState, form) {
    const email = normalizeEmail(form.email);
    const domain = email.split("@")[1] || "";
    const emailHash = stableHash(email);

    if (form.honeypot) {
      return deny(securityState, "honeypot_triggered", { email_hash: emailHash });
    }

    if (!form.name || !email || !form.consent) {
      return deny(securityState, "lead_missing_required_fields", { email_hash: emailHash });
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return deny(securityState, "lead_invalid_email", { email_hash: emailHash });
    }

    if (securityState.policy.blocked_disposable_email_domains.includes(domain)) {
      return deny(securityState, "disposable_email_blocked", { email_hash: emailHash, domain });
    }

    const captcha = securityState.policy.captcha;
    if (captcha.enabled && normalizeCaptcha(form.captcha) !== normalizeCaptcha(captcha.expected_answer)) {
      return deny(securityState, "captcha_failed", { email_hash: emailHash });
    }

    const rate = incrementWindow(securityState, `email_day:${emailHash}`, 24 * 60 * 60 * 1000);
    if (rate.count > securityState.policy.limits.email_submissions_per_day) {
      return deny(securityState, "email_rate_limited", { email_hash: emailHash, count: rate.count });
    }

    return allow(securityState, "lead_allowed", { email_hash: emailHash, count: rate.count });
  }

  function consumeSecurityEvents(securityState) {
    const events = securityState.events.slice();
    securityState.events.length = 0;
    return events;
  }

  function logEvent(securityState, event_type, metadata = {}) {
    const event = {
      event_type,
      metadata,
      created_at: new Date(securityState.now()).toISOString()
    };
    securityState.events.push(event);
    return event;
  }

  function allow(securityState, eventType, metadata) {
    logEvent(securityState, eventType, metadata);
    return { allowed: true, event_type: eventType, metadata };
  }

  function deny(securityState, eventType, metadata) {
    logEvent(securityState, eventType, metadata);
    return { allowed: false, reason: eventType, event_type: eventType, metadata };
  }

  function incrementWindow(securityState, key, windowMs) {
    const now = securityState.now();
    const existing = JSON.parse(read(securityState, key) || "null");
    const next =
      existing && now < existing.reset_at
        ? { count: existing.count + 1, reset_at: existing.reset_at }
        : { count: 1, reset_at: now + windowMs };

    write(securityState, key, JSON.stringify(next));
    return next;
  }

  function normalizeEmail(email = "") {
    return String(email).trim().toLowerCase();
  }

  function normalizeCaptcha(value = "") {
    return String(value).trim().toUpperCase();
  }

  function stableHash(value) {
    let hash = 2166136261;
    const text = String(value);

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function read(securityState, key) {
    try {
      return securityState.storage.getItem(`fitnet_security:${key}`);
    } catch {
      return memoryStore[`fitnet_security:${key}`] || null;
    }
  }

  function write(securityState, key, value) {
    try {
      securityState.storage.setItem(`fitnet_security:${key}`, value);
    } catch {
      memoryStore[`fitnet_security:${key}`] = value;
    }
  }

  function getDefaultStorage() {
    try {
      if (root.localStorage) {
        return root.localStorage;
      }
    } catch {
      // Fall through to memory storage.
    }

    return {
      getItem(key) {
        return memoryStore[key] || null;
      },
      setItem(key, value) {
        memoryStore[key] = String(value);
      }
    };
  }

  function mergePolicy(base, override) {
    return {
      ...base,
      ...override,
      captcha: { ...base.captcha, ...(override.captcha || {}) },
      limits: { ...base.limits, ...(override.limits || {}) },
      blocked_disposable_email_domains:
        override.blocked_disposable_email_domains || base.blocked_disposable_email_domains
    };
  }

  const api = {
    DEFAULT_POLICY,
    createSecurityState,
    buildBrowserFingerprint,
    validateGenerationRequest,
    validateLeadSubmission,
    consumeSecurityEvents,
    stableHash
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.FitnetSecurityGuards = api;
})(typeof window !== "undefined" ? window : globalThis);
