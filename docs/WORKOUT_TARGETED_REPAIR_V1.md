# Workout Targeted Repair V1

`workout_targeted_repair_v1` allows one repair after the initial workout generation attempt.

The maximum workout model calls per generation job are:

1. Initial complete workout generation
2. One targeted repair when the first result fails backend validation or the 85-point quality threshold

The repair receives:

- The previous normalized JSON
- Deduplicated backend validation errors
- Quality-score deduction reasons
- Compact repair actions grouped by safety, structure, duration, coverage, redundancy, substitutions, and coaching depth
- The unchanged v3 schema, coaching strategy, fixed slots, approved catalog, and candidate IDs

The model must return the complete strict JSON object, but it is instructed to preserve valid fields and change only what is necessary. It is no longer told to regenerate the plan from scratch.

If the second attempt still fails, Fitnet does not deliver the workout. The existing result page exposes the retryable failure and development debug log.

Nutrition keeps its independent retry configuration; this policy applies only to workout generation.

Run validation with:

```bash
npm run validate:workout-repair
```

