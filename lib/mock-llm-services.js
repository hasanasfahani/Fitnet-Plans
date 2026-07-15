const { buildFallbackWorkoutPlanV2, buildFallbackWorkoutPlanV3 } = require("./workout-engine");
const { buildFallbackNutritionPlanV2 } = require("./nutrition-engine");
const { canonicalizeWorkoutPlanV2, canonicalizeWorkoutPlanV3, canonicalizeNutritionSelectionV1 } = require("./plan-contracts");

function createMockLlmServices({ exercises = [], meals = [], appBaseUrl = "http://localhost:3002" } = {}) {
  return {
    usesAsync: true,
    model: "mock-llm",
    appBaseUrl,
    hasOpenAI: true,
    hasDatabase: false,
    hasEmail: false,
    hasBlob: false,

    async selectWorkoutPlanV2({ normalizedInput, skeleton, candidateMap }) {
      const plan = buildFallbackWorkoutPlanV2(skeleton, candidateMap, normalizedInput);
      return {
        plan: canonicalizeWorkoutPlanV2(plan),
        raw: {
          id: `mock-workout-${Date.now()}`,
          model: "mock-llm",
          output_text: JSON.stringify(plan)
        }
      };
    },

    async selectWorkoutPlanV3({ normalizedInput, skeleton, candidateMap }) {
      const plan = buildFallbackWorkoutPlanV3(skeleton, candidateMap, normalizedInput);
      return {
        plan: canonicalizeWorkoutPlanV3(plan),
        raw: {
          id: `mock-workout-v3-${Date.now()}`,
          model: "mock-llm",
          output_text: JSON.stringify(plan)
        }
      };
    },

    async selectNutritionPlanV2({ normalizedInput, skeleton, candidateMap }) {
      const plan = buildFallbackNutritionPlanV2(skeleton, candidateMap, normalizedInput, meals);
      const selection = canonicalizeNutritionSelectionV1({
        days: plan.days.map((day) => ({
          day_index: day.day_index,
          meals: day.meals.map((meal) => ({ meal_slot: meal.meal_slot, meal_id: meal.meal_id }))
        }))
      });
      return {
        plan: selection,
        raw: {
          id: `mock-nutrition-${Date.now()}`,
          model: "mock-llm",
          output_text: JSON.stringify(selection)
        }
      };
    },

    async sendPlanEmail() {
      return { id: `mock-email-${Date.now()}` };
    },

    async saveSession() {},
    async saveGeneratedPlan() {},
    async saveLead() {
      return null;
    },
    async saveEmailEvent() {}
  };
}

module.exports = { createMockLlmServices };
