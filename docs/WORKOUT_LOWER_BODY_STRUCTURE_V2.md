# Workout Lower-Body Structure V2

`workout_lower_body_structure_v2` makes paired lower-body sessions complementary without changing split logic or duration-based exercise counts.

## Lower A

Lower A is knee dominant and prioritizes:

- One knee-dominant compound
- One unilateral knee-dominant movement
- Quadriceps isolation when supported by the location
- Hamstring isolation when supported by the location
- Calves when supported by the location
- One optional core or practical accessory slot as session capacity grows

The standalone three-day `Lower` session remains balanced rather than being forced into the paired Lower A policy.

## Lower B

Lower B is hip dominant and requires:

- One true hinge
- One separate hip-extension exercise
- Hamstring isolation when supported by the location
- Exactly one squat or lunge role
- Calves when supported by the location
- Optional core or practical accessory work as capacity grows

Lower B fails backend strategy validation when the hinge is missing, hip-extension work is missing, or more than one knee-dominant role is present. Lower A and Lower B must not have identical lower-role distributions.

Home plans use `workout_lower_slot_integrity_v1` equipment-aware templates because the approved Home library currently has no leg-curl, leg-extension, or calf exercise. They preserve knee- and hip-dominant emphasis using squat, lunge/split-squat, hinge, hip-extension, and core work only; no upper-body filler role is permitted.

Home templates preserve the required lower-body functions and replace unsupported leg-curl, leg-extension, or calf capacity with distinct available accessories. Existing broad injury adaptations remain outside this policy and are not redesigned here.

Run validation with:

```bash
npm run validate:workout-lower-body
```
