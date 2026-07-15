const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3, validateWorkoutCoachingStrategy } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const scenarios = [];

for (const days of [4, 5, 6]) {
  for (const place of ["Home", "Building Gym", "Full Equipment Gym"]) {
    for (const duration of [30, 45, 60, 75]) validateScenario({ days, place, duration, injuries: ["None"] });
  }
}
for (const days of [3, 4, 5, 6]) {
  for (const place of ["Building Gym", "Full Equipment Gym"]) {
    for (const duration of [45, 60]) validateScenario({ days, place, duration, injuries: ["Knee"] });
  }
}

const rejectionBaseline = generate({ days: 4, place: "Full Equipment Gym", duration: 45, injuries: ["None"] });
const missingHingeSkeleton = clone(rejectionBaseline.skeleton);
const missingHingeDay = missingHingeSkeleton.find((day) => day.day_name === "Lower B");
const hingeSlot = missingHingeDay.slots.find((slot) => slot.movement_pattern === "hinge");
hingeSlot.movement_pattern = "hip_extension";
hingeSlot.exercise_type = "isolation";
const missingHingeValidation = validateWorkoutCoachingStrategy(rejectionBaseline.coaching_strategy, missingHingeSkeleton);
assert(missingHingeValidation.errors.some((error) => error.startsWith("strategy:lower_b_missing_true_hinge")), "Lower B without a true hinge was not rejected");

const excessKneeSkeleton = clone(rejectionBaseline.skeleton);
const excessKneeDay = excessKneeSkeleton.find((day) => day.day_name === "Lower B");
const hipExtensionSlot = excessKneeDay.slots.find((slot) => slot.movement_pattern === "hip_extension");
hipExtensionSlot.training_role = "unilateral_lower_body";
hipExtensionSlot.movement_pattern = "lunge";
hipExtensionSlot.exercise_type = "compound";
const excessKneeValidation = validateWorkoutCoachingStrategy(rejectionBaseline.coaching_strategy, excessKneeSkeleton);
assert(excessKneeValidation.errors.some((error) => error.startsWith("strategy:lower_b_knee_role_count")), "Lower B with multiple knee roles was not rejected");

console.log(JSON.stringify({
  status: "passed",
  lower_body_policy_version: "workout_lower_body_structure_v2",
  scenarios_checked: scenarios.length,
  variants_checked: ["Lower A", "Lower B", "Legs A", "Legs B", "five-day Legs/Lower"],
  roles_checked: ["knee_dominant", "unilateral_lower_body", "hip_dominant", "quadriceps_isolation", "hamstring_isolation", "calves", "core"],
  lower_b_true_hinge_required: true,
  lower_b_maximum_knee_roles: { supported_gyms: 1, home_equipment_fallback: 3 },
  rejection_cases: ["missing_true_hinge", "multiple_knee_roles"],
  home_posterior_chain_fallback_checked: true,
  knee_adaptation_checked: true
}, null, 2));

