const fs = require("fs");
const path = require("path");

require("dotenv").config();

const query = process.argv.slice(2).join(" ").trim();
if (!query) throw new Error("Usage: node scripts/import-usda-foods.js <food search query>");
if (!process.env.USDA_FDC_API_KEY) throw new Error("USDA_FDC_API_KEY is required for this offline import command.");

const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
url.searchParams.set("api_key", process.env.USDA_FDC_API_KEY);

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"], pageSize: 15 })
  });
  if (!response.ok) throw new Error(`USDA request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const candidates = (payload.foods || []).map((food) => ({
    import_status: "unapproved_candidate",
    source: { type: "usda", external_id: String(food.fdcId), source_name: "USDA FoodData Central" },
    description: food.description,
    data_type: food.dataType,
    nutrients: food.foodNutrients || []
  }));
  writeCandidates("usda", query, candidates);
}

function writeCandidates(source, label, candidates) {
  const directory = path.join(__dirname, "..", "tmp", "ingredient-import-candidates");
  fs.mkdirSync(directory, { recursive: true });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const output = path.join(directory, `${source}-${slug}.json`);
  fs.writeFileSync(output, `${JSON.stringify({ generated_at: new Date().toISOString(), candidates }, null, 2)}\n`);
  console.log(`Saved ${candidates.length} unapproved candidates to ${output}`);
}
