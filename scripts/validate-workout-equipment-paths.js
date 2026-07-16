const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3 } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const daysPerWeek = [2, 3, 4, 5, 6];
const durations = [30, 45, 60, 75, 90];
const focusModes = [["Full Body"], ["Chest", "Back"]];
const equipmentPaths = [
  { place: "Home", equipment: [] },
  { place: "Building Gym", equipment: [] },
  { place: "Full Equipment Gym", equipment: [] },
  { place: "Home", equipment: ["Bodyweight"] },
  ...["Dumbbells", "Resistance bands", "Kettlebell", "Bench"].map((item) => ({ place: "Home", equipment: [item] })),
  { place: "Home", equipment: ["Dumbbells", "Bench"] },
  { place: "Home", equipment: ["Resistance bands", "Kettlebell"] },
  ...["Dumbbells", "Barbell", "Cable machine", "Kettlebell", "Machines", "Bench"].map((item) => ({ place: "Building Gym", equipment: [item] })),
  { place: "Building Gym", equipment: ["Dumbbells", "Bench"] },
  { place: "Building Gym", equipment: ["Barbell", "Bench"] },
  { place: "Building Gym", equipment: ["Cable machine", "Machines"] }
];

let scenariosChecked = 0;
let workoutDaysChecked = 0;
let candidatesChecked = 0;

for (const equipmentPath of equipmentPaths) {
  for (const days of daysPerWeek) {
    for (const duration of durations) {
      for (const focusAreas of focusModes) validateScenario({ ...equipmentPath, days, duration, focusAreas });
    }
  }
}

const unsupportedHomeEquipment = generate({
  place: "Home",
  equipment: ["Barbell"],
  days: 3,
  duration: 45,
  focusAreas: ["Full Body"]
});
assert(unsupportedHomeEquipment.status === "valid_v3", "Unsupported Home equipment did not fall back safely");
assert(
  JSON.stringify(unsupportedHomeEquipment.normalized_input.equipment) === JSON.stringify(["Bodyweight"]),
  "Unsupported Home equipment was not removed during normalization"
);

console.log(JSON.stringify({
  status: "passed",
  policy_version: "workout_equipment_path_matrix_v1",
  equipment_paths_checked: equipmentPaths.length,
  scenarios_checked: scenariosChecked,
  workout_days_checked: workoutDaysChecked,
  candidates_checked: candidatesChecked,
  unsupported_location_equipment_fallback: "passed",
  coverage: {
    days_per_week: daysPerWeek,
    durations,
    focus_modes: focusModes,
    locations: ["Home", "Building Gym", "Full Equipment Gym"]
  }
}, null, 2));

function validateScenario({ place, equipment, days, duration, focusAreas }) {
  const label = `${place}|${equipment.join("+") || "default"}|${days}|${duration}|${focusAreas.join("+")}`;
  const result = generate({ place, equipment, days, duration, focusAreas });
  assert(result.strategy_validation.valid, `${label}: strategy: ${result.strategy_validation.errors.join(", ")}`);
  assert(result.candidate_validation.valid, `${label}: candidates: ${result.candidate_validation.errors.join(", ")}`);
  assert(result.validation.valid, `${label}: plan: ${result.validation.errors.join(", ")}`);
  assert(result.status === "valid_v3", `${label}: unexpected status ${result.status}`);
  assert(result.plan.plan_days.length === days, `${label}: wrong day count`);
  assert(result.validation.duration_estimates.every((estimate) => estimate.within_limit), `${label}: session duration exceeded`);

  const selectedCapabilities = new Set(result.normalized_input.equipment.map(normalizeEquipmentName));
  for (const day of result.skeleton) {
    workoutDaysChecked += 1;
    for (const slot of day.slots) {
      const candidates = result.candidate_map[slot.slot_id] || [];
      assert(candidates.length > 0, `${label}: empty slot ${slot.slot_id}`);
      for (const candidate of candidates) {
        const required = [...new Set((candidate.equipment || []).map(normalizeEquipmentName).filter(isSelectableCapability))];
        assert(required.every((item) => selectedCapabilities.has(item)), `${label}: unselected equipment in ${candidate.exercise_id}`);
        candidatesChecked += 1;
      }
    }
  }
  scenariosChecked += 1;
}

function generate({ place, equipment, days, duration, focusAreas }) {
  return generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: {
      days: String(days),
      duration: `${duration} minutes`,
      place,
      split: "Auto",
      focusAreas,
      equipment,
      injuries: ["None"]
    }
  }, exercises);
}

function normalizeEquipmentName(value) {
  const text = String(value).toLowerCase();
  if (text.includes("dumbbell")) return "dumbbell";
  if (text.includes("barbell")) return "barbell";
  if (text.includes("cable") || text.includes("pulley") || text.includes("lat pulldown")) return "cable";
  if (text.includes("machine") || text.includes("station") || text.includes("leg press")) return "machine";
  if (text.includes("treadmill")) return "treadmill";
  if (text.includes("bike") || text.includes("bicycle")) return "bike";
  if (text.includes("elliptical") || text.includes("cross-trainer")) return "elliptical";
  if (text.includes("row")) return "rower";
  if (text.includes("stepmill") || text.includes("stair")) return "stepmill";
  if (text.includes("jump rope")) return "jump rope";
  if (text.includes("band")) return "band";
  if (text.includes("kettlebell")) return "kettlebell";
  if (text.includes("bench")) return "bench";
  if (text.includes("bodyweight") || text.includes("mat")) return "bodyweight";
  return text;
}

function isSelectableCapability(value) {
  return new Set([
    "bodyweight", "dumbbell", "barbell", "cable", "machine", "band", "kettlebell", "bench",
    "treadmill", "bike", "elliptical", "rower", "stepmill", "jump rope"
  ]).has(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
