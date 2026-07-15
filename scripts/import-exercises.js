const fs = require("fs");
const path = require("path");
const { enrichExerciseMetadata } = require("../lib/exercise-metadata");

const root = path.join(__dirname, "..");
const inputPath = path.join(root, "exercises_library_structure.csv");
const outputPath = path.join(root, "data", "exercise_library.json");

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}

function splitList(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferDifficulty(name, equipment) {
  const haystack = `${name} ${equipment.join(" ")}`.toLowerCase();

  if (haystack.includes("assisted") || haystack.includes("bodyweight") || haystack.includes("machine")) {
    return "Beginner";
  }

  if (haystack.includes("deadlift") && (haystack.includes("dumbbell") || haystack.includes("kettlebell"))) {
    return "Intermediate";
  }

  if (
    haystack.includes("barbell") ||
    haystack.includes("deadlift") ||
    haystack.includes("snatch") ||
    haystack.includes("clean") ||
    haystack.includes("pistol")
  ) {
    return "Advanced";
  }

  return "Intermediate";
}

function inferMovementPattern(name, category) {
  const text = name.toLowerCase();

  if (category === "Cardio") return "cardio";
  if (text.includes("squat") || text.includes("leg press")) return "squat";
  if (text.includes("deadlift") || text.includes("rdl") || text.includes("good morning")) return "hinge";
  if (text.includes("lunge") || text.includes("split squat") || text.includes("step up")) return "lunge";
  if (text.includes("row")) return "horizontal_pull";
  if (text.includes("pulldown") || text.includes("pull up") || text.includes("chin up")) return "vertical_pull";
  if (text.includes("press") || text.includes("push up") || text.includes("dip")) return "push";
  if (text.includes("curl")) return "elbow_flexion";
  if (text.includes("extension") || text.includes("pushdown")) return "elbow_extension";
  if (text.includes("raise")) return "raise";
  if (text.includes("fly") || text.includes("flye")) return "fly";
  if (text.includes("crunch") || text.includes("plank") || text.includes("twist") || text.includes("sit up")) return "core";
  if (text.includes("calf")) return "calf_raise";
  return category.toLowerCase().replaceAll(" ", "_");
}

function inferExerciseType(name, category, movementPattern) {
  const text = name.toLowerCase();

  if (category === "Cardio") return "cardio";
  if (category === "Core" || movementPattern === "core") return "core";

  if (
    text.includes("squat") ||
    text.includes("deadlift") ||
    text.includes("press") ||
    text.includes("row") ||
    text.includes("pull up") ||
    text.includes("chin up") ||
    text.includes("lunge") ||
    text.includes("dip")
  ) {
    return "compound";
  }

  return "isolation";
}

function inferAllowedPlaces(equipment) {
  const joined = equipment.join(" ").toLowerCase();
  const places = new Set(["Full Equipment Gym"]);

  if (
    !joined ||
    joined.includes("bodyweight") ||
    joined.includes("dumbbell") ||
    joined.includes("kettlebell") ||
    joined.includes("band") ||
    joined.includes("mat")
  ) {
    places.add("Home");
    places.add("Gym");
  }

  if (
    joined.includes("barbell") ||
    joined.includes("cable") ||
    joined.includes("machine") ||
    joined.includes("bench") ||
    joined.includes("station") ||
    joined.includes("rack")
  ) {
    places.add("Gym");
  }

  return Array.from(places);
}

function inferContraindications(name) {
  const text = name.toLowerCase();
  const tags = new Set();

  if (text.includes("deadlift") || text.includes("good morning") || text.includes("back extension")) {
    tags.add("Lower back");
  }

  if (text.includes("squat") || text.includes("lunge") || text.includes("leg press") || text.includes("leg extension")) {
    tags.add("Knee");
  }

  if (
    text.includes("overhead") ||
    text.includes("shoulder press") ||
    text.includes("dip") ||
    text.includes("upright row") ||
    text.includes("pullover")
  ) {
    tags.add("Shoulder");
  }

  if (text.includes("push up") || text.includes("plank") || text.includes("wrist")) {
    tags.add("Wrist");
  }

  if (text.includes("neck")) {
    tags.add("Neck");
  }

  return Array.from(tags);
}

function normalize() {
  const csv = fs.readFileSync(inputPath, "utf8");
  const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  const indexOf = (name) => headers.indexOf(name);

  const records = rows.map((row) => {
    const columns = parseCsvLine(row);
    const exerciseId = Number(columns[indexOf("exercise_id")]);
    const name = columns[indexOf("full_name")].trim();
    const category = columns[indexOf("category")].trim();
    const subMuscles = splitList(columns[indexOf("sub_muscles")]).flatMap((item) =>
      item.split("/").map((part) => part.trim()).filter(Boolean)
    );
    const equipment = splitList(columns[indexOf("equipment")]);
    const movementPattern = inferMovementPattern(name, category);

    return enrichExerciseMetadata({
      exercise_id: exerciseId,
      name,
      category,
      sub_muscles: subMuscles,
      equipment,
      difficulty: inferDifficulty(name, equipment),
      movement_pattern: movementPattern,
      exercise_type: inferExerciseType(name, category, movementPattern),
      allowed_places: inferAllowedPlaces(equipment),
      contraindications: inferContraindications(name),
      source_payload: {
        muscle_ids: splitList(columns[indexOf("muscle_ids")]).join("|"),
        source_file: "exercises_library_structure.csv"
      },
      review_status: "auto_enriched_needs_review"
    });
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(records, null, 2)}\n`);
  console.log(`Wrote ${records.length} exercises to ${path.relative(root, outputPath)}`);
}

normalize();
