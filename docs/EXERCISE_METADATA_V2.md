# Exercise Metadata V2

This contract is retained for history. Runtime exercise data now uses `exercise_metadata_v3`; see `EXERCISE_METADATA_V3.md`.

Required generated fields include:

- `primary_muscle`
- `display_name`
- `movement_family`
- `exercise_type`
- `difficulty`
- `injury_flags`
- `substitution_group`
- `metadata_version`

V2 corrects lower-body movement leakage from generic name parsing:

- Leg curls use `knee_flexion`
- Leg extensions use `knee_extension`
- Bridges, hip thrusts, pull-throughs, hip extensions, and glute presses use `hip_extension`
- Calf exercises use `plantar_flexion`
- Deadlifts, good mornings, and hyperextensions use `hinge`
- Leg raises use `hip_flexion`

Category, original movement pattern, sub-muscles, equipment, allowed places, contraindications, and review status remain available for auditing. Injury flags are broad product metadata, not clinical verification. Empty injury flags do not prove universal safety.

`name` remains the imported source label. `display_name` is the curated user-facing label used in generated plans and PDFs while preserving the same exercise ID.

Substitution groups are recalculated from canonical category, movement family, and exercise type. Location, equipment, experience, injury, and candidate-slot filtering still apply independently.

Run enrichment and validation with:

```bash
npm run enrich:exercise-metadata
npm run validate:exercise-metadata
```
