# Workout User-Facing Language V1

`workout_user_facing_language_v1` prevents internal product terminology from appearing in generated coaching content.

The reusable validator scans:

- Coaching rationale
- Exercise cues and effort guidance
- Progression guidance
- Recovery guidance
- Pain and safety guidance
- Cardio notes
- Four-week repeat instruction

It rejects references to backend systems, candidate pools, catalogs, injury flags, validation, schemas, approved IDs, and slot IDs. Natural coaching language such as "approved alternative" remains valid.

Each violation identifies its user-facing field and term. A retry receives one targeted instruction to rewrite only the identified sentence without changing its meaning. The V3 response schema and PDF structure are unchanged.

Run validation with:

```bash
npm run validate:workout-user-language
```
