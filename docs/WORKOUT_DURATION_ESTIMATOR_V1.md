# Workout Duration Estimator V1

`workout_duration_estimator_v1` verifies that a generated workout is feasible within the session duration selected by the user.

The deterministic estimate includes:

- Working-set execution time
- Rest between working sets
- Initial exercise setup
- Equipment transitions
- Cardio duration from the prescribed minute range

The estimator uses the generated sets and rest values, fixed slot type, and approved exercise equipment. It allows a maximum 10% overrun to account for normal differences in repetition speed and gym setup.

Session exercise targets are fixed by the selected duration:

- 30 minutes: 5 exercises
- 45 minutes: 6 exercises
- 60 minutes: 7 exercises
- 75 minutes or longer: 8 exercises

Cardio counts as one exercise and its full prescribed duration counts toward the session. Thirty-minute sessions use an 8-10 minute cardio range when cardio is scheduled so the five-exercise target remains feasible.

Thirty-minute plans use 10-14 resistance working sets. Selected focus areas influence submuscle targeting and candidate ranking, but receive extra sets only when capacity remains inside the session budget and existing 10% duration tolerance.

Plans above the limit fail validation with:

```text
session_duration_exceeded:<day>:<estimated_minutes>:<maximum_minutes>
```

The complete per-exercise breakdown is stored in workout validation and development debug data, allowing timing problems to be diagnosed without guessing.

This is a feasibility model, not a promise that every user will finish at exactly the estimated minute. Warm-up time remains outside the plan because warm-ups are currently out of product scope.

Run its scenario and overload tests with:

```bash
npm run validate:workout-duration
```
