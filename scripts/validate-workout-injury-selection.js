const fs = require("fs");
const path = require("path");
const { generateWorkoutPlanV3 } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
let scenariosChecked = 0;

for (const days of [2, 3, 4, 5, 6]) {
  for (const place of ["Home", "Building Gym", "Full Equipment Gym"]) {
    for (const goal of ["Lose Weight", "Build Muscle"]) {
      for (const duration of [45, 60]) validateNeckScenario({ days, place, goal, duration });
    }
  }
}

console.log(JSON.stringify({
  status: "passed",
  injury_policy_version: "workout_injury_selection_policy_v1",
  scenarios_checked: scenariosChecked,
  checks: ["hard_neck_conflicts_excluded", "supported_rows_preferred", "stable_cardio_preferred", "neutral_neck_guidance", "stop_guidance", "no_medical_claims"]
}, null, 2));

function validateNeckScenario({ days, place, goal, duration }) {
  const generated = generateWorkoutPlanV3({
    goal,
    profile: { experience: "Intermediate" },
    workout: { days: String(days), duration: `${duration} minutes`, place, split: "Auto", focusAreas: ["Full Body"], equipment: [], injuries: ["Neck"] }
  }, exercises);
  const relevantErrors = generated.validation.errors.filter((error) => /neck_|unsafe_coaching|restricted_exercise/.test(error));
  assert(relevantErrors.length === 0, `${days}/${place}/${goal}/${duration} neck policy failed: ${relevantErrors.join(", ")}`);
  assert(generated.coaching_strategy.injury_selection_policy.neck, "Neck policy is missing from coaching strategy");

  const candidates = Object.values(generated.candidate_map).flat();
  assert(!candidates.some((exercise) => Number(exercise.exercise_id) === 244), "Behind-neck pulldown remained eligible");

  for (const day of generated.plan.plan_days) {
    for (const exercise of day.exercises) {
      const name = exercise.exercise_name.toLowerCase();
      if (exercise.exercise_category === "cardio") {
        assert(/recumbent|stationary|bike|bicycle|elliptical|cross trainer|cross-trainer/.test(name), `Unstable neck-cardio selection: ${exercise.exercise_name}`);
        assert(!/assault|air bike/.test(name), `Air-bike selection used for neck limitation: ${exercise.exercise_name}`);
      }
      if (exercise.movement_pattern === "horizontal_pull" && /bent over/.test(name)) {
        const slotCandidates = generated.candidate_map[exercise.slot_id] || [];
        const stable = slotCandidates.filter((candidate) => /chest supported|seated|lever|machine|cable/i.test(candidate.name) && !/bent over/i.test(candidate.name));
        assert(stable.length < 2, `Bent-over row selected despite stable alternatives: ${exercise.exercise_name}`);
      }
    }
  }

  const guidance = [generated.plan.program_summary.coaching_rationale, ...generated.plan.pain_safety_guidance].join(" ");
  assert(/\bneck\b/i.test(guidance) && /\b(neutral|relaxed|stable)\b/i.test(guidance), "Neutral-neck guidance is missing");
  assert(/\b(stop|worsen|spread|numbness|tingling|dizziness)\b/i.test(guidance), "Neck stop guidance is missing");
  scenariosChecked += 1;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
