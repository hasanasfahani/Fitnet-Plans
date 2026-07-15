# Workout Presentation Language v1

Fitnet keeps imported source exercise names and IDs internally, while every customer-facing surface uses a canonical professional display name.

## Exercise names

- Raw equipment taxonomy such as `Lever` and `Sled` is converted into familiar gym terminology.
- Common spelling and formatting problems are normalized, including grip labels, single-arm labels, machine labels, and imported typos.
- The same canonical display name is used in AI candidates, generated plan JSON, and PDFs.
- Source names remain available internally for traceability and are never used as the PDF fallback when a display name exists.

## PDF language

The cover describes the value of the plan to the user. It does not mention JSON, validation, schemas, candidate pools, backend decisions, IDs, or internal libraries.

Run `npm run validate:exercise-display-names` and `npm run validate:workout-pdf-content` to verify the policy.
