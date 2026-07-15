# Fitnet Plans

Fitnet Plans is a bilingual workout and nutrition plan generator. The Node server serves the web app and the generation API from the same origin, runs validated OpenAI generation, renders PDF plans, stores plan artifacts, and emails protected download links.

## Run locally

1. Install Node.js 20+, Python 3, and the packages in `requirements-pdf.txt`.
2. Copy `.env.example` to `.env` and add the provider credentials you need.
3. Run `npm install` and `npm run dev`.
4. Open `http://localhost:3002`.

Turnstile is optional in local development. Production starts fail closed: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` must be configured before a generation request can pass the server-side verification gate.

## Production security

Generation is protected before any OpenAI request is queued:

- Cloudflare Turnstile is verified by the server; browser-only verification is never trusted.
- Per-client generation attempts are limited to 3 per hour and 6 per rolling 24 hours; duplicate clicks are debounced.
- API origins are same-origin by default or explicitly allowlisted with `ALLOWED_ORIGINS`.
- Request bodies are capped at 64 KB by default.
- Security headers, a restrictive content security policy, disposable-email blocking, a lead honeypot, and email limits are enabled.
- Backend generation diagnostics stay server-side when `NODE_ENV=production`; the customer UI contains no copy-debug control.

For a multi-instance deployment, add an edge/WAF rate limit or replace the in-process counter with a shared Redis/Postgres counter. A good starting policy is three generation starts per IP per hour and a daily account/email allowance.

## Required production variables

At minimum, configure:

- `APP_BASE_URL` and `ALLOWED_ORIGINS`
- `OPENAI_API_KEY`
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
- `FITNET_PYTHON` if `python3` is not on the runtime path

Database, blob storage, and Resend variables are required for durable sessions, hosted PDFs, and email delivery respectively. See `.env.example` for the full list.

## Validation

Run the complete validation suite with:

```bash
npm run validate:all
```
