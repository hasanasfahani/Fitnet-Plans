const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const python = process.env.FITNET_PYTHON || "/Users/hasanasfahani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const generation = spawnSync("npm", ["run", "generate:pdf-demo"], { cwd: root, encoding: "utf8" });
if (generation.status !== 0) throw new Error(generation.stderr || generation.stdout || "PDF demo generation failed");

const pdfPath = path.join(root, "output", "pdf", "fitnet-workout-plan-demo.pdf");
const payloadPath = path.join(root, "tmp", "pdfs", "fitnet-workout-plan-demo.json");
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
const plan = payload.workout_plan;
const library = JSON.parse(fs.readFileSync(path.join(root, "data", "exercise_library.json"), "utf8"));
const libraryById = new Map(library.map((exercise) => [Number(exercise.exercise_id), exercise]));
const extraction = spawnSync(python, [
  "-c",
  "from pypdf import PdfReader; import sys; print('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))",
  pdfPath
], { cwd: root, encoding: "utf8" });
if (extraction.status !== 0) throw new Error(extraction.stderr || "PDF extraction failed");

const pageCountExtraction = spawnSync(python, [
  "-c",
  "from pypdf import PdfReader; import sys; print(len(PdfReader(sys.argv[1]).pages))",
  pdfPath
], { cwd: root, encoding: "utf8" });
if (pageCountExtraction.status !== 0) throw new Error(pageCountExtraction.stderr || "PDF page-count extraction failed");
const pageCount = Number(pageCountExtraction.stdout.trim());
const expectedPageCount = plan.plan_days.length + 6;
assert(pageCount === expectedPageCount, `Workout PDF should contain ${expectedPageCount} template pages, received ${pageCount}`);

const linkExtraction = spawnSync(python, [
  "-c",
  "from pypdf import PdfReader; import json,sys; r=PdfReader(sys.argv[1]); print(json.dumps([[a.get_object().get('/A',{}).get('/URI') for a in (p.get('/Annots') or []) if a.get_object().get('/A',{}).get('/URI')] for p in r.pages]))",
  pdfPath
], { cwd: root, encoding: "utf8" });
if (linkExtraction.status !== 0) throw new Error(linkExtraction.stderr || "PDF link extraction failed");
const linksByPage = JSON.parse(linkExtraction.stdout);
const googlePlayUrl = "https://play.google.com/store/apps/details?id=com.fitnet.app.gym.fitnet_application&hl=en";
const appStoreUrl = "https://apps.apple.com/ae/app/fitnet-your-gym-partner/id6444032576";
const whatsappUrlPrefix = "https://wa.me/9647513855361?text=";
for (const url of [googlePlayUrl, appStoreUrl]) {
  assert(linksByPage[2].includes(url), `Page 3 is missing clickable URL: ${url}`);
}
assert(linksByPage[2].some((url) => url.startsWith(whatsappUrlPrefix) && decodeURIComponent(url).includes("convert my plan into a visual plan in the Fitnet app")), "Page 3 is missing the updated English WhatsApp visual-plan request");
for (let pageIndex = 3; pageIndex < 3 + plan.plan_days.length; pageIndex += 1) {
  assert(linksByPage[pageIndex].some((url) => url.startsWith(whatsappUrlPrefix)), `Workout day page ${pageIndex + 1} is missing the WhatsApp CTA`);
}
for (let pageIndex = 1; pageIndex < linksByPage.length - 1; pageIndex += 1) {
  for (const url of [googlePlayUrl, appStoreUrl]) {
    assert(linksByPage[pageIndex].includes(url), `Interior page ${pageIndex + 1} is missing clickable store URL: ${url}`);
  }
}
for (const url of [googlePlayUrl, appStoreUrl]) {
  assert(linksByPage.at(-1).includes(url), `Final page is missing clickable store URL: ${url}`);
}

const text = normalize(extraction.stdout);
assert(text.includes("Your Fitnet plan is ready."), "PDF is missing the customer-facing cover title");
assert(text.includes("built around your goal, your schedule"), "PDF is missing the customer-facing cover summary");
for (const phrase of ["validated structured plan JSON", "approved Fitnet libraries", "candidate pool", "backend", "schema"]) {
  assert(!text.toLowerCase().includes(phrase.toLowerCase()), `PDF exposed internal wording: ${phrase}`);
}
for (const heading of ["Progression", "Recovery", "Safety Guidance"]) {
  assert(text.toLowerCase().includes(heading.toLowerCase()), `PDF is missing ${heading}`);
}
assert(!text.includes("Coach Notes by Day"), "Removed Coach Notes by Day section returned");
assert(!text.includes("How to Train This Plan"), "Removed How to Train section returned");
assert(!text.includes("Use the prescribed exercise order, rep ranges, and rest periods."), "Removed How to Train introduction returned");

const exercises = plan.plan_days.flatMap((day) => day.exercises);
let curatedNamesChecked = 0;
for (const exercise of exercises) {
  const source = libraryById.get(Number(exercise.exercise_id));
  const renderedName = exercise.exercise_name || source?.display_name || source?.name;
  if (renderedName && source && renderedName !== source.name) {
    assert(text.includes(normalize(renderedName)), `PDF is missing display name for ${exercise.exercise_id}`);
    assert(!text.includes(normalize(source.name)), `PDF exposed source name for ${exercise.exercise_id}`);
    curatedNamesChecked += 1;
  }
  assert(!text.includes(normalize(exercise.slot_id)), `PDF exposed slot ID ${exercise.slot_id}`);
  for (const pattern of [
    `Exercise ID: ${exercise.exercise_id}`,
    `Exercise ID ${exercise.exercise_id}`,
    `ID: ${exercise.exercise_id}`,
    `#${exercise.exercise_id}`
  ]) {
    assert(!text.includes(pattern), `PDF exposed exercise ID ${exercise.exercise_id}`);
  }
}
assert(curatedNamesChecked > 0, "PDF demo did not exercise a curated display name");
assert(!/exercise[_ ]id|slot[_ ]id/i.test(text), "PDF exposed an internal exercise or slot ID label");
for (const value of Object.values(plan.progression_guidance)) assert(text.includes(normalize(value)), "PDF is missing progression guidance");
for (const value of plan.recovery_guidance) assert(text.includes(normalize(value)), "PDF is missing recovery guidance");
for (const value of plan.pain_safety_guidance) assert(text.includes(normalize(value)), "PDF is missing safety guidance");
assert(text.includes(normalize(plan.repeat_instruction)), "PDF is missing the four-week instruction");

assert(!text.includes("Safety Notes Guidance"), "Legacy empty Safety Notes table remains in the PDF");

console.log(JSON.stringify({
  status: "passed",
  pdf_contract_version: "workout_pdf_visual_template_v2",
  headings_checked: 3,
  how_to_train_section_removed: true,
  coach_notes_by_day_removed: true,
  progression_fields_checked: Object.keys(plan.progression_guidance).length,
  recovery_items_checked: plan.recovery_guidance.length,
  safety_items_checked: plan.pain_safety_guidance.length,
  curated_exercise_names_checked: curatedNamesChecked,
  internal_ids_hidden: true,
  progression_recovery_safety_preserved: true,
  customer_facing_cover_language: true,
  clickable_store_footers: pageCount - 2,
  page_count: pageCount,
  template_page_count: expectedPageCount
}, null, 2));

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
