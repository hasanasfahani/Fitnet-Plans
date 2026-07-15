# Fitnet Plans

Fitnet Plans is a bilingual workout and nutrition plan generator prepared for Vercel. It generates a validated plan synchronously, shows the result to the customer, and renders each PDF on demand from a short-lived signed payload.

Generated plans, profiles, PDFs, leads, and email addresses are not stored. If the customer refreshes or closes the result page, the plan is lost and must be generated again. Upstash Redis stores only pseudonymous rate-limit counters.

## Run locally

1. Install Node.js 20+, Python 3, and the packages in `requirements.txt`.
2. Copy `.env.example` to `.env` and add the provider credentials you need.
3. Run `npm install` and `npm run dev`.
4. Open `http://localhost:3002`.

Turnstile is optional in local development. Production starts fail closed: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` must be configured before a generation request can pass the server-side verification gate.

## Production security

Generation is protected before any OpenAI request is made:

- Cloudflare Turnstile is verified by the server; browser-only verification is never trusted.
- Atomic Redis limits allow 3 accepted generation requests per rolling hour and 6 per rolling 24 hours per pseudonymous network address; duplicate clicks are blocked for 8 seconds.
- API origins are same-origin by default or explicitly allowlisted with `ALLOWED_ORIGINS`.
- Request bodies are capped at 64 KB by default.
- Security headers and a restrictive content security policy are enabled.
- Backend generation diagnostics stay server-side when `NODE_ENV=production`; the customer UI contains no copy-debug control.
- PDF requests require an HMAC signature and expire after 30 minutes, preventing customers from changing the plan payload before rendering.

These controls reduce automated token burning, repeated clicks, cross-site API abuse, and tampered PDF payloads. They do not replace account-level authentication if Fitnet later needs strict per-person quotas.

## Required production variables

At minimum, configure:

- `APP_BASE_URL` and `ALLOWED_ORIGINS`
- `OPENAI_API_KEY`
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- `PDF_SIGNING_SECRET` (a long random value used by both Vercel Functions)
- `RATE_LIMIT_SALT` (a different long random value is recommended)

No database, Vercel Blob, or email provider is required for the current stateless release.

## Deploy to Vercel

1. Import `hasanasfahani/Fitnet-Plans` into Vercel.
2. Keep the repository root as the project root and let Vercel detect the static frontend plus `/api` functions.
3. Add every required production variable listed above. Set `APP_BASE_URL` and `ALLOWED_ORIGINS` to the final Vercel/custom domain.
4. Deploy, then run one workout and one nutrition generation and download both PDFs.

The generation function is configured for a maximum 300-second duration and the Python PDF function for 120 seconds. The signed plan exists only in the browser between those two calls.

## Validation

Run the complete validation suite with:

```bash
npm run validate:all
```
