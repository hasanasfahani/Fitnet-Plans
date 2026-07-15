# Workout AI Quality Policy V2

`workout_ai_quality_policy_v2` validates only decisions controlled by the model after the backend strategy, skeleton, and candidate pools have passed their own validators.

## AI-Controlled Checks

- One approved candidate matching every fixed slot and training role
- Selected movement and muscle compatibility with each slot
- Weekly direct-set volume inside backend-supplied bounds
- Session duration feasibility from selected sets and rest
- Safe sets, repetition ranges, and rest periods
- Exercise and movement repetition
- Exercise coaching completeness
- Complete progression and recovery guidance
- Actionable pain guidance and safe coaching language

## Backend-Controlled Checks

The AI quality score does not judge the split, day labels, slot distribution, role templates, exercise count, or cardio allocation. `validateWorkoutCoachingStrategy` validates those decisions before an AI request is made.

The AI gate compares selections with the fixed slots it receives. If the skeleton itself omits a required movement or muscle, strategy validation reports that backend defect instead of assigning an AI quality penalty.

Run validation with:

```bash
npm run validate:workout-quality
```
