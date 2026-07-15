# Workout Quality Policy V1

> Superseded for AI-output ownership by `WORKOUT_AI_QUALITY_POLICY_V2.md`.

`workout_quality_policy_v1` validates coaching quality after schema, candidate, and mechanical normalization checks.

It verifies:

- Actual selected exercises satisfy required muscles and movement families
- Fixed day names, summary goal, split, duration, and workout place remain unchanged
- No excessive same-muscle or same-movement repetition
- Required weekly muscles are represented
- Direct weekly sets remain balanced across canonical training roles and primary muscles
- Chest/back, push/pull, and quadriceps/posterior-chain ratios stay inside backend-owned bounds
- Planned shoulder and arm functions are not omitted or excessively concentrated
- Selected focus categories receive bounded extra sets without replacing required slots
- Rep ranges and rest periods stay inside backend safe ranges
- Injury-flagged candidates do not re-enter the plan
- Pain-response guidance is actionable
- Coaching text avoids diagnosis, cures, rehabilitation claims, guaranteed outcomes, and pushing through pain
- Existing duration, ordering, ID, substitution, and schema validation still passes

The policy stores diagnostics for weekly direct sets, canonical training-role sets, primary-muscle sets, balance ratios, focus-area additions, required muscles, day-level muscle and movement counts, and selected slot count. Phase 9 uses these diagnostics in `workout_quality_score_v1`.

Broad injury answers can alter the skeleton before candidates are selected. Quadriceps/posterior-chain ratio scoring is therefore deferred for knee and lower-back adaptations until the separate injury phase.

## Validation Ownership

The AI quality gate scores only fields the model controls: approved exercise selection, safe sets/reps/rest, duration feasibility, suitability, repetition, coaching completeness, and progression/recovery/safety guidance. Split, day labels, slot distribution, cardio count, workout place, and the session-duration target are backend-owned and canonicalized before quality validation. Broad category differences created by the backend skeleton are not independent AI scoring failures.

Run validation with:

```bash
npm run validate:workout-quality
```
