# Workout Generation Input Audit

Status: Phase 1 complete  
Audited: 2026-06-29  
Scope: Workout generation only

## Purpose

This document defines what Fitnet currently knows before generating a workout, where each value comes from, how it is transformed, and whether it is reliable enough to control plan quality. It is the input contract for later workout-quality phases.

The current product generates one weekly routine that the user repeats for four weeks. Four distinct training weeks, deloads, and weekly periodization are intentionally out of scope.

## End-to-End Flow

```text
Browser questionnaire
  -> generation session endpoints
  -> persisted session choices
  -> normalized workout input
  -> backend-selected split and fixed slots
  -> approved candidate filtering and ranking
  -> one OpenAI workout request
  -> canonicalization and deterministic validation
  -> targeted retries when invalid
  -> workout PDF
```

## Questionnaire Input Contract

| Field | Source | Allowed values or format | Used by workout generation | Trust |
| --- | --- | --- | --- | --- |
| `goal` | Goal screen | Lose Weight, Build Muscle, Gain Strength, Improve Fitness, Improve Body Shape | Rep range, rest, sets, cardio policy, prompt context | User-provided, enumerated |
| `profile.gender` | Profile screen | Male, Female, Other | Sent in profile; Other is converted to Male | User-provided; conversion is a product rule |
| `profile.birth_date` | Profile screen | `YYYY-MM-DD`; UI currently offers ages 13-90 | Stored and sent in profile, but not used by the workout engine | User-provided; currently inactive for programming |
| `profile.height_cm` | Profile screen | Positive numeric text | Stored and sent in profile, but not used by the workout engine | User-provided; currently inactive for programming |
| `profile.weight_kg` | Profile screen | Positive numeric text | Stored and sent in profile, but not used by the workout engine | User-provided; currently inactive for programming |
| `profile.experience` | Profile screen | Beginner, Intermediate, Advanced | Candidate difficulty, strength sets, prompt context | User-provided, enumerated |
| `plan_type` | Plan type screen | Workout Only, Nutrition Only, Workout + Nutrition | Determines whether workout generation runs | User-provided, enumerated |
| `workout.days` | Workout screen | 2-6 | Backend split, day count | User-provided, enumerated |
| `workout.duration` | Workout screen | 30, 45, 60, 75, or 90 minutes | Fixed exercise-slot count and validator range | User-provided, enumerated |
| `workout.place` | Workout screen | Home, Building Gym, Full Equipment Gym | Allowed equipment and place filtering | User-provided, enumerated |
| `workout.split` | Hidden product value | Currently `Auto` | Backend maps training days to a fixed split | Backend-controlled |
| `workout.focusAreas` | Workout screen | Maximum two; Full Body is default and mutually exclusive with specific areas | Slot priority and candidate ranking | User-provided, enumerated |
| `workout.equipment` | Workout screen | Product equipment list | Candidate filtering; empty means all equipment allowed at selected place | User-provided, enumerated |
| `workout.injuries` | Workout screen | None, Knee, Lower back, Shoulder, Wrist, Neck | Contraindication filtering, low-impact cardio rule, prompt context | User-provided broad screening only |
| `workout.dislikedExercises` | Legacy/hidden flow | Approved exercise objects | Explicit candidate exclusion | Supported by backend but not currently collected in the visible form |

## Backend-Normalized Workout Context

`normalizeWorkoutInput` creates the authoritative context passed to skeleton construction and the AI prompt:

```json
{
  "goal": "Build Muscle",
  "days": 3,
  "duration_minutes": 30,
  "place": "Full Equipment Gym",
  "library_place": "Full Equipment Gym",
  "split": "upper_lower_full_body_3",
  "experience": "Intermediate",
  "focus_areas": ["Full Body"],
  "equipment": [
    "Bodyweight",
    "Dumbbells",
    "Barbell",
    "Cable machine",
    "Resistance bands",
    "Kettlebell",
    "Machines",
    "Bench",
    "Treadmill",
    "Upright stationary bike",
    "Recumbent bike",
    "Elliptical / cross-trainer",
    "Rowing ergometer",
    "Stepmill / stair climber"
  ],
  "allowed_equipment": [
    "Bodyweight",
    "Dumbbells",
    "Barbell",
    "Cable machine",
    "Resistance bands",
    "Kettlebell",
    "Machines",
    "Bench",
    "Treadmill",
    "Upright stationary bike",
    "Recumbent bike",
    "Elliptical / cross-trainer",
    "Rowing ergometer",
    "Stepmill / stair climber"
  ],
  "injuries": ["Knee", "Neck"],
  "disliked_exercise_ids": [],
  "disliked_exercises": [],
  "excluded_contraindications": ["Knee", "Neck"]
}
```

