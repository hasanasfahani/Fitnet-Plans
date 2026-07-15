# Workout Candidate Policy V2

`workout_candidate_policy_v2` determines which approved exercises the AI may consider for each backend-owned workout slot.

## Hard Eligibility

Every candidate must pass all of these checks before relevance ranking:

- Approved exercise ID from the supplied library
- Canonical training role required by the slot
- Workout location
- Explicitly selected equipment, or the location defaults when equipment is not selected
- Experience-compatible difficulty
- Injury and disliked-exercise exclusions
- Cardio versus resistance compatibility
- Required broad muscle category

Hard eligibility is never relaxed by a fallback.

## Role-Preserving Hierarchy

Candidate supply uses the first non-empty tier:

1. Same training role, movement pattern, and exercise type
2. Same training role and exercise type
3. Same training role

Each slot receives at most six candidates. If all three tiers are empty, the slot is reported as `role_unavailable` and generation fails before OpenAI is called. The backend never fills it with an unrelated movement from the same muscle category.

Approved substitutions remain inside the selected slot pool and must share the same substitution group. They cannot bypass role, location, equipment, experience, injury, or difficulty rules.

Diagnostics record the selected tier, tier candidate counts, role-unavailable slots, and substitution coverage.

Run validation with:

```bash
npm run validate:workout-candidates
```
