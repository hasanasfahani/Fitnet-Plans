const fs = require("fs");
const path = require("path");

require("dotenv").config();

const barcode = String(process.argv[2] || "").trim();
if (!/^\d{8,14}$/.test(barcode)) throw new Error("Usage: node scripts/import-open-food-facts.js <8-14 digit barcode>");
const userAgent = process.env.OPEN_FOOD_FACTS_USER_AGENT || "Fitnet/1.0 (support@fitnetapp.com)";

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const fields = "code,product_name,brands,serving_size,serving_quantity,nutriments,allergens_tags,ingredients_text";
  const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${barcode}?fields=${fields}`, {
    headers: { "user-agent": userAgent }
  });
  if (!response.ok) throw new Error(`Open Food Facts request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  if (!payload.product) throw new Error(`No Open Food Facts product found for ${barcode}`);
  const candidate = {
    import_status: "unapproved_candidate",
    source: { type: "open_food_facts", barcode, source_name: "Open Food Facts" },
    product_name: payload.product.product_name,
    brands: payload.product.brands,
    serving_size: payload.product.serving_size,
    serving_quantity: payload.product.serving_quantity,
    nutriments: payload.product.nutriments,
    allergens: payload.product.allergens_tags || [],
    ingredients_text: payload.product.ingredients_text || ""
  };
  const directory = path.join(__dirname, "..", "tmp", "ingredient-import-candidates");
  fs.mkdirSync(directory, { recursive: true });
  const output = path.join(directory, `open-food-facts-${barcode}.json`);
  fs.writeFileSync(output, `${JSON.stringify({ generated_at: new Date().toISOString(), candidates: [candidate] }, null, 2)}\n`);
  console.log(`Saved one unapproved candidate to ${output}`);
}
