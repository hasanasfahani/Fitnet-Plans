const fs = require("fs");
const path = require("path");
const { generateWorkoutPlan } = require("../lib/workout-engine");

const root = path.join(__dirname, "..");
const exerciseLibrary = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));

const demoInput = {
  goal: "Build Muscle",
  profile: {
    experience: "Intermediate"
  },
  workout: {
    days: "4",
    duration: "60 minutes",
    place: "Gym",
    split: "Upper/Lower",
    focusAreas: ["Back", "Chest"],
    equipment: ["Dumbbells", "Barbell", "Cable machine", "Machines", "Bench"],
    injuries: ["None"],
    dislikedExercises: []
  }
};

const result = generateWorkoutPlan(demoInput, exerciseLibrary, { includeNames: true });

if (!result.validation.valid) {
  console.error(JSON.stringify(result.validation, null, 2));
  process.exit(1);
}

const summary = {
  status: result.status,
  days: result.plan.plan_days.length,
  slots: result.skeleton.reduce((total, day) => total + day.slots.length, 0),
  first_day: result.plan.plan_days[0]
};

console.log(JSON.stringify(summary, null, 2));
