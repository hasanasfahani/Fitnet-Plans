# Workout Cardio Duration Policy V1

`workout_cardio_duration_policy_v1` fixes cardio duration in the backend before the AI generates a plan.

Default bounds are:

- 30-minute session: 8-10 minutes
- 45-minute session: 12-15 minutes
- 60-minute session: 15-20 minutes
- 75-minute session: 20 minutes

For each cardio day, the backend estimates resistance execution, rest, initial setup, equipment transitions, and the transition to cardio. The remaining session capacity is clamped to the duration-specific bound and stored on the fixed cardio slot. If capacity is constrained, cardio is shortened before resistance coverage is removed.

The AI must copy the slot's minute range exactly. Final validation rejects a changed or widened cardio range, and the existing duration estimator still enforces the complete session limit.

Run validation with:

```bash
npm run validate:workout-cardio-duration
```
