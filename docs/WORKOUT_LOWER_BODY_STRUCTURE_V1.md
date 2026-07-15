# Workout Lower-Body Structure V1

> Superseded by `WORKOUT_LOWER_BODY_STRUCTURE_V2.md`.

The backend assigns explicit lower-body training roles before candidate selection.

## Lower A

- Knee-dominant movement
- Hip hinge
- Knee flexion / hamstring accessory
- Trunk or practical accessory
- Optional unilateral and calf work when session time permits

## Lower B

- Unilateral knee-dominant movement
- Hip extension
- Knee flexion / hamstring accessory
- Trunk or practical accessory
- Optional squat and calf work when session time permits

The five-day `Legs` session is variant A and its later `Lower` session is variant B. Four- and six-day splits use their named A/B variants.

Home plans use approved posterior-chain and compound fallbacks because the current Home library has no leg-curl or calf exercises. Knee limitations replace squat/lunge roles with conservative approved lower-body candidates. Metadata v2 supplies canonical `knee_flexion`, `knee_extension`, `hip_extension`, and `plantar_flexion` families while preserving imported source fields.

Candidate filtering and final quality validation both enforce the fixed role. A lower workout is rejected when a selected exercise does not match its backend role or when more than two deadlift/pull-through/bridge/hip-thrust patterns appear in one day.

Run validation with:

```bash
npm run validate:workout-lower-body
```
