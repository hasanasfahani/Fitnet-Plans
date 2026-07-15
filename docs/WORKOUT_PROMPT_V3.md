# Workout Prompt V3

`workout_program_v3_1` is Fitnet's single main AI coaching request for workout generation. It keeps the existing `fitnet.workout.output.v3` response schema.

## Inputs

The request contains:

- Available profile context: gender, birth date, derived age, height, weight, and fitness experience
- Goal, training days, session duration, workout place, equipment mode, focus areas, and broad injury labels
- Backend-selected split and coaching strategy
- Fixed workout days and slots
- Safe training and duration constraints
- One deduplicated approved exercise catalog
- Compact approved candidate and substitution IDs per slot
- Exact root, summary, day, and exercise fields with expected types

The prompt does not claim to know pain triggers, diagnoses, severity, or tolerated movements because the current questionnaire does not collect them.

## Responsibility Boundary

The backend controls eligibility, split, slots, safety ranges, time feasibility, IDs, and validation. The model chooses the best eligible exercise for each slot, sets, rep ranges, rest, rationale, day focus, repeat instruction, and concise safety notes.

The prompt explicitly treats the split, day labels, slot order, training roles, exercise count, and cardio allocation as immutable. It requires one approved candidate per fixed role, meaningful A/B exercise variation where suitable alternatives exist, prescriptions inside supplied set/rep/rest and time ranges, and minimal unnecessary weekly repetition.

The model cannot add warm-ups, distinct weeks, RIR/RPE, tempo, deloads, exercises, IDs, or output fields outside `fitnet.workout.output.v3`. V3 permits one concise coaching cue and non-numeric effort guidance per exercise.

## Performance

Exercise metadata is sent once in a catalog rather than repeated per slot. The largest supported six-day test prompt is guarded below 65,000 characters. Invalid outputs may still trigger targeted repair attempts, but the first request remains compact.

Run validation with:

```bash
npm run validate:workout-prompt
```
