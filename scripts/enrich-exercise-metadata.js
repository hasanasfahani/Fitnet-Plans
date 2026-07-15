const fs = require("fs");
const path = require("path");
const { enrichExerciseMetadata } = require("../lib/exercise-metadata");

const root = path.join(__dirname, "..");
const libraryPath = path.join(root, "data", "exercise_library.json");
const payload = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
const exercises = Array.isArray(payload) ? payload : payload.exercises || [];
const enriched = exercises.map(enrichExerciseMetadata);

fs.writeFileSync(libraryPath, `${JSON.stringify(enriched, null, 2)}\n`);
console.log(`Enriched ${enriched.length} exercises with ${enriched[0]?.metadata_version || "current metadata"}.`);
