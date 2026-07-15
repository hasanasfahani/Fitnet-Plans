const METADATA_VERSION = "exercise_metadata_v5";

const TRAINING_ROLES = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "knee_dominant",
  "hip_dominant",
  "unilateral_lower_body",
  "quadriceps_isolation",
  "hamstring_isolation",
  "calves",
  "side_rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "cardio"
];

const MOVEMENT_FAMILY_ALIASES = {
  back: "horizontal_pull",
  chest: "push",
  shoulders: "raise",
  triceps: "elbow_extension",
  legs: "leg_isolation"
};

const DISPLAY_NAME_ALIASES = {
  119: "Plate-Loaded Deadlift",
  131: "Single-Leg Extension Machine",
  198: "Machine Shoulder Press",
  498: "Barbell Single-Leg Squat",
  516: "Single-Leg Press Machine",
  133: "Seated Single-Leg Curl Machine",
  179: "Behind-the-Neck Barbell Shoulder Press",
  204: "Close-Grip Barbell Shoulder Press",
  581: "Treadmill Run",
  582: "Rowing Machine",
  583: "Elliptical Trainer",
  584: "Recumbent Stationary Bike",
  585: "Treadmill Walk",
  586: "Upright Stationary Bike",
  587: "Stair Climber",
  588: "Elliptical Cross-Trainer",
  589: "Jump Rope Double-Unders",
  590: "Air Bike",
  591: "Curved Manual Treadmill"
};

function enrichExerciseMetadata(exercise) {
  const movementFamily = canonicalMovementFamily(exercise.movement_pattern, exercise.category, exercise);
  const exerciseType = canonicalExerciseType(exercise.exercise_type, exercise.category, exercise);
  const difficulty = canonicalDifficulty(exercise.difficulty);
  const injuryFlags = uniqueStrings(exercise.injury_flags || exercise.contraindications || []);
  const setupComplexity = canonicalSetupComplexity(exercise);
  const stability = canonicalStability(exercise);
  const generalProgrammingValue = canonicalProgrammingValue(exercise);
  const laterality = canonicalLaterality(exercise);
  const fatigueCost = canonicalFatigueCost(exercise, exerciseType, setupComplexity, laterality);
  const timeMultiplier = canonicalTimeMultiplier(exercise, setupComplexity, laterality);

  return {
    ...exercise,
    display_name: canonicalDisplayName(exercise),
    primary_muscle: canonicalPrimaryMuscle(exercise),
    difficulty,
    movement_family: movementFamily,
    exercise_type: exerciseType,
    training_role: canonicalTrainingRole(exercise, movementFamily, exerciseType),
    injury_flags: injuryFlags,
    substitution_group: substitutionGroup(exercise.category, movementFamily, exerciseType),
    selection_priority: canonicalSelectionPriority(exercise, setupComplexity, stability, generalProgrammingValue),
    setup_complexity: setupComplexity,
    stability,
    general_programming_value: generalProgrammingValue,
    laterality,
    fatigue_cost: fatigueCost,
    time_multiplier: timeMultiplier,
    ordering_priority: canonicalOrderingPriority(exerciseType, exercise.category),
    recommended_rep_range: canonicalRepRange(exerciseType, movementFamily),
    recommended_rest_seconds: canonicalRestRange(exerciseType, movementFamily),
    metadata_version: METADATA_VERSION
  };
}

function canonicalLaterality(exercise) {
  const text = exerciseSearchText(exercise);
  return /single[- ]?(?:arm|leg)|one[- ]?(?:arm|leg)|alternat|unilateral|split squat|lunge/.test(text) ? "unilateral" : "bilateral";
}

function canonicalFatigueCost(exercise, exerciseType = canonicalExerciseType(exercise.exercise_type, exercise.category, exercise), setupComplexity = canonicalSetupComplexity(exercise), laterality = canonicalLaterality(exercise)) {
  const text = exerciseSearchText(exercise);
  let cost = exerciseType === "compound" ? 3 : exerciseType === "cardio" ? 3 : 1;
  if (/deadlift|squat|leg press|lunge|split squat|rowing machine|air bike|stair/.test(text)) cost += 1;
  if (laterality === "unilateral") cost += 1;
  if (setupComplexity === "high") cost += 1;
  return Math.max(1, Math.min(5, cost));
}

function canonicalTimeMultiplier(exercise, setupComplexity = canonicalSetupComplexity(exercise), laterality = canonicalLaterality(exercise)) {
  let multiplier = laterality === "unilateral" ? 1.35 : 1;
  if (setupComplexity === "high") multiplier += 0.15;
  return Number(multiplier.toFixed(2));
}

function canonicalOrderingPriority(exerciseType, category) {
  if (exerciseType === "compound") return 1;
  if (exerciseType === "isolation" && ["Chest", "Back", "Shoulders", "Legs"].includes(category)) return 2;
  if (exerciseType === "isolation") return 3;
  if (exerciseType === "core") return 4;
  return 5;
}

