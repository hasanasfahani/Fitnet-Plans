# Workout Candidate Policy V1

> Superseded by `WORKOUT_CANDIDATE_POLICY_V2.md`. V2 removes broad category fallback and preserves the backend-selected training role at every fallback tier.

`workout_candidate_policy_v1` determines which approved exercises the AI may consider for each fixed workout slot.

## Hard Eligibility

Every candidate must pass:

- Approved exercise ID
- Workout place
- Explicitly selected equipment, or the selected place's defaults when no equipment is chosen
- Experience-compatible difficulty
- Broad injury-flag exclusion
- Disliked-exercise exclusion when supplied
- Cardio versus resistance compatibility
- Required slot muscle category

Muscle category is never relaxed to an unrelated category.

## Relevance Ranking

Within the eligible category, Fitnet prefers candidates matching the canonical movement family and exercise type. If at least two exact candidates exist, only exact candidates are sent. Otherwise, same-category candidates fill the capped list and the slot is recorded as `category_fallback` for diagnostics.

Each slot sends no more than five quality-ranked candidates. This keeps 6-day, 8-exercise sessions inside the prompt-size guard while retaining approved options and substitutions. Exercise metadata is sent once in an approved catalog; each slot then references compact approved IDs and slot-specific substitution IDs instead of repeating full records.

## Approved Substitutions

Each candidate receives up to three substitution IDs. A substitution must:

- Already be eligible for the same user and slot
- Exist inside that slot's candidate list
- Share the same canonical substitution group
- Have a different approved exercise ID

Substitution grouping never bypasses place, equipment, injury, difficulty, or category filtering.

## Failure Behavior

Empty slots, wrong-category candidates, duplicate IDs, over-limit lists, and substitutions outside their approved slot fail before OpenAI is called. Development debug data records exact counts, category fallback slots, empty slots, and substitution coverage.

Run validation with:

```bash
npm run validate:workout-candidates
```