The equipment arrays are populated from place defaults when the user does not select equipment.

## Backend-Controlled Split

| Days | Internal split | User-facing days |
| ---: | --- | --- |
| 2 | `full_body_2` | Full Body A, Full Body B |
| 3 | `upper_lower_full_body_3` | Upper, Lower, Full Body |
| 4 | `upper_lower_ab_4` | Upper A, Lower A, Upper B, Lower B |
| 5 | `ppl_upper_lower_5` | Push, Pull, Legs, Upper, Lower |
| 6 | `ppl_x2_6` | Push A, Pull A, Legs A, Push B, Pull B, Legs B |

The user does not choose a split. The backend is the source of truth.

## Current Session-Duration Behavior

| Selected duration | Skeleton slots per day | Validator range |
| ---: | ---: | ---: |
| 30 minutes | 4 | 3-5 exercises |
| 45 minutes | 5 | 4-6 exercises |
| 60 minutes | 6 | 5-8 exercises |
| 75 minutes | 6 | 5-8 exercises |
| 90 minutes | 6 | 5-8 exercises |

Exercise count establishes the skeleton size. `workout_duration_estimator_v1` now performs a second feasibility check using generated sets, execution time, rest time, initial setup, equipment transitions, and cardio duration, with a 10% maximum overrun tolerance.

## Exercise Library Contract

The current approved library contains 423 records. Every record contains:

- `exercise_id`
- `name`
- `category`
- `sub_muscles`
- `equipment`
- `difficulty`
- `movement_pattern`
- `movement_family`
- `exercise_type`
- `allowed_places`
- `contraindications`
- `injury_flags`
- `substitution_group`
- `metadata_version`
- `review_status`

Current review status is `auto_enriched_needs_review` for all 423 records. Movement family, exercise type, difficulty, equipment, place, injury flags, and substitution groups therefore exist, but they are generated metadata rather than coach-reviewed truth.

Contraindication coverage is especially incomplete: only records with non-empty contraindication arrays can be actively excluded by injury tags. Run `npm run audit:workout-inputs` for current counts.

### Trust Classification

| Data | Classification | Permitted use |
| --- | --- | --- |
| Exercise ID and name | Trusted imported identity | Hard ID validation and PDF resolution |
| Category and sub-muscles | Primary available taxonomy | Slot grouping and weekly muscle checks |
| Equipment and allowed places | Generated, needs review | Candidate filtering with audit monitoring |
| Difficulty | Generated, needs review | Candidate ranking and broad experience filtering |
| Movement pattern and exercise type | Generated, needs review | Skeleton matching and heuristic balance checks |
| Contraindications | Partial generated coverage | Conservative exclusion only; absence is not proof of safety |

## Candidate Filtering and Ranking

For every fixed slot, the backend:

1. Requires an approved exercise ID.
2. Separates cardio from resistance exercises.
3. Excludes explicitly disliked exercise IDs.
4. Requires an allowed workout place.
5. Applies broad experience-to-difficulty filtering.
6. Rejects matching contraindication tags.
7. Checks selected or place-allowed equipment.
8. Prefers exact muscle category, exercise type, movement pattern, focus area, place, and experience matches.
9. Sends at most eight candidates per slot to OpenAI.

Muscle category is never relaxed. Canonical movement family and exercise type are preferred; when fewer than two exact candidates exist, Fitnet may use same-category candidates and records the slot as `category_fallback`. Empty candidate slots fail before OpenAI is called.

## AI Request Contract

The workout request uses `workout_program_v2` and includes:

- The full available normalized workout and profile context
- Backend-fixed days and slots
- Up to eight approved candidates per slot
- Required root and exercise fields
- Strength and cardio formatting rules
- Injury-aware cardio instructions
- Day-balance instructions

