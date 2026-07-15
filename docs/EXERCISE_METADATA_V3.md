# Exercise Metadata V3

> Superseded by `EXERCISE_METADATA_V4.md`.

`exercise_metadata_v3` adds one deterministic `training_role` to every approved exercise while preserving exercise IDs and imported source fields.

Allowed roles are:

- `horizontal_push`
- `vertical_push`
- `horizontal_pull`
- `vertical_pull`
- `knee_dominant`
- `hip_dominant`
- `unilateral_lower_body`
- `quadriceps_isolation`
- `hamstring_isolation`
- `calves`
- `side_rear_delts`
- `biceps`
- `triceps`
- `forearms`
- `core`
- `cardio`

The role is backend metadata, not AI-generated output. Candidate filtering and the compact AI exercise catalog use it directly. Existing category, primary muscle, sub-muscles, movement pattern, equipment, place, difficulty, injury flags, source name, and approved ID remain unchanged.

Run enrichment and validation with:

```bash
npm run enrich:exercise-metadata
npm run validate:exercise-metadata
npm run validate:exercise-training-roles
```
