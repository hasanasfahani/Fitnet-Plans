# Workout Injury Selection Policy V1

The questionnaire provides broad injury labels only. Fitnet uses them for conservative exercise selection and coaching language, not diagnosis or rehabilitation.

For a neck limitation, the backend:

- Excludes explicit behind-neck and direct neck-loading exercises
- Prefers supported, seated, machine, or cable rows over bent-over rows when enough approved alternatives exist
- Prefers stable dumbbell, kettlebell, cable, lever, goblet, belt-squat, or machine lower-body loading over high axial barbell options when available
- Prefers stationary/recumbent bikes and elliptical-style cardio and avoids air-bike choices when stable alternatives exist
- Requires neutral or relaxed neck guidance
- Requires actionable stop guidance for worsening or spreading symptoms
- Continues to reject diagnosis, cure, treatment, rehabilitation, guaranteed-result, and push-through-pain claims

Safety preferences never authorize an exercise. Approved ID, location, equipment, experience, role, and injury filtering still apply.

Run validation with:

```bash
npm run validate:workout-injury-selection
```
