const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { createFitnetApi } = require("../lib/api-core");
const { createMockLlmServices } = require("../lib/mock-llm-services");

const root = path.join(__dirname, "..");
const secret = "fitnet-stateless-validator-secret";
const exercises = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const meals = JSON.parse(fs.readFileSync(path.join(root, "data", "meal_library.json"), "utf8"));
const services = createMockLlmServices({ exercises, meals });
const api = createFitnetApi({ services, persistSessions: false, pdfSigningSecret: secret });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const result = await api.generateStatelessPlan({
    language: "en",
    goal: "Lose Weight",
    profile: {
      gender: "Male",
      age_range: "25-34",
      height_range: "175-184 cm",
      weight_range: "80-94 kg",
      experience: "Intermediate"
    },
    plan_type: "Workout + Nutrition",
    workout: {
      days: "4",
      duration: "60 minutes",
      place: "Gym",
      split: "Upper/Lower",
      focusAreas: ["Back", "Chest"],
      equipment: ["Dumbbells", "Barbell", "Cable machine", "Machines", "Bench"],
      injuries: ["None"],
      dislikedExercises: []
    },
    nutrition: {
      meals: "4",
      activityLevel: "Lightly active",
      safetyFlags: ["None"],
      dietStyle: "High Protein",
      restrictions: ["None"],
      allergies: ["None"],
      cookingTime: "Moderate",
      budget: "Medium",
      preferences: ["Chicken", "Rice"]
    }
  }, { "user-agent": "stateless-validator", "x-forwarded-for": "127.0.0.1" }, { enforceSecurity: false });

  assert(result.status === "ready", "stateless generation should finish ready");
  assert(result.pdf_downloads.length === 2, "combined plan should create two signed PDF payloads");
  assert(!result.debug_log && !result.generated_plan, "response must not expose full plan or debug data");

  for (const download of result.pdf_downloads) {
    const expected = crypto.createHmac("sha256", secret).update(download.payload).digest("hex");
    assert(crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(download.signature)), "PDF signature is invalid");
    const envelope = JSON.parse(Buffer.from(download.payload, "base64url").toString("utf8"));
    assert(envelope.version === "fitnet.stateless-pdf.v1", "PDF payload version is invalid");
    assert(Boolean(envelope.workout_plan) !== Boolean(envelope.nutrition_plan), "each payload must contain exactly one plan");
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "fitnet-stateless-test-"));
  try {
    const workout = result.pdf_downloads.find((item) => item.kind === "workout");
    const input = path.join(temp, "plan.json");
    const output = path.join(temp, "plan.pdf");
    fs.writeFileSync(input, Buffer.from(workout.payload, "base64url"));
    const python = process.env.FITNET_PYTHON || "python3";
    const rendered = spawnSync(python, [
      path.join(root, "scripts", "render_plan_pdf.py"),
      "--payload", input,
      "--output", output,
      "--exercises", path.join(root, "data", "exercise_library.json"),
      "--foods", path.join(root, "data", "food_library.json")
    ], { encoding: "utf8" });
    assert(rendered.status === 0, rendered.stderr || "PDF render failed");
    assert(fs.readFileSync(output).subarray(0, 4).toString("utf8") === "%PDF", "renderer did not produce a PDF");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ status: "valid", signed_downloads: 2, persistent_plans: 0 }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