function validateScenario({ days, place, duration, injuries }) {
  const generated = generate({ days, place, duration, injuries });
  const lowerDays = generated.skeleton.filter((day) => /Lower|Legs/.test(day.day_name));
  const lowerSlotIds = new Set(lowerDays.flatMap((day) => day.slots.map((slot) => slot.slot_id)));
  const lowerErrors = generated.validation.errors.filter((error) =>
    /training_role_mismatch|lower_posterior_redundancy|lower_missing_|major_muscle_volume_imbalance|strategy:lower_/.test(error) ||
    [...lowerSlotIds].some((slotId) => error.includes(slotId))
  );
  assert(lowerErrors.length === 0, `${days}/${place}/${duration}/${injuries.join("+")} lower-body failure: ${lowerErrors.join(", ")}`);
  assert([...lowerSlotIds].every((slotId) => (generated.candidate_map[slotId] || []).length > 0), `${days}/${place}/${duration} has an empty lower-body candidate slot`);
  for (const day of lowerDays) {
    const resistanceSlots = day.slots.filter((slot) => slot.exercise_type !== "cardio");
    const roles = new Set(resistanceSlots.map((slot) => slot.training_role).filter(Boolean));
    const variant = resistanceSlots.find((slot) => slot.lower_body_variant)?.lower_body_variant;
    assert(["A", "B"].includes(variant), `${day.day_name} is missing a lower-body variant`);
    const requirement = generated.coaching_strategy.day_requirements.find((item) => item.day_index === day.day_index);
    if (requirement.training_role_template.includes("core")) assert(roles.has("core"), `${day.day_name} is missing optional core work`);
    if (!injuries.includes("Knee")) {
      if (variant === "A") {
        assert(roles.has("knee_dominant") && roles.has("unilateral_lower_body"), `${day.day_name} does not satisfy Lower A structure`);
        assert(roles.has("hip_dominant"), `${day.day_name} is missing posterior-chain work`);
        if (place !== "Home" && resistanceSlots.length >= 7) assert(roles.has("quadriceps_isolation"), `${day.day_name} is missing quadriceps isolation in the extended template`);
        if (place !== "Home" && resistanceSlots.length >= 5) assert(roles.has("hamstring_isolation"), `${day.day_name} is missing hamstring work`);
      } else {
        const kneeRoleCount = resistanceSlots.filter((slot) => ["knee_dominant", "unilateral_lower_body"].includes(slot.training_role)).length;
        assert(resistanceSlots.some((slot) => slot.movement_pattern === "hinge"), `${day.day_name} is missing a true hinge`);
        assert(resistanceSlots.some((slot) => slot.movement_pattern === "hip_extension"), `${day.day_name} is missing separate hip-extension work`);
        if (place === "Home") assert(kneeRoleCount >= 1 && kneeRoleCount <= 3, `${day.day_name} exceeds the Home knee/lunge allowance`);
        else assert(kneeRoleCount === 1, `${day.day_name} must contain exactly one squat/lunge role`);
        if (place !== "Home" && resistanceSlots.length >= 4) assert(roles.has("hamstring_isolation"), `${day.day_name} is missing knee-flexion work`);
      }
    } else {
      assert(roles.has("hip_dominant"), `${day.day_name} did not adapt knee-dominant work`);
    }

    if (!injuries.includes("Knee")) {
      const planDay = generated.plan.plan_days.find((item) => item.day_index === day.day_index);
      const names = planDay.exercises.filter((exercise) => exercise.muscle_group === "Legs").map((exercise) => exercise.exercise_name.toLowerCase());
      const posteriorCount = names.filter((name) => /deadlift|pull through|bridge|hip thrust/.test(name)).length;
      const posteriorLimit = place === "Home" && duration >= 60 ? 3 : 2;
      assert(posteriorCount <= posteriorLimit, `${day.day_name} has excessive posterior-chain redundancy`);
    }
  }

  if (place !== "Home" && lowerDays.length >= 2 && !injuries.includes("Knee")) {
    const weeklyNames = generated.plan.plan_days.flatMap((day) => day.exercises.filter((exercise) => exercise.muscle_group === "Legs").map((exercise) => exercise.exercise_name.toLowerCase()));
    assert(weeklyNames.filter((name) => /deadlift/.test(name)).length <= 1, `${days}/${place} unnecessarily repeats deadlift variations`);
    assert(weeklyNames.filter((name) => /pull through|bridge|hip thrust|hip extension/.test(name)).length <= 2, `${days}/${place} exceeds the two-exercise hip-extension emphasis`);
  }

  scenarios.push({ days, place, duration, injuries });
}

function generate({ days, place, duration, injuries }) {
  return generateWorkoutPlanV3({
    goal: "Build Muscle",
    profile: { experience: "Intermediate" },
    workout: { days: String(days), duration: `${duration} minutes`, place, split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries }
  }, exercises);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
