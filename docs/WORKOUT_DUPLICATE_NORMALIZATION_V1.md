# Workout Duplicate Normalization V1

`workout_duplicate_normalization_v1` keeps repeat handling deterministic and prevents valid plans from failing because of model-written justification wording.

Before final validation, Fitnet:

- Replaces an avoidable repeated resistance exercise with an unused approved candidate from the same fixed slot.
- Adds a canonical reason when no unused candidate exists.
- Adds a canonical consistency reason for repeated cardio.
- Clears unnecessary reasons from exercises that are not repeated.

The backend still rejects unresolved same-day duplication and a third weekly use when an approved unused alternative exists. The V3 schema is unchanged.

The results page also exposes **Copy debug log** for `partial_ready` sessions, including failures after a manual retry.

Run validation with:

```bash
npm run validate:workout-duplicate-normalization
```
