# Workout Candidate Quality Ranking V1

`workout_candidate_quality_ranking_v1` improves default exercise selection after all hard eligibility filters have passed.

Ranking considers, in order with the existing relevance score:

- Correct training role and slot function
- User location, equipment, experience, and difficulty
- General programming value
- Stability
- Setup complexity
- Selection priority
- Focus and submuscle relevance
- Weekly exercise variety

Quality metadata never bypasses approved IDs, role matching, place, equipment, difficulty, injury exclusions, or candidate limits. Candidate arrays are sent to the AI in backend preference order, avoiding response-schema expansion and repeated prompt metadata.

Run validation with:

```bash
npm run validate:workout-candidate-quality
```
