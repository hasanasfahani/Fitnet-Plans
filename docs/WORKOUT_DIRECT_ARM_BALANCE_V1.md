# Workout Direct Arm Balance V1

`workout_direct_arm_balance_v1` balances direct biceps and triceps work without adding exercises or treating compound pressing and pulling as direct arm slots.

The backend counts canonical `biceps` and `triceps` roles on Upper, Push, and Pull days. Their weekly slot counts may differ by at most one. In paired Upper/Lower schedules, Upper A receives direct triceps work and Upper B receives direct biceps work before longer-session optional arm capacity is added.

Lower-body templates do not add direct biceps or triceps isolation when the selected gym supports the intended leg roles. Home fallback accessories remain outside arm-balance scoring because they represent unavailable equipment capacity rather than planned arm specialization.

When both direct arm roles are planned, final AI output may differ by at most four direct sets, equivalent to one isolation slot. Planned-role omission and existing safe-set validation still apply.

Run validation with:

```bash
npm run validate:workout-arm-balance
```
