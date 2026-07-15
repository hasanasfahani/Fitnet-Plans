const fs = require("fs");
const path = require("path");
const {
  METADATA_VERSION,
  canonicalMovementFamily,
  canonicalExerciseType,
  canonicalPrimaryMuscle,
  canonicalDisplayName,
  canonicalTrainingRole,
  TRAINING_ROLES,
  DISPLAY_NAME_ALIASES,
  substitutionGroup,
  canonicalSetupComplexity,
  canonicalStability,
  canonicalProgrammingValue,
  canonicalSelectionPriority,
  canonicalLaterality,
  canonicalFatigueCost,
  canonicalTimeMultiplier,
  canonicalOrderingPriority,
  canonicalRepRange,
  canonicalRestRange
} = require("../lib/exercise-metadata");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const requiredFields = ["display_name", "primary_muscle", "movement_family", "exercise_type", "training_role", "difficulty", "injury_flags", "substitution_group", "selection_priority", "setup_complexity", "stability", "general_programming_value", "laterality", "fatigue_cost", "time_multiplier", "ordering_priority", "recommended_rep_range", "recommended_rest_seconds", "metadata_version"];
const allowedTypes = new Set(["compound", "isolation", "core", "cardio"]);
const allowedDifficulties = new Set(["Beginner", "Intermediate", "Advanced"]);
const allowedInjuryFlags = new Set(["Knee", "Lower back", "Shoulder", "Wrist", "Neck"]);
const allowedSetupComplexities = new Set(["low", "moderate", "high"]);
const allowedStabilities = new Set(["low", "moderate", "high"]);
const allowedProgrammingValues = new Set(["low", "moderate", "high"]);
const errors = [];
const groupCounts = {};
const trainingRoleCounts = {};

for (const exercise of exercises) {
  for (const field of requiredFields) {
    if (exercise[field] === undefined || exercise[field] === null || exercise[field] === "") {
      errors.push(`missing_field:${exercise.exercise_id}:${field}`);
    }
  }
  if (!allowedTypes.has(exercise.exercise_type)) errors.push(`invalid_type:${exercise.exercise_id}:${exercise.exercise_type}`);
  if (!allowedDifficulties.has(exercise.difficulty)) errors.push(`invalid_difficulty:${exercise.exercise_id}:${exercise.difficulty}`);
  if (!Array.isArray(exercise.injury_flags)) errors.push(`invalid_injury_flags:${exercise.exercise_id}`);
  if (!Number.isInteger(exercise.selection_priority) || exercise.selection_priority < 1 || exercise.selection_priority > 5) errors.push(`invalid_selection_priority:${exercise.exercise_id}`);
  if (!allowedSetupComplexities.has(exercise.setup_complexity)) errors.push(`invalid_setup_complexity:${exercise.exercise_id}`);
  if (!allowedStabilities.has(exercise.stability)) errors.push(`invalid_stability:${exercise.exercise_id}`);
  if (!allowedProgrammingValues.has(exercise.general_programming_value)) errors.push(`invalid_programming_value:${exercise.exercise_id}`);
  for (const flag of exercise.injury_flags || []) {
    if (!allowedInjuryFlags.has(flag)) errors.push(`unknown_injury_flag:${exercise.exercise_id}:${flag}`);
  }
  if (!Array.isArray(exercise.sub_muscles) || !exercise.sub_muscles.length) errors.push(`invalid_sub_muscles:${exercise.exercise_id}`);
  if (!Array.isArray(exercise.equipment) || !exercise.equipment.length) errors.push(`invalid_equipment:${exercise.exercise_id}`);
  if (!Array.isArray(exercise.allowed_places) || !exercise.allowed_places.length) errors.push(`invalid_allowed_places:${exercise.exercise_id}`);
  const expectedMovement = canonicalMovementFamily(exercise.movement_pattern, exercise.category, exercise);
  const expectedType = canonicalExerciseType(exercise.exercise_type, exercise.category, exercise);
  const expectedPrimaryMuscle = canonicalPrimaryMuscle(exercise);
  const expectedDisplayName = canonicalDisplayName(exercise);
  const expectedTrainingRole = canonicalTrainingRole(exercise, expectedMovement, expectedType);
  const expectedSetupComplexity = canonicalSetupComplexity(exercise);
  const expectedStability = canonicalStability(exercise);
  const expectedProgrammingValue = canonicalProgrammingValue(exercise);
  const expectedSelectionPriority = canonicalSelectionPriority(exercise, expectedSetupComplexity, expectedStability, expectedProgrammingValue);
  const expectedLaterality = canonicalLaterality(exercise);
  const expectedFatigueCost = canonicalFatigueCost(exercise, expectedType, expectedSetupComplexity, expectedLaterality);
  const expectedTimeMultiplier = canonicalTimeMultiplier(exercise, expectedSetupComplexity, expectedLaterality);
  if (exercise.movement_family !== expectedMovement) errors.push(`invalid_movement_family:${exercise.exercise_id}:${exercise.movement_family}:${expectedMovement}`);
  if (exercise.exercise_type !== expectedType) errors.push(`invalid_canonical_type:${exercise.exercise_id}:${exercise.exercise_type}:${expectedType}`);
  if (exercise.primary_muscle !== expectedPrimaryMuscle) errors.push(`invalid_primary_muscle:${exercise.exercise_id}:${exercise.primary_muscle}:${expectedPrimaryMuscle}`);
  if (exercise.display_name !== expectedDisplayName) errors.push(`invalid_display_name:${exercise.exercise_id}:${exercise.display_name}:${expectedDisplayName}`);
  if (!TRAINING_ROLES.includes(exercise.training_role)) errors.push(`invalid_training_role:${exercise.exercise_id}:${exercise.training_role}`);
  if (exercise.training_role !== expectedTrainingRole) errors.push(`training_role_mismatch:${exercise.exercise_id}:${exercise.training_role}:${expectedTrainingRole}`);
  if (exercise.setup_complexity !== expectedSetupComplexity) errors.push(`setup_complexity_mismatch:${exercise.exercise_id}`);
  if (exercise.stability !== expectedStability) errors.push(`stability_mismatch:${exercise.exercise_id}`);
  if (exercise.general_programming_value !== expectedProgrammingValue) errors.push(`programming_value_mismatch:${exercise.exercise_id}`);
  if (exercise.selection_priority !== expectedSelectionPriority) errors.push(`selection_priority_mismatch:${exercise.exercise_id}`);
  if (exercise.laterality !== expectedLaterality) errors.push(`laterality_mismatch:${exercise.exercise_id}`);
  if (exercise.fatigue_cost !== expectedFatigueCost) errors.push(`fatigue_cost_mismatch:${exercise.exercise_id}`);
  if (exercise.time_multiplier !== expectedTimeMultiplier) errors.push(`time_multiplier_mismatch:${exercise.exercise_id}`);
  if (exercise.ordering_priority !== canonicalOrderingPriority(expectedType, exercise.category)) errors.push(`ordering_priority_mismatch:${exercise.exercise_id}`);
  if (JSON.stringify(exercise.recommended_rep_range) !== JSON.stringify(canonicalRepRange(expectedType, expectedMovement))) errors.push(`rep_range_mismatch:${exercise.exercise_id}`);
  if (JSON.stringify(exercise.recommended_rest_seconds) !== JSON.stringify(canonicalRestRange(expectedType, expectedMovement))) errors.push(`rest_range_mismatch:${exercise.exercise_id}`);
  const expectedGroup = substitutionGroup(exercise.category, exercise.movement_family, exercise.exercise_type);
  if (exercise.substitution_group !== expectedGroup) errors.push(`invalid_substitution_group:${exercise.exercise_id}`);
  if (exercise.metadata_version !== METADATA_VERSION) errors.push(`invalid_metadata_version:${exercise.exercise_id}`);
  groupCounts[exercise.substitution_group] = (groupCounts[exercise.substitution_group] || 0) + 1;
  trainingRoleCounts[exercise.training_role] = (trainingRoleCounts[exercise.training_role] || 0) + 1;
}
for (const [exerciseId, displayName] of Object.entries(DISPLAY_NAME_ALIASES)) {
  const exercise = exercises.find((item) => Number(item.exercise_id) === Number(exerciseId));
  if (!exercise || exercise.display_name !== displayName || !exercise.name) errors.push(`display_name_regression:${exerciseId}`);
}

