const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

const steps = [
  {
    phase: "Nutrition recipe library",
    label: "100 reviewed halal recipes and selection-only materialization",
    command: ["npm", "run", "validate:recipe-library"]
  },
  {
    phase: "Nutrition quality Phase 2",
    label: "Practical role-aware portion limits",
    command: ["npm", "run", "validate:nutrition-portions"]
  },
  {
    phase: "Nutrition quality Phase 3",
    label: "Deterministic daily macro balancing",
    command: ["npm", "run", "validate:nutrition-macros"]
  },
  {
    phase: "Nutrition quality Phase 4",
    label: "Practical household measurements",
    command: ["npm", "run", "validate:nutrition-household"]
  },
  {
    phase: "Nutrition quality Phase 5",
    label: "Weekly recipe and protein variety",
    command: ["npm", "run", "validate:nutrition-variety"]
  },
  {
    phase: "Nutrition quality Phase 6",
    label: "Sodium-risk stacking and frequency safeguards",
    command: ["npm", "run", "validate:nutrition-sodium"]
  },
  {
    phase: "Nutrition quality Phase 7",
    label: "Canonical purchasing-friendly grocery list",
    command: ["npm", "run", "validate:nutrition-grocery"]
  },
  {
    phase: "Nutrition quality Phase 8",
    label: "Weighted pre-PDF nutrition quality gate",
    command: ["npm", "run", "validate:nutrition-quality"]
  },
  {
    phase: "Nutrition quality Phase 9",
    label: "Compact nutrition-only PDF content and pagination",
    command: ["npm", "run", "validate:nutrition-pdf"]
  },
  {
    phase: "Nutrition quality Phase 10",
    label: "Representative nutrition scenario matrix",
    command: ["npm", "run", "validate:nutrition-scenarios"]
  },
  {
    phase: "Nutrition recipe refinement",
    label: "Savory low-carbohydrate breakfasts and culinary instructions",
    command: ["npm", "run", "validate:nutrition-breakfast-quality"]
  },
  {
    phase: "Workout quality Phase 2",
    label: "Backend coaching strategy",
    command: ["npm", "run", "validate:workout-strategy"]
  },
  {
    phase: "Workout cardio policy",
    label: "Weekly cardio limits and placement",
    command: ["npm", "run", "validate:workout-cardio"]
  },
  {
    phase: "Workout refinement Step 1",
    label: "Distinct Lower A and Lower B programming",
    command: ["npm", "run", "validate:workout-lower-body"]
  },
  {
    phase: "Workout refinement Step 2",
    label: "Same-function redundancy control",
    command: ["npm", "run", "validate:workout-function-variety"]
  },
  {
    phase: "Workout refinement Step 3",
    label: "Direct biceps and triceps balance",
    command: ["npm", "run", "validate:workout-arm-balance"]
  },
  {
    phase: "Workout refinement Step 4",
    label: "Quality-aware candidate ranking",
    command: ["npm", "run", "validate:workout-candidate-quality"]
  },
  {
    phase: "Workout refinement Step 5",
    label: "Deterministic cardio duration",
    command: ["npm", "run", "validate:workout-cardio-duration"]
  },
  {
    phase: "Workout refinement Step 6",
    label: "Natural user-facing coaching language",
    command: ["npm", "run", "validate:workout-user-language"]
  },
  {
    phase: "Workout generation reliability",
    label: "Deterministic duplicate normalization",
    command: ["npm", "run", "validate:workout-duplicate-normalization"]
  },
  {
    phase: "Workout refinement Step 1",
    label: "Lower-day slot integrity",
    command: ["npm", "run", "validate:workout-lower-slot-integrity"]
  },
  {
    phase: "Workout refinement Step 2",
    label: "Canonical weekly push and pull balance",
    command: ["npm", "run", "validate:workout-push-pull-balance"]
  },
  {
    phase: "Workout refinement Step 3",
    label: "Canonical quadriceps and posterior-chain balance",
    command: ["npm", "run", "validate:workout-lower-body-balance"]
  },
  {
    phase: "Workout refinement Step 4",
    label: "Concise and varied coaching guidance",
    command: ["npm", "run", "validate:workout-coaching-variety"]
  },
  {
    phase: "Workout injury-aware selection",
    label: "Conservative neck selection and guidance",
    command: ["npm", "run", "validate:workout-injury-selection"]
  },
  {
    phase: "Workout exercise variety",
    label: "Weekly repetition and justification policy",
    command: ["npm", "run", "validate:workout-variety"]
  },
  {
    phase: "Workout quality Phase 3",
    label: "Session duration feasibility",
    command: ["npm", "run", "validate:workout-duration"]
  },
  {
    phase: "Workout quality Phase 4",
    label: "Canonical exercise metadata",
    command: ["npm", "run", "validate:exercise-metadata"]
  },
  {
    phase: "Programming balance Step 2",
    label: "Canonical exercise training roles",
    command: ["npm", "run", "validate:exercise-training-roles"]
  },
  {
    phase: "Programming balance Step 3",
    label: "Backend role templates for every split",
    command: ["npm", "run", "validate:workout-role-templates"]
  },
  {
    phase: "Programming balance Step 4",
    label: "Complementary A/B day variation",
    command: ["npm", "run", "validate:workout-day-variation"]
  },
  {
    phase: "Programming balance Step 5",
    label: "Canonical weekly volume balance",
    command: ["npm", "run", "validate:workout-volume-policy"]
  },
  {
    phase: "Workout quality Phase 7",
    label: "Curated user-facing exercise names",
    command: ["npm", "run", "validate:exercise-display-names"]
  },
  {
    phase: "Workout quality Phase 10",
    label: "Representative 2-6 day scenario matrix",
    command: ["npm", "run", "validate:workout-scenarios"]
  },
  {
    phase: "Programming balance Step 6",
    label: "Role-preserving workout candidate filtering",
    command: ["npm", "run", "validate:workout-candidates"]
  },
  {
    phase: "Workout equipment reliability",
    label: "Location and equipment generation paths",
    command: ["npm", "run", "validate:workout-equipment-paths"]
  },
  {
    phase: "Programming balance Step 7",
    label: "Role-aware structured AI coaching prompt",
    command: ["npm", "run", "validate:workout-prompt"]
  },
  {
    phase: "Workout quality Phase 7",
    label: "Coach-quality workout output contract",
    command: ["npm", "run", "validate:workout-output-v3"]
  },
  {
    phase: "Programming balance Step 8",
    label: "AI-controlled workout quality gate",
    command: ["npm", "run", "validate:workout-quality"]
  },
  {
    phase: "Programming balance Step 9",
    label: "Complete injury-neutral programming scenario matrix",
    command: ["npm", "run", "validate:workout-programming-matrix"]
  },
  {
    phase: "Workout quality Phase 9",
    label: "Internal workout quality score",
    command: ["npm", "run", "validate:workout-score"]
  },
  {
    phase: "Workout quality Phase 10",
    label: "Single targeted workout repair",
    command: ["npm", "run", "validate:workout-repair"]
  },
  {
    phase: "Workout quality Phase 11",
    label: "Workout generation observability",
    command: ["npm", "run", "validate:workout-observability"]
  },
  {
    phase: "Generation reliability",
    label: "Provider and nutrition boundary handling",
    command: ["npm", "run", "validate:generation-boundaries"]
  },
  {
    phase: "Phase 2",
    label: "Data model and source libraries",
    command: ["npm", "run", "validate:data"]
  },
  {
    phase: "Phase 3",
    label: "Workout generation engine",
    command: ["npm", "run", "generate:workout-demo"]
  },
  {
    phase: "Phase 4",
    label: "Nutrition generation engine",
    command: ["npm", "run", "generate:nutrition-demo"]
  },
  {
    phase: "Phase 5",
    label: "Prompt and JSON contracts",
    command: ["npm", "run", "validate:contracts"]
  },
  {
    phase: "Phase 6",
    label: "PDF generation",
    command: ["npm", "run", "generate:pdf-demo"]
  },
  {
    phase: "Workout coaching PDF",
    label: "Coaching, progression, recovery, and safety content",
    command: ["npm", "run", "validate:workout-pdf-content"]
  },
  {
    phase: "Phase 7",
    label: "Security and anti-spam",
    command: ["npm", "run", "validate:security"]
  },
  {
    phase: "Phase 8",
    label: "APIs",
    command: ["npm", "run", "validate:api"]
  },
  {
    phase: "Phase 9",
    label: "QA and acceptance criteria",
    command: ["npm", "run", "validate:acceptance"]
  },
  {
    phase: "Generation quality release gate",
    label: "Versioned API-to-PDF golden scenarios and stale artifact rejection",
    command: ["npm", "run", "validate:generation-quality-harness"]
  }
];