The model may select only supplied candidate IDs. It selects exercises, sets, rep ranges, rest values, day focus, rationale, approved substitutions, technique cues, effort guidance, progression guidance, recovery guidance, and safety guidance inside the current schema.

The `workout_program_v3_1` prompt uses the unchanged `fitnet.workout.output.v3` strict provider-level JSON Schema, then the response is canonicalized, mechanically normalized, and validated again by Fitnet's backend safety and quality rules.

## Current Workout Output Contract

Required root fields:

- `program_version`
- `program_summary`
- `plan_days`
- `progression_guidance`
- `recovery_guidance`
- `pain_safety_guidance`
- `repeat_instruction`

Each day requires an index, fixed name, day focus, and exercises. Each exercise requires its fixed slot, approved ID, display metadata, sets, rep range, rest, notes, non-numeric effort guidance, one concise coaching cue, and approved substitution IDs.

The contract intentionally forbids distinct weeks, warm-ups, RIR/RPE, tempo, deloads, and weekly periodization. The plan is one weekly routine with practical load-and-repetition progression guidance.

## Current Deterministic Validation

The backend currently rejects:

- Incorrect day count
- Missing or duplicate slots
- Exercise IDs outside a slot's approved candidates
- Contraindication matches
- Unjustified repeated exercises when alternatives exist
- Unsafe set ranges
- Invalid strength/cardio formatting
- Cardio in a non-final position
- High-impact cardio for selected lower-body or back pain flags
- Some lower-day and upper-day balance failures
- Exercise counts outside broad duration ranges
- Estimated sessions exceeding the selected duration by more than 10%
- Unsupported output fields

It calculates direct weekly sets by broad muscle category, rejects extreme major-category imbalance, and assigns an internal weighted quality score. It does not yet calculate indirect sets, detailed sub-muscle volume, or complete cross-day pattern redundancy.

## Runtime and Latency Baseline

- Default model: `gpt-5.4-mini`
- Maximum workout attempts: `FITNET_WORKOUT_LLM_ATTEMPTS`, default and hard maximum 2 (initial plus one targeted repair)
- Maximum nutrition attempts: `FITNET_LLM_ATTEMPTS`, default 3
- Overall generation timeout: `FITNET_JOB_TIMEOUT_MS`, default 5 minutes
- Frontend polling: every 1.2 seconds, up to 300 polls
- Malformed JSON can trigger an additional model call for repair

The latest audited real session required two workout attempts: approximately 9.8 seconds for the rejected attempt and 9.0 seconds for the accepted attempt. Its first prompt was roughly 30,900 serialized characters; the repair prompt grew to roughly 38,100 characters because it included validation context and previous JSON. This is one observed session, not a production percentile.

## Confirmed Gaps for Later Phases

1. Height, weight, derived age, and gender are available to the coaching prompt, but hard exercise eligibility remains driven by experience, schedule, equipment, focus, and broad injury constraints.
2. Injury answers are broad labels without pain triggers, severity, diagnosis, or tolerated movements.
3. All exercise enrichment remains unreviewed; contraindications are incomplete.
4. Equipment matching uses normalized text and substring comparisons.
5. Empty user equipment means the full place equipment list, not confirmed equipment availability; explicit selections now constrain candidates correctly.
6. Duration estimation uses deterministic averages; it does not yet have exercise-specific execution or setup metadata.
7. Strict category filtering can relax when candidate supply is low.
8. The prompt mentions pain triggers although the questionnaire does not collect them.
9. The visible form no longer collects disliked exercises, while the backend and PDF still support them.
10. Weekly direct-set diagnostics use broad categories; detailed sub-muscle and indirect-set accounting remains unavailable.
11. Provider JSON mode is used, but the provider is not given the full JSON Schema as a strict response format.
12. Resolved in Phase 11: workout attempts now expose a privacy-conscious observability summary for prompt size, provider latency, response size, normalization changes, validation categories, quality score, repair outcome, and total duration.

## Phase 1 Completion Criteria

- Every workout prompt input is mapped to its source.
- Backend-derived values are distinguished from user answers.
- Exercise-library fields are classified by trust level.
- Current split, filtering, prompt, schema, validation, retry, and timing behavior are documented.
- Known quality and observability gaps are recorded without changing generation behavior.
- `npm run audit:workout-inputs` reproduces the library and contract audit.
