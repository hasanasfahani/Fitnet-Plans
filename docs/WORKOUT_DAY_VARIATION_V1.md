# Workout Day Variation V1

`workout_day_variation_v1` gives repeated day types complementary purposes:

- Upper A emphasizes horizontal pushing and pulling; Upper B emphasizes vertical pushing and pulling.
- Lower/Legs A emphasizes knee-dominant and unilateral work; Lower/Legs B emphasizes hip-dominant and hamstring work.
- Push A emphasizes horizontal pressing; Push B emphasizes vertical pressing.
- Pull A emphasizes horizontal pulling; Pull B emphasizes vertical pulling.
- Full Body A emphasizes knee-dominant and horizontal work; Full Body B emphasizes hip-dominant and vertical work.

Paired days retain required whole-program coverage but cannot have the same emphasis or the same role multiset. Complete generated-plan tests also cap selected exercise overlap at 50%. Existing duplicate validation still rejects same-day duplication, unjustified second uses, and third uses when approved alternatives exist.

Home templates preserve complementary intent through equipment-aware substitutions when vertical pulling or machine isolation roles are unavailable.

Run the variation matrix with:

```bash
npm run validate:workout-day-variation
```