const results = [];

try {
  for (const step of steps) {
    const startedAt = Date.now();
    const result = spawnSync(step.command[0], step.command.slice(1), {
      cwd: root,
      encoding: "utf8"
    });

    results.push({
      phase: step.phase,
      label: step.label,
      command: step.command.join(" "),
      status: result.status === 0 ? "passed" : "failed",
      duration_ms: Date.now() - startedAt
    });

    if (result.status !== 0) {
      process.stderr.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
      throw new Error(`${step.phase} failed while running ${step.command.join(" ")}`);
    }
  }
} finally {
  cleanupRuntimeArtifacts();
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      build_order: "verified",
      steps: results,
      notes: [
        "Phase 1 is covered by the static app files and manual browser flow.",
        "Email delivery and persistence remain local/simulated until production providers are connected."
      ]
    },
    null,
    2
  )
);

function cleanupRuntimeArtifacts() {
  fs.rmSync(path.join(root, "tmp"), { recursive: true, force: true });
  fs.rmSync(path.join(root, "output", "api"), { recursive: true, force: true });

  const pdfDir = path.join(root, "output", "pdf");
  if (!fs.existsSync(pdfDir)) {
    return;
  }

  for (const file of fs.readdirSync(pdfDir)) {
    if (/^fitnet-sess_.*\.pdf$/.test(file)) {
      fs.rmSync(path.join(pdfDir, file), { force: true });
    }
  }
}
