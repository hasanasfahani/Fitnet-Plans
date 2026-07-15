# Workout Lower Slot Integrity V1

`workout_lower_slot_integrity_v1` prevents upper-body filler exercises from appearing in Lower and Legs sessions.

Allowed lower-day roles are limited to knee-dominant, hip-dominant, unilateral lower-body, quadriceps isolation, hamstring isolation, calves, core, and an explicitly planned cardio slot. Final plan validation also requires every non-cardio exercise on these days to belong to Legs or Core.

Supported gyms retain the full isolation structure. Home uses equipment-aware templates built only from available squat, lunge/split-squat, hinge, hip-extension, and core functions. In 60-75 minute Home sessions, one second hinge function is allowed because the approved Home library has no leg curl, leg extension, or calf exercise. No upper-body role is used as a fallback.

Run validation with:

```bash
npm run validate:workout-lower-slot-integrity
```