const lowerBodyRegressions = {
  120: ["knee_flexion", "isolation"],
  121: ["knee_extension", "isolation"],
  502: ["hip_extension", "isolation"],
  513: ["hinge", "isolation"],
  531: ["hip_extension", "compound"],
  317: ["plantar_flexion", "isolation"],
  118: ["hip_flexion", "core"]
};
for (const [exerciseId, [movement, type]] of Object.entries(lowerBodyRegressions)) {
  const exercise = exercises.find((item) => Number(item.exercise_id) === Number(exerciseId));
  if (!exercise || exercise.movement_family !== movement || exercise.exercise_type !== type) {
    errors.push(`lower_body_regression:${exerciseId}:${exercise?.movement_family}:${exercise?.exercise_type}`);
  }
}

const substitutionReady = exercises.filter((exercise) => groupCounts[exercise.substitution_group] >= 2);
const substitutionCoverage = exercises.length ? substitutionReady.length / exercises.length : 0;
if (substitutionCoverage < 0.9) errors.push(`substitution_coverage_below_90_percent:${substitutionCoverage}`);

const singletonGroups = exercises
  .filter((exercise) => groupCounts[exercise.substitution_group] === 1)
  .map((exercise) => ({ exercise_id: exercise.exercise_id, name: exercise.name, substitution_group: exercise.substitution_group }));

console.log(
  JSON.stringify(
    {
      status: errors.length ? "failed" : "passed",
      metadata_version: METADATA_VERSION,
      records: exercises.length,
      complete_records: exercises.filter((exercise) => requiredFields.every((field) => exercise[field] !== undefined && exercise[field] !== null)).length,
      coach_reviewed_records: exercises.filter((exercise) => exercise.review_status === "coach_reviewed").length,
      canonical_movement_families: new Set(exercises.map((exercise) => exercise.movement_family)).size,
      training_role_counts: trainingRoleCounts,
      training_roles_present: Object.keys(trainingRoleCounts).length,
      substitution_groups: Object.keys(groupCounts).length,
      substitution_ready_records: substitutionReady.length,
      substitution_coverage_percent: Math.round(substitutionCoverage * 1000) / 10,
      singleton_groups: singletonGroups,
      lower_body_regressions_checked: Object.keys(lowerBodyRegressions).length,
      display_name_aliases_checked: Object.keys(DISPLAY_NAME_ALIASES).length,
      selection_quality_fields_checked: ["selection_priority", "setup_complexity", "stability", "general_programming_value", "laterality", "fatigue_cost", "time_multiplier", "ordering_priority", "recommended_rep_range", "recommended_rest_seconds"],
      errors
    },
    null,
    2
  )
);

if (errors.length) process.exitCode = 1;
