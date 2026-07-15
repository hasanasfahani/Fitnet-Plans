# Fitnet Phase 2 Data Foundation

This folder contains the source-library and schema foundation for later generation phases.

- `exercise_library.json` is generated from `exercises_library_structure.csv` by `npm run import:exercises`.
- `food_library.json` is the approved starter nutrition library.
- `schema.sql` defines the planned PostgreSQL tables for sessions, leads, libraries, generated plans, attempts, email events, and security events.

Phase 2 rule: generators may only reference approved `exercise_id` and `food_id` values from these files/tables.

## Phase 3 Workout Engine

Workout generation lives in `lib/workout-engine.js`. It follows the backend-led contract:

- normalize UI choices into internal enums and exclusions
- build fixed day/slot skeletons before selection
- filter approved candidate exercises per slot
- select only from candidates
- validate selected exercise IDs, slots, duplicates, restrictions, reps, and cardio notes
- repair invalid output or fall back to deterministic candidate selection

This phase does not generate nutrition plans, PDFs, emails, or live LLM calls.

## Phase 4 Nutrition Engine

Nutrition generation lives in `lib/nutrition-engine.js`. It follows the constrained nutrition contract:

- normalize goal/profile/nutrition choices into calorie and macro targets
- build fixed meal slots before selection
- filter approved candidate foods by meal type, diet style, allergies, and restrictions
- select only approved `food_id` values
- calculate meal totals using serving multipliers for approved foods
- validate invented foods, allergy conflicts, missing/extra meals, calories, and protein floor
- repair invalid output or fall back to deterministic approved-food templates

This phase does not add PDFs, emails, anti-spam, or live LLM calls.

## Phase 5 Prompt And JSON Contract

Prompt and JSON contract helpers live in `lib/plan-contracts.js`.

- `data/contracts/workout-output.schema.json` defines `fitnet.workout.output.v1`
- `data/contracts/nutrition-output.schema.json` defines `fitnet.nutrition.output.v1`
- workout and nutrition prompts include the hard candidate-only instruction
- repair prompts include validation errors, invalid JSON, allowed candidate IDs, and the required JSON-only repair instruction
- canonicalizers strip UI/debug-only fields before strict contract validation

This phase does not call an LLM. It prepares the exact contracts later LLM calls must use.

## Phase 6 PDF Generation

PDF rendering is implemented in `scripts/render_plan_pdf.py`, with demo orchestration in `scripts/generate-pdf-demo.js`.

- PDFs are generated only from canonical validated plan JSON
- exercise names are resolved from `data/exercise_library.json` by `exercise_id`
- food names are resolved from `data/food_library.json` by `food_id`
- unresolved IDs fail PDF generation
- final artifacts are written to `output/pdf/`
- temporary render payloads are written to `tmp/pdfs/`

This phase does not add email delivery, signed URLs, anti-spam, or live LLM calls.

## Phase 7 Security And Anti-Spam

Security controls live in `lib/security-guards.js`, with policy in `data/security-policy.json`.

- browser fingerprint based generation rate limiting
- duplicate generation debounce window
- lead form honeypot
- CAPTCHA placeholder challenge
- disposable email domain blocking
- email submission rate limiting
- LLM generation kill switch
- structured security event hooks shaped for the later `security_events` table

These controls are currently local/client-side because API routes are Phase 8. Server enforcement should reuse the same guard logic once the API layer exists.

## Phase 8 APIs

The local API implementation lives in `lib/api-core.js`, with a dependency-free Node HTTP wrapper in `scripts/dev-api-server.js`.

- `POST /api/generation/session` creates an anonymous session
- `POST /api/generation/goal` saves the selected goal
- `POST /api/generation/profile` saves the basic profile
- `POST /api/generation/plan-type` saves workout/nutrition/both
- `POST /api/generation/workout-inputs` saves workout journey choices
- `POST /api/generation/nutrition-inputs` saves nutrition journey choices
- `POST /api/generation/start` queues generation and runs the constrained engines/PDF renderer
- `GET /api/generation/status/:sessionId` returns loading and readiness state
- `GET /api/generation/preview/:sessionId` returns teaser summary data only
- `POST /api/generation/access` validates lead/security controls and simulates email delivery
- `GET /api/download/:token` serves the PDF through a signed 7-day token

Runtime session and token files are written under `output/api/`. Generated PDFs continue to use `output/pdf/`.

This phase keeps persistence and email delivery local/simulated; the endpoint contracts are ready to replace JSON files with PostgreSQL and the simulated email event with a real provider.

## Phase 9 QA And Acceptance

Phase 9 acceptance coverage lives in `scripts/validate-acceptance.js`.

Run it with:

```bash
npm run validate:acceptance
```

The acceptance runner verifies:

- workout-only, nutrition-only, and combined flows through the API
- selected goal propagation into workout and nutrition generation
- teaser previews do not expose full plan JSON
- approved exercise and food IDs only
- invalid generated structures are rejected and deterministic fallback paths produce valid plans
- PDFs are generated before email events
- access links use signed `/api/download/:token` URLs instead of raw file paths
- spam controls block duplicate generation and disposable emails
- loading/status responses expose success, failure, timeout, and retryable states

## Phase 10 Build Order

Phase 10 turns the implementation order into one full-project verification command.

Run:

```bash
npm run validate:all
```

The command verifies the completed build order:

1. data model and source libraries
2. workout engine
3. nutrition engine
4. prompt and JSON contracts
5. PDF rendering
6. security and anti-spam
7. APIs
8. QA and acceptance

It also removes runtime temp payloads and local API session files after the checks finish. Phase 1 remains the static browser funnel and should be smoke-tested visually with `npm run dev`.
