const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { createFitnetApi } = require("../lib/api-core");
const { createProductionServices } = require("../lib/production-services");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 3002);
const maxBodyBytes = Number(process.env.MAX_REQUEST_BODY_BYTES || 64 * 1024);
const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean)
);
const services = createProductionServices({
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${port}`
});
const api = createFitnetApi({
  services,
  securityPolicy: process.env.NODE_ENV === "production" ? undefined : localSecurityPolicy()
});

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (!url.pathname.startsWith("/api/")) {
      serveStatic(request, response, url.pathname);
      return;
    }

    const cors = corsHeaders(request);
    if (!isAllowedOrigin(request)) {
      send(response, { status: 403, headers: cors, body: { error: "origin_not_allowed" } });
      return;
    }
    if (request.method === "OPTIONS") {
      send(response, { status: 204, headers: cors, body: {} });
      return;
    }

    const body = await readBody(request);
    const result = await Promise.resolve(api.handleApiRequest({
      method: request.method,
      pathname: url.pathname,
      body,
      headers: request.headers
    }));
    send(response, { ...result, headers: { ...cors, ...securityHeaders(), ...result.headers } });
  } catch (error) {
    const status = error.code === "request_too_large" ? 413 : 400;
    send(response, {
      status,
      headers: securityHeaders(),
      body: { error: error.code || "bad_request", message: "The request could not be processed." }
    });
  }
});

server.listen(port, () => {
  console.log(`Fitnet web app listening on http://localhost:${port}`);
  console.log(
    `Providers: OpenAI=${services.hasOpenAI} Supabase=${services.hasDatabase} Blob=${services.hasBlob} Resend=${services.hasEmail} Turnstile=${services.turnstileRequired}`
  );
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        const error = new Error("request_too_large");
        error.code = "request_too_large";
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", reject);
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error("invalid_json");
        error.code = "invalid_json";
        reject(error);
      }
    });
  });
}

function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, { status: 405, headers: securityHeaders(), body: "Method not allowed" });
    return;
  }
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) || !isPublicFile(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(response, { status: 404, headers: securityHeaders(), body: "Not found" });
    return;
  }
  response.writeHead(200, {
    ...securityHeaders(),
    "content-type": mimeType(file),
    "cache-control": relative === "index.html" ? "no-cache" : "public, max-age=3600"
  });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(file).pipe(response);
}

function isPublicFile(relative) {
  return relative === "index.html" || relative === "app.js" || /^(app|assets|data|lib)\//.test(relative);
}

function isAllowedOrigin(request) {
  const origin = String(request.headers.origin || "").replace(/\/$/, "");
  if (!origin) return true;
  if (allowedOrigins.size) return allowedOrigins.has(origin);
  if (process.env.NODE_ENV !== "production") return /^http:\/\/localhost:\d+$/.test(origin);
  const hostOrigin = `${request.headers["x-forwarded-proto"] || "https"}://${request.headers.host}`;
  return origin === hostOrigin;
}

function corsHeaders(request) {
  const origin = String(request.headers.origin || "").replace(/\/$/, "");
  return {
    ...(origin && isAllowedOrigin(request) ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "connect-src 'self' https://challenges.cloudflare.com",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:"
    ].join("; ")
  };
}

function send(response, result) {
  if (response.headersSent || response.destroyed) return;
  const headers = { ...(result.headers || {}) };
  if (!Buffer.isBuffer(result.body) && typeof result.body !== "string" && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  response.writeHead(result.status, headers);
  if (result.status === 204) return response.end();
  if (Buffer.isBuffer(result.body)) return response.end(result.body);
  if (typeof result.body === "string") return response.end(result.body);
  response.end(JSON.stringify(result.body || {}));
}

function mimeType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf"
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function localSecurityPolicy() {
  return {
    llm_generation_enabled: true,
    captcha: { enabled: false },
    limits: {
      generation_attempts_per_hour: 3,
      generation_attempts_per_day: 6,
      email_submissions_per_day: 5,
      duplicate_generation_window_ms: 8000
    },
    blocked_disposable_email_domains: []
  };
}
