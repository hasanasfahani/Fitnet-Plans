const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const python = process.env.FITNET_PYTHON || "/Users/hasanasfahani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const generated = spawnSync(process.execPath, [path.join(root, "scripts", "generate-pdf-demo.js")], {
  cwd: root,
  encoding: "utf8"
});
assert(generated.status === 0, generated.stderr || generated.stdout || "PDF generation failed");

const pdfPath = path.join(root, "output", "pdf", "fitnet-nutrition-plan-demo.pdf");
const inspect = spawnSync(python, ["-c", [
  "import json, sys",
  "from pypdf import PdfReader",
  "reader = PdfReader(sys.argv[1])",
  "page_texts = [(p.extract_text() or '') for p in reader.pages]",
  "links = [[a.get_object().get('/A', {}).get('/URI') for a in (p.get('/Annots') or []) if a.get_object().get('/A', {}).get('/URI')] for p in reader.pages]",
  "print(json.dumps({'pages': len(reader.pages), 'text': '\\n'.join(page_texts), 'page_texts': page_texts, 'links': links}))"
].join("; "), pdfPath], { encoding: "utf8" });
assert(inspect.status === 0, inspect.stderr || "PDF inspection failed");

const result = JSON.parse(inspect.stdout);
const text = result.text;
assert(result.pages >= 12 && result.pages <= 20, `Nutrition PDF must be 12-20 template pages, received ${result.pages}`);
for (const phrase of ["Available equipment", "Injuries or pain limitations", "Workout place", "Disliked exercises", "Stop any exercise"]) {
  assert(!text.includes(phrase), `Nutrition-only PDF contains workout wording: ${phrase}`);
}
for (const phrase of ["7-day nutrition plan", "Day 1", "Day 7", "Ingredients", "Preparation", "Weekly Grocery List", "Repeat Instruction", "Safety Notes"]) {
  assert(text.toLowerCase().includes(phrase.toLowerCase()), `Nutrition PDF is missing ${phrase}`);
}
assert(!/Prepare the listed ingredients|Cook or warm the main ingredients|slice or portion|combine .*finish with|prepare the cooked/i.test(text), "Nutrition PDF contains generic recipe instructions");
assert(text.toLowerCase().includes("approximate daily calories"), "Nutrition PDF does not describe its calorie target as approximate");
assert(!/\bhalal\b/i.test(text), "Nutrition PDF exposes redundant halal wording");
const googlePlayUrl = "https://play.google.com/store/apps/details?id=com.fitnet.app.gym.fitnet_application&hl=en";
const appStoreUrl = "https://apps.apple.com/ae/app/fitnet-your-gym-partner/id6444032576";
const pageTexts = result.page_texts || [];
for (let pageIndex = 1; pageIndex < result.links.length - 1; pageIndex += 1) {
  const isGroceryPage = /weekly grocery list/i.test(pageTexts[pageIndex] || "");
  if (isGroceryPage) {
    assert(!result.links[pageIndex].includes(googlePlayUrl), `Grocery page ${pageIndex + 1} must not show Google Play badges`);
    assert(!result.links[pageIndex].includes(appStoreUrl), `Grocery page ${pageIndex + 1} must not show App Store badges`);
    continue;
  }
  assert(result.links[pageIndex].includes(googlePlayUrl), `Interior page ${pageIndex + 1} is missing Google Play link`);
  assert(result.links[pageIndex].includes(appStoreUrl), `Interior page ${pageIndex + 1} is missing App Store link`);
}
assert(result.links[2].includes("https://fitnetinfluencers.onelink.me/sLYI/hasanasfahani"), "Nutrition app-promo page is missing the requested community CTA link");
assert(/join the movement/i.test(pageTexts[2] || ""), "Nutrition app-promo page is missing the community CTA");
assert(/\+1,500[\s\S]*users/i.test(pageTexts[2] || ""), "Nutrition app-promo page is missing user social proof");
assert(/\+50[\s\S]*coaches/i.test(pageTexts[2] || ""), "Nutrition app-promo page is missing coach social proof");
assert(/\+10[\s\S]*nutritionists/i.test(pageTexts[2] || ""), "Nutrition app-promo page is missing nutritionist social proof");

console.log(JSON.stringify({
  status: "passed",
  policy_version: "fitnet.nutrition.pdf_visual_template.v2",
  pages: result.pages,
  target_pages: "12-20",
  workout_only_wording_removed: true,
  all_seven_days_present: true,
  compact_recipe_details_present: true,
  compact_grocery_list_present: true,
  clickable_store_footers: result.links.filter((links, index) => index > 0 && index < result.links.length - 1 && links.includes(googlePlayUrl)).length,
  redundant_halal_wording_removed: true
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
