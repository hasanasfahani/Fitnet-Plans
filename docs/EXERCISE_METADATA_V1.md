# Exercise Metadata V1 (Superseded)

This contract is retained for history. Runtime exercise data now uses `exercise_metadata_v2`; see `EXERCISE_METADATA_V2.md`.

`exercise_metadata_v1` adds the smallest reliable structure needed for stronger workout selection while preserving Fitnet's approved exercise IDs and original taxonomy.

Every exercise now contains:

- `movement_family`: a canonical movement family derived from the imported movement pattern
- `exercise_type`: compound, isolation, core, or cardio
- `difficulty`: Beginner, Intermediate, or Advanced
- `injury_flags`: normalized broad product injury labels
- `substitution_group`: exercises sharing category, movement family, and type
- `metadata_version`: `exercise_metadata_v1`

The original `movement_pattern`, `contraindications`, category, and sub-muscles remain available for compatibility and auditing.

## Trust Boundary

These fields are automatically enriched and all records remain `auto_enriched_needs_review`. Metadata completeness does not mean coach or clinical verification. In particular, an empty `injury_flags` array must never be interpreted as proof that an exercise is safe for every injury.

## Substitution Groups

Substitution groups never authorize an exercise by themselves. A substitute must still pass the user's workout place, equipment, difficulty, injury, disliked-exercise, day-slot, and approved-ID filters.

Singleton groups are reported honestly. Fitnet does not invent a substitute merely to make coverage appear complete.

## Model Payload

The AI receives compact candidate metadata: approved ID, name, category, sub-muscles, canonical movement family, type, difficulty, injury flags, and substitution group. Candidate lists remain capped at eight exercises per slot to protect latency and prompt size.

Run validation with:

```bash
npm run validate:exercise-metadata
```
