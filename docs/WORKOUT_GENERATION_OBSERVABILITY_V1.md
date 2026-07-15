# Workout Generation Observability V1

`workout_generation_observability_v1` records structured diagnostics for workout generation without changing generation, validation, or repair decisions.

## Generation summary

- Contract version and timestamps
- Base prompt character count
- Candidate slot and candidate record counts
- Total generation and provider latency
- Accepted attempt
- Whether targeted repair was attempted and succeeded
- Final generation status

## Attempt summary

Each initial or targeted-repair attempt records:

- Request prompt character count
- Provider latency
- Response character count
- Provider token usage when available
- Whether malformed JSON required provider repair
- Normalization change count and up to 25 changed paths
- Validation error count and categories
- Internal quality score and threshold
- Attempt outcome

Validation errors are grouped into stable operational categories: coaching quality, session feasibility, training balance, exercise variety, approved catalog, safety, contract structure, provider, and other.

The observability object does not contain questionnaire answers, full prompts, previous plan JSON, or generated plan text. Existing development debug fields remain available separately and continue to be hidden when debug exposure is disabled in production.

Run validation with:

```bash
npm run validate:workout-observability
```
