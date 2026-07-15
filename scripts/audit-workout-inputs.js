const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const libraryPath = path.join(ROOT, "data", "exercise_library.json");
const schemaPath = path.join(ROOT, "data", "contracts", "workout-output-v3.schema.json");
const libraryPayload = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
const exercises = Array.isArray(libraryPayload) ? libraryPayload : libraryPayload.exercises || [];
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

const requiredLibraryFields = [
  "exercise_id",
  "name",
  "display_name",
  "category",
  "sub_muscles",
  "primary_muscle",
  "equipment",
  "difficulty",
  "movement_pattern",
  "movement_family",
  "exercise_type",
  "training_role",
  "allowed_places",
  "contraindications",
  "injury_flags",
  "substitution_group",
  "metadata_version",
  "review_status"
];

const fieldCoverage = Object.fromEntries(
  requiredLibraryFields.map((field) => [field, exercises.filter((exercise) => hasValue(exercise[field])).length])
);

const missingRequiredFields = exercises.flatMap((exercise) =>
  requiredLibraryFields
    .filter((field) => exercise[field] === undefined || exercise[field] === null)
    .map((field) => ({ exercise_id: exercise.exercise_id, field }))
);

const duplicateIds = duplicateValues(exercises.map((exercise) => exercise.exercise_id));
const report = {
  status: missingRequiredFields.length || duplicateIds.length ? "failed" : "passed",
  audited_at: new Date().toISOString(),
  workout_input_contract: {
    goals: ["Lose Weight", "Build Muscle", "Gain Strength", "Improve Fitness", "Improve Body Shape"],
    experience_levels: ["Beginner", "Intermediate", "Advanced"],
    training_days: [2, 3, 4, 5, 6],
    session_durations_minutes: [30, 45, 60, 75, 90],
    workout_places: ["Home", "Building Gym", "Full Equipment Gym"],
    maximum_focus_areas: 2,
    injury_labels: ["Knee", "Lower back", "Shoulder", "Wrist", "Neck"]
  },
  exercise_library: {
    records: exercises.length,
    field_coverage: fieldCoverage,
    reviewed_records: exercises.filter((exercise) => exercise.review_status !== "auto_enriched_needs_review").length,
    pending_review_records: exercises.filter((exercise) => exercise.review_status === "auto_enriched_needs_review").length,
    records_with_contraindications: exercises.filter((exercise) => exercise.contraindications?.length).length,
    categories: countBy(exercises, "category"),
    movement_patterns: countBy(exercises, "movement_pattern"),
    exercise_types: countBy(exercises, "exercise_type"),
    missing_required_fields: missingRequiredFields,
    duplicate_exercise_ids: duplicateIds
  },
  output_schema: {
    id: schema.$id,
    required_root_fields: schema.required || [],
    additional_properties_allowed: schema.additionalProperties !== false
  }
};

console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return true;
  return value !== "";
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = String(item[field] ?? "missing");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