function canonicalRepRange(exerciseType, movementFamily) {
  if (exerciseType === "cardio") return [8, 25];
  if (exerciseType === "core") return [10, 20];
  if (exerciseType === "isolation") return [8, 20];
  if (movementFamily === "hinge") return [5, 10];
  return [6, 12];
}

function canonicalRestRange(exerciseType, movementFamily) {
  if (exerciseType === "cardio") return [0, 0];
  if (exerciseType === "core" || exerciseType === "isolation") return [45, 90];
  if (movementFamily === "hinge") return [90, 180];
  return [75, 150];
}

function canonicalSetupComplexity(exercise) {
  const text = exerciseSearchText(exercise);
  if (/cable front squat|cable bent over row|good morning|olympic|clean and jerk|snatch|muscle up|handstand|double-under|behind.{0,8}(neck|head)/.test(text)) return "high";
  if (/machine|lever|sled|assisted|bodyweight|mat|seated|lying|bench/.test(text)) return "low";
  if (/dumbbell|kettlebell|resistance band|cable (curl|extension|raise|fly|pushdown)|treadmill|bike|elliptical/.test(text)) return "low";
  return "moderate";
}

function canonicalStability(exercise) {
  const text = exerciseSearchText(exercise);
  if (/curtsy|curtsey|bosu|stability ball|single arm bent over|one arm bent over|cable front squat|cable bent over row|good morning|behind.{0,8}(neck|head)|pistol squat|handstand/.test(text)) return "low";
  if (/machine|lever|sled|seated|lying|chest supported|bench supported|assisted|leg press|hack squat|smith/.test(text)) return "high";
  return "moderate";
}

function canonicalProgrammingValue(exercise) {
  const text = exerciseSearchText(exercise);
  if (/curtsy|curtsey|behind.{0,8}(neck|head)|bosu|stability ball|cable front squat|cable bent over row with rope|good morning|lying supine biceps curl|lying one arm supinated triceps extension|one arm bent over lateral raise|double-under|muscle up|handstand/.test(text)) return "low";
  if (/bench press|chest press|shoulder press|overhead press|pull.?up|chin.?up|pulldown|seated row|chest supported|squat|leg press|deadlift|romanian|lunge|split squat|leg curl|leg extension|calf|hip thrust|glute bridge|lateral raise|biceps curl|hammer curl|triceps extension|pushdown|plank|crunch|treadmill|stationary bike|elliptical|rowing machine/.test(text)) return "high";
  return "moderate";
}

function canonicalSelectionPriority(exercise, setupComplexity = canonicalSetupComplexity(exercise), stability = canonicalStability(exercise), programmingValue = canonicalProgrammingValue(exercise)) {
  let priority = 3;
  if (programmingValue === "high") priority -= 1;
  if (programmingValue === "low") priority += 1;
  if (stability === "high") priority -= 1;
  if (stability === "low") priority += 1;
  if (setupComplexity === "high") priority += 1;
  return Math.max(1, Math.min(5, priority));
}

function exerciseSearchText(exercise) {
  return `${exercise.name || ""} ${(exercise.equipment || []).join(" ")}`.toLowerCase();
}

function canonicalTrainingRole(exercise, movementFamily = canonicalMovementFamily(exercise.movement_pattern, exercise.category, exercise), exerciseType = canonicalExerciseType(exercise.exercise_type, exercise.category, exercise)) {
  const category = String(exercise.category || "");
  const name = String(exercise.name || "").toLowerCase();
  if (exerciseType === "cardio" || category === "Cardio") return "cardio";
  if (exerciseType === "core" || category === "Core" || movementFamily === "hip_flexion") return "core";
  if (category === "Chest") return "horizontal_push";
  if (category === "Shoulders") return movementFamily === "push" ? "vertical_push" : "side_rear_delts";
  if (category === "Back") return movementFamily === "vertical_pull" ? "vertical_pull" : "horizontal_pull";
  if (category === "Biceps") return "biceps";
  if (category === "Triceps") return "triceps";
  if (category === "Forearms") return "forearms";
  if (category === "Legs") {
    if (movementFamily === "knee_extension" || /leg extension/.test(name)) return "quadriceps_isolation";
    if (movementFamily === "knee_flexion" || /leg curl/.test(name)) return "hamstring_isolation";
    if (movementFamily === "plantar_flexion" || /calf/.test(name)) return "calves";
    if (movementFamily === "lunge" || /split squat|single leg squat|lunge/.test(name)) return "unilateral_lower_body";
    if (["hinge", "hip_extension"].includes(movementFamily)) return "hip_dominant";
    return "knee_dominant";
  }
  return "core";
}

function canonicalDisplayName(exercise) {
  const source = DISPLAY_NAME_ALIASES[Number(exercise.exercise_id)] || String(exercise.name || "Exercise").trim();
  return professionalDisplayName(source);
}

