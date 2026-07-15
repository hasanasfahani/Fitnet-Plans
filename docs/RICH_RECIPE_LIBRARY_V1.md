# Fitnet Rich Recipe Library v1

Fitnet uses 100 locally stored recipes: 25 breakfasts, 25 lunches, 25 dinners, and 25 snacks. Forty recipes are Middle Eastern and sixty use other international cuisines.

Runtime generation never calls USDA FoodData Central or Open Food Facts. Their data may only enter the repository through manual import candidates under `tmp/ingredient-import-candidates`, and imported records are never approved automatically.

The model returns `fitnet.nutrition.selection.v1`, containing only day indexes, meal slots, and approved meal IDs. The backend then materializes `fitnet.nutrition.output.v2` from the local recipe and ingredient libraries. Ingredient grams are the source of truth for meal nutrition, daily totals, household portions, and grocery quantities.

All ingredients are Fitnet reviewed and carry a halal status. Pork, pork derivatives, lard, bacon, ham, alcohol, unverified ingredients, unknown IDs, allergen conflicts, and food-avoid conflicts are rejected before a final plan is accepted. Meat recipe labels explicitly require halal ingredients.

Users selecting two main meals receive one or two calorie-aware snacks when needed to avoid unrealistic portions. The requested main-meal preference remains recorded separately from the delivered meal count.

Run `npm run validate:recipe-library` for the complete 1,800-scenario diet and allergy matrix.
