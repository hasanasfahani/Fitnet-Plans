# Exercise Metadata V4

`exercise_metadata_v4` retains every source and V3 canonical field and adds four deterministic candidate-quality fields:

- `selection_priority`: integer from 1 (preferred) to 5 (specialized fallback)
- `setup_complexity`: `low`, `moderate`, or `high`
- `stability`: `low`, `moderate`, or `high`
- `general_programming_value`: `low`, `moderate`, or `high`

The existing enrichment script derives these fields from trusted exercise metadata and curated exercise characteristics. The metadata validator recalculates every value and rejects drift. No approved IDs, training roles, movement families, equipment rules, or safety fields are changed.

Run enrichment and validation with:

```bash
npm run enrich:exercise-metadata
npm run validate:exercise-metadata
```