function professionalDisplayName(value) {
  return String(value || "Exercise")
    .trim()
    .replace(/^Lever Cable Shoulder Press$/i, "Machine Shoulder Press")
    .replace(/^Lever /i, "Machine ")
    .replace(/^Sled Full Hack Squat$/i, "Hack Squat Machine")
    .replace(/^Sled Vertical Leg Press$/i, "Vertical Leg Press")
    .replace(/^Sled Calf Press On Leg Press$/i, "Leg Press Calf Raise")
    .replace(/^Sled Forward Angled Calf Raise$/i, "Angled Calf Raise Machine")
    .replace(/^Sled /i, "Machine ")
    .replace(/^Cable Fly with Chest Supported$/i, "Chest-Supported Cable Fly")
    .replace(/^Dumbbell Bent Over Row with Chest Support$/i, "Chest-Supported Dumbbell Row")
    .replace(/^Cable Low Seated Row$/i, "Seated Cable Row")
    .replace(/^Dumbbell Rear Lunge$/i, "Dumbbell Reverse Lunge")
    .replace(/\bGobelt\b/gi, "Goblet")
    .replace(/\bCurtsey\b/gi, "Curtsy")
    .replace(/\bPullove\b/gi, "Pullover")
    .replace(/\bShoulders Press\b/gi, "Shoulder Press")
    .replace(/\bAlternate\b/gi, "Alternating")
    .replace(/\bTwo Legs\b/gi, "Two-Leg")
    .replace(/\bOne Arm\b/gi, "Single-Arm")
    .replace(/\bSingle Arm\b/gi, "Single-Arm")
    .replace(/\bClose grip\b/gi, "Close-Grip")
    .replace(/\bWide grip\b/gi, "Wide-Grip")
    .replace(/\bNeutral grip\b/gi, "Neutral-Grip")
    .replace(/\bReverse grip\b/gi, "Reverse-Grip")
    .replace(/\bHammer grip\b/gi, "Hammer-Grip")
    .replace(/\bplate loaded\b/gi, "Plate-Loaded")
    .replace(/^Machine Kneeling Leg Curl - Plate-Loaded$/i, "Plate-Loaded Kneeling Leg Curl")
    .replace(/\bT bar\b/gi, "T-Bar")
    .replace(/\bChin up\b/gi, "Chin-Up")
    .replace(/\bPull Up\b/gi, "Pull-Up")
    .replace(/\bPush Up\b/gi, "Push-Up")
    .replace(/\bSit up\b/gi, "Sit-Up")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function isProfessionalDisplayName(value) {
  return !/\b(?:lever|sled|alternate|one leg|military press)\b/i.test(String(value || ""));
}

function canonicalMovementFamily(value, category, exercise = {}) {
  const name = String(exercise.name || "").toLowerCase();
  const subMuscles = (exercise.sub_muscles || []).map((item) => String(item).toLowerCase());
  if (category === "Legs") {
    if (/leg curl/.test(name)) return "knee_flexion";
    if (/leg extension/.test(name)) return "knee_extension";
    if (/calf/.test(name) || subMuscles.includes("calves")) return "plantar_flexion";
    if (/bridge|hip thrust|pull through|hip extension|glute press/.test(name)) return "hip_extension";
    if (/deadlift|good morning|hyperextension/.test(name)) return "hinge";
    if (/lunge/.test(name)) return "lunge";
    if (/squat|leg press/.test(name)) return "squat";
    if (/leg raise/.test(name)) return "hip_flexion";
  }
  const normalized = slug(value || category || "other");
  return MOVEMENT_FAMILY_ALIASES[normalized] || normalized;
}

function canonicalExerciseType(value, category, exercise = {}) {
  const name = String(exercise.name || "").toLowerCase();
  if (category === "Cardio") return "cardio";
  if (category === "Core") return "core";
  if (category === "Legs" && /hanging leg raise/.test(name)) return "core";
  if (category === "Legs" && /leg curl|leg extension|calf|bridge|hip thrust|pull through|hip extension|hyperextension|leg raise/.test(name)) return "isolation";
  if (category === "Legs" && /deadlift|squat|lunge|leg press|good morning/.test(name)) return "compound";
  return ["compound", "isolation", "core", "cardio"].includes(value) ? value : "isolation";
}

function canonicalPrimaryMuscle(exercise) {
  const name = String(exercise.name || "").toLowerCase();
  if (exercise.category === "Legs" && /hanging leg raise/.test(name)) return "Core";
  return exercise.category || "Other";
}

function canonicalDifficulty(value) {
  return ["Beginner", "Intermediate", "Advanced"].includes(value) ? value : "Intermediate";
}

function substitutionGroup(category, movementFamily, exerciseType) {
  return [slug(category || "other"), slug(movementFamily), slug(exerciseType)].join(":");
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "other";
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

module.exports = {
  METADATA_VERSION,
  enrichExerciseMetadata,
  canonicalMovementFamily,
  canonicalExerciseType,
  canonicalPrimaryMuscle,
  canonicalDisplayName,
  canonicalTrainingRole,
  TRAINING_ROLES,
  DISPLAY_NAME_ALIASES,
  professionalDisplayName,
  isProfessionalDisplayName,
  canonicalDifficulty,
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
};
