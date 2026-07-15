# Workout Output V3

`fitnet.workout.output.v3` is the production workout contract. V2 remains available for historical compatibility.

V3 keeps the same repeatable weekly routine and adds practical coaching value:

- Starting-load guidance
- Rep and load progression rules
- A response when training is too difficult
- A response when pain occurs
- Recovery guidance
- Broad pain and safety guidance
- One concise technique cue per exercise
- Non-numeric effort guidance without RIR/RPE
- Up to three approved substitution IDs per exercise

Substitutions must come from the selected exercise candidate's slot-specific approved list. The backend rejects invented, cross-slot, duplicate, or self-referencing substitutions.

Workout generation uses strict OpenAI Responses API JSON Schema formatting. The backend still canonicalizes and validates the result because provider formatting does not replace Fitnet's safety, candidate, duration, or business-rule checks.

The contract intentionally does not add warm-ups, distinct training weeks, RIR/RPE, tempo, deloads, or medical claims.

Run validation with:

```bash
npm run validate:workout-output-v3
```

