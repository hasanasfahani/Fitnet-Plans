# Workout Lower-Body Balance v1

Fitnet balances weekly lower-body working sets after the backend builds the fixed split and role skeleton.

## Canonical groups

- Quadriceps: `knee_dominant`, `unilateral_lower_body`, `quadriceps_isolation`
- Posterior chain: `hip_dominant`, `hamstring_isolation`

Calves and core are intentionally neutral. They remain available for complete lower-body sessions without distorting the balance measurement.

## Policy

- Accepted quadriceps-to-posterior working-set ratio: `0.75–1.40`.
- Exercise count, day names, slot roles, and split remain backend controlled and unchanged.
- Existing slots receive set transfers within their safe set ranges.
- Same-day transfers are preferred and session working-set budgets remain enforced.
- Legs and Glutes focus markers follow a transferred set when the target is also a selected focus role.
- Knee and lower-back structure adaptation remains outside this neutral programming rule.

The same ratio is checked in the backend strategy validator and in final AI-output quality validation.

Run `npm run validate:workout-lower-body-balance` to exercise all schedules, durations, locations, and lower-body focus modes.
