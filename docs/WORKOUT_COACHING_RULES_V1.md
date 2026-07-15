# Workout Coaching Rules V1

`workout_coaching_rules_v1` is the backend-controlled strategy used before Fitnet asks the AI to select exercises.

It defines:

- The fixed split for 2-6 training days
- Required muscles and movement-pattern groups for each day role
- Optional muscle groups
- Maximum repeated muscle slots
- Exercise and working-set budgets by selected session duration
- Focus-area priority limits
- Goal-aware weekly volume guidance
- Safe compound, isolation, core, and cardio ranges

Required day coverage is non-negotiable. A selected focus area may influence optional priority slots but cannot replace the base muscles or movement patterns needed for that day.

The strategy is included in the OpenAI prompt and development debug log. The fixed skeleton is validated against it before an AI request is made.

Phase 3 adds `workout_duration_estimator_v1`, which validates working-set execution, rest, setup, equipment transitions, and cardio duration against the selected session length.

Run the complete split and duration matrix with:

```bash
npm run validate:workout-strategy
```
