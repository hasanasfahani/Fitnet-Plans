# Workout Programming Scenario Matrix V1

`workout_programming_scenario_matrix_v1` tests the complete Phase 1 programming surface without injury-driven structure changes.

The Cartesian matrix covers:

- 2, 3, 4, 5, and 6 workout days
- 30, 45, 60, and 75 minute sessions
- Home, Building Gym, and Full Equipment Gym
- Weight loss, muscle gain, fitness, and strength goals
- Full Body and selected focus-area modes

This produces 480 generated workout programs. Every case must pass backend strategy validation, role-preserving candidate validation, the V3 AI quality gate, exact exercise-count targets, session-duration feasibility, cardio allocation, focus-volume bounds, progression and recovery completeness, exercise coaching completeness, and the 65 KB prompt guard.

All scenarios use `injuries: ["None"]`. Movement-specific injury adaptation remains Phase 2 work and is intentionally outside this matrix.

Run validation with:

```bash
npm run validate:workout-programming-matrix
```
