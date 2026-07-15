# Workout Quality Score V1

`workout_quality_score_v1` assigns an internal score out of 100 after all deterministic workout checks.

| Category | Points |
| --- | ---: |
| Movement and muscle coverage | 25 |
| Goal and focus alignment | 20 |
| Injury compatibility and pain response | 15 |
| Weekly volume balance | 15 |
| Session-time feasibility | 10 |
| Redundancy control | 10 |
| Coaching completeness | 5 |

The minimum delivery score is `85/100`. A low-scoring result is returned to the existing targeted AI retry loop with specific deduction reasons.

Critical safety remains absolute. Injury conflicts, restricted exercises, high-impact cardio conflicts, unsafe coaching language, and unapproved substitutions cannot pass merely because other categories score well.

The score and breakdown are stored internally with workout generation and debug data. They are not shown in the user PDF or presented as a medical or professional certification.

Run calibration and threshold tests with:

```bash
npm run validate:workout-score
```

