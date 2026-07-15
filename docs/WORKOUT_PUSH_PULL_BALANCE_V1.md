# Workout Push/Pull Balance V1

`workout_push_pull_balance_v1` keeps weekly direct pushing and pulling work within a `0.75-1.33` ratio.

Push volume counts only horizontal-push and vertical-push working sets. Pull volume counts only horizontal-pull and vertical-pull working sets. Rear delts, biceps, triceps, and forearms do not distort the ratio.

The backend corrects templates first, then deterministically reallocates working sets when schedule, duration, location, or focus emphasis would move the ratio outside the policy. Exercise counts, safe set ranges, day budgets, and total weekly work are preserved where capacity allows. Final AI-output validation independently rejects an out-of-range ratio.

Home vertical pulls remain equipment-aware horizontal pulls. Their working sets still count as pulling volume, while constrained Home Pull A/B variation is preserved through ordering and exercise selection.

Run validation with:

```bash
npm run validate:workout-push-pull-balance
```
