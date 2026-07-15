# Workout Same-Function Policy V1

`workout_same_function_policy_v1` prevents two exercises with the same practical function from appearing in one workout when the backend can provide complementary work instead.

The canonical signature uses:

- `training_role`
- `movement_family`
- `exercise_type`
- `substitution_group`

Exercise names are never used for redundancy decisions.

Deterministic selection prefers a candidate whose function signature has not already appeared that day. Final AI-output validation rejects unresolved duplicate signatures. Cardio and core are excluded because repeated entries may carry distinct duration or trunk-training purposes.

Repeated roles remain valid when their functions differ. Examples include a compound press plus an isolation fly, or a hinge plus a separate hip-extension accessory.

Broad injury-driven structure adaptations remain deferred to Phase 2 and are excluded from this gate when conservative role replacement creates unavoidable overlap.

Run validation with:

```bash
npm run validate:workout-function-variety
```
