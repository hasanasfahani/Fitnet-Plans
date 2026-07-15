# Workout Volume Policy V1

`workout_volume_policy_v1` measures direct weekly sets by canonical training role and primary muscle rather than relying only on broad exercise categories.

The backend validates:

- Chest-to-back direct-set ratio between 0.5 and 2.0
- Push-to-pull role-set ratio between 0.5 and 2.0
- Quadriceps-to-posterior-chain role-set ratio between 0.5 and 2.0 for non-injury-adapted plans
- Actual role sets remain within 60%-160% of the backend role plan
- Planned shoulder, biceps, and triceps functions are not omitted
- No single role exceeds 45% of weekly direct work when at least four roles are present

Selected focus areas receive up to four additional sets only through spare session capacity and never replace required or optional role slots. A time-constrained 30-minute plan may add zero sets while still applying focus through submuscle targeting and candidate ranking. Full Body adds no focus sets. Arms requires biceps and triceps coverage; forearms remain optional.

Broad injury adaptations are excluded from quadriceps/posterior balance scoring until the separate injury phase.

Run validation with:

```bash
npm run validate:workout-volume-policy
```
