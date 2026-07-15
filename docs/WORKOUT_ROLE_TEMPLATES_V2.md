# Workout Role Templates V2

`workout_role_template_v2` retains the existing 2-6 day splits, duration-based exercise counts, cardio policy, and required/optional slot model.

V2 changes the paired lower-body templates only:

- Lower A and Legs A use knee-dominant, unilateral, quadriceps, hamstring, calf, and optional accessory capacity.
- Lower B and Legs B use a true hinge, separate hip extension, hamstring work, and exactly one knee-dominant role.
- The three-day standalone Lower session remains a balanced mixed session.

Home substitutions remain deterministic and role-aware. Candidate filtering still owns approved IDs, location, equipment, experience, and difficulty.

Run the complete template matrix with:

```bash
npm run validate:workout-role-templates
```
