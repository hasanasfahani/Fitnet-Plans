# Workout Role Templates V1

> Superseded by `WORKOUT_ROLE_TEMPLATES_V2.md`.

`workout_role_template_v1` is the backend-owned role distribution for every supported 2-6 day split.

Supported schedules remain:

- 2 days: Full Body A / Full Body B
- 3 days: Upper / Lower / Full Body
- 4 days: Upper A / Lower A / Upper B / Lower B
- 5 days: Push / Pull / Legs / Upper / Lower
- 6 days: Push / Pull / Legs repeated as A/B variants

Each resistance day exposes four required roles first. The 5th-8th exercises come from ordered optional roles as the session budget grows. Cardio may replace only the final optional resistance slot and remains the final exercise.

Home templates deterministically replace unsupported vertical-pull, leg-curl, leg-extension, and calf roles with approved available roles. Candidate filtering still enforces place, equipment, difficulty, approved IDs, and the canonical role.

Working sets are assigned from the duration budget after roles are selected. Safe exercise-level set, rep, rest, and duration validation remains unchanged.

Run the complete template matrix with:

```bash
npm run validate:workout-role-templates
```
