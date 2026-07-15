# Workout Coaching Language Variety v1

Fitnet requires coaching text to be concise, actionable, and useful for the exercise it accompanies.

## Generation rules

- Technique cues describe a relevant body position, movement path, or execution detail.
- Effort guidance explains when to stop a set without using RIR or RPE.
- Wording varies across the program instead of repeatedly relying on `controlled`, `smooth`, or `stable`.
- Recovery guidance covers fatigue and workout scheduling. It does not repeat the four-week instruction or progression rules.

## Validation

The final quality gate rejects clear copy repetition across technique cues or effort guidance, excessive concentration of generic cue wording, duplicate recovery items, and recovery text that restates the program repeat instruction.

These checks evaluate AI-controlled text only. They do not change the split, exercise slots, exercise selection, set allocation, or PDF layout.

Run `npm run validate:workout-coaching-variety` for the focused acceptance test.
