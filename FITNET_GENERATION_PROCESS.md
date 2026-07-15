# Fitnet AI Plan Generation Process

This document explains the current Fitnet workout and nutrition generation process so it can be reviewed and improved.

## Current Stack

- Frontend: static web app in `app.js`
- Backend API: local Node server in `scripts/dev-api-server.js`
- Core generation: `lib/api-core.js`
- Workout engine: `lib/workout-engine.js`
- Nutrition engine: `lib/nutrition-engine.js`
- Prompt contracts: `lib/plan-contracts.js`
- PDF renderer: `scripts/render_plan_pdf.py`
- Database: Supabase PostgreSQL
- PDF storage: Vercel Blob
- Email sender: Resend
- AI model: configured by `OPENAI_MODEL`, currently `gpt-5.4-mini`

## High-Level User Flow

1. User completes the Fitnet questionnaire.
2. Browser sends answers to backend API at `http://localhost:3002`.
3. Backend creates a generation session.
4. Backend normalizes profile, workout, and nutrition inputs.
5. Backend creates deterministic workout and nutrition skeletons.
6. Backend filters approved exercise and food candidates.
7. OpenAI receives constrained prompts.
8. OpenAI selects/adjusts plan items inside a strict schema.
9. Backend validates OpenAI output.
10. Backend renders the PDF.
11. PDF is uploaded to Vercel Blob.
12. Plan/session metadata is stored in Supabase.
13. Resend emails the private download link to the user.

## Current Design Philosophy

The current system uses a hybrid approach:

- Backend controls safety, structure, approved IDs, and validation.
- AI acts as a professional coach inside those constraints.
- AI cannot invent exercises, foods, IDs, days, or extra fields.
- AI can make contextual choices inside the allowed candidate lists.

The goal is to balance:

- Professional AI coaching quality
- Predictable output
- Safety
- Valid JSON
- Approved exercise/food library usage
- Production reliability

## Workout Generation Process

### Backend-Controlled Workout Split

The workout split is deterministic and based on the number of days selected by the user:

```text
2 days -> Full Body
3 days -> Upper/Lower + Full Body
4 days -> Upper A/Lower A + Upper B/Lower B
5 days -> Push/Pull/Legs + Upper/Lower
6 days -> Push/Pull/Legs x2
```

The AI should not freely choose the split. The backend chooses it to keep the plan consistent and aligned with product expectations.

### Backend Workout Skeleton

After the split is selected, the backend creates fixed training slots.

Example slot:

```json
{
  "slot_id": "day1_slot1",
  "day_index": 1,
  "day_name": "Upper A",
  "muscle_group": "Chest",
  "submuscle": "Chest",
  "movement_pattern": "push",
  "exercise_type": "compound",
  "sets": 3,
  "rep_range": [8, 12],
  "rest_seconds": 90,
  "order": 1
}
```

### Exercise Candidate Filtering

The backend filters the exercise library by:

- User goal
- Experience level
- Selected workout place
- Available equipment
- Injuries and contraindications
- Focus areas
- Muscle group
- Movement pattern
- Exercise type

The AI receives only approved candidates per fixed slot.

## Current Workout Prompt

### Workout System Prompt

```text
You are Fitnet's constrained workout selection engine. Act as a professional modern gym coach using an evidence-informed, research-based approach. Use the full user context: goal, experience, available days, session duration, workout place, equipment, focus areas, and injuries. The backend has already selected the weekly split and fixed training slots from the user's selected days. You may choose the best approved exercise for each slot and adjust sets, reps, rest, and concise exercise notes within the fixed slot intent. Include a coaching_rationale explaining why this program fits the user's goal, schedule, recovery needs, and training level. Choose only from the candidate IDs provided. Do not invent IDs, names, days, meals, exercises, or fields. Return JSON only. No markdown, prose, comments, or extra fields.
```

### Workout User Prompt Shape

```json
{
  "task": "Select exactly one exercise candidate for each fixed workout slot.",
  "user_context": {
    "goal": "Build Muscle",
    "days": 4,
    "duration_minutes": 60,
    "place": "Building Gym",
    "library_place": "Gym",
    "split": "upper_lower_ab_4",
    "experience": "Intermediate",
    "focus_areas": ["Back", "Chest"],
    "equipment": ["Dumbbells", "Barbell", "Cable machine", "Machines", "Bench"],
    "allowed_equipment": ["Bodyweight", "Dumbbells", "Barbell", "Cable machine", "Kettlebell", "Machines", "Bench"],
    "injuries": [],
    "disliked_exercise_ids": [],
    "excluded_contraindications": []
  },
  "fixed_skeleton": [
    {
      "day_index": 1,
      "day_name": "Upper A",
      "slots": [
        {
          "slot_id": "day1_slot1",
          "day_index": 1,
          "day_name": "Upper A",
          "muscle_group": "Chest",
          "submuscle": "Back",
          "movement_pattern": "push",
          "exercise_type": "compound",
          "sets": 3,
          "rep_range": [8, 12],
          "rest_seconds": 90,
          "order": 1
        }
      ]
    }
  ],
  "candidates_by_slot": {
    "day1_slot1": [
      {
        "id": 101,
        "name": "Barbell Bench Press",
        "category": "Chest",
        "tags": ["push", "compound"]
      }
    ]
  },
  "output_schema_id": "fitnet.workout.output.v1"
}
```

### Required Workout Output

```json
{
  "coaching_rationale": "This plan uses an upper/lower structure because the user selected 4 days, allowing each major muscle group to be trained twice per week with enough recovery. Compound lifts are placed first, followed by accessories to support the user's goal and focus areas.",
  "plan_days": [
    {
      "day_index": 1,
      "day_name": "Upper A",
      "exercises": [
        {
          "slot_id": "day1_slot1",
          "exercise_id": 101,
          "sets": 3,
          "reps": [10, 10, 8],
          "rest_seconds": 90,
          "notes": "Use controlled tempo and stop 1-2 reps before failure."
        }
      ]
    }
  ]
}
```

## Workout AI Responsibilities

The AI can currently decide:

- Best approved exercise for each slot
- Sets, within the fixed slot intent
- Reps, within the slot rep range concept
- Rest time, within reasonable training logic
- Concise exercise notes
- Coaching rationale

The backend still controls:

- Number of workout days
- Weekly split
- Day names
- Fixed slot intent
- Candidate exercise list
- Safety validation
- Output schema

## Nutrition Generation Process

Nutrition is currently more constrained than workout.

The backend calculates:

- Estimated calorie target
- Macro targets
- Meals per day
- Meal slots
- Calorie range per meal
- Macro targets per meal

Then the backend filters foods by:

- Meal type
- Diet style
- Allergy tags
- Dietary restrictions
- Foods to avoid
- Preferences
- Budget/cooking-time scoring

OpenAI receives approved foods per meal slot.

## Current Nutrition Prompt

### Nutrition System Prompt

```text
You are Fitnet's constrained nutrition selection engine. You do not create foods or meal slots freely. Choose only from the candidate IDs provided. Do not invent IDs, names, days, meals, exercises, or fields. Use only approved food IDs from each meal candidate list. Return JSON only. No markdown, prose, comments, or extra fields.
```

### Nutrition User Prompt Shape

```json
{
  "task": "Select approved foods for each fixed meal slot and return calculated meal totals.",
  "user_context": {
    "goal": "Lose Weight",
    "meals_per_day": 3,
    "diet_style": "High Protein",
    "diet_tag": "high_protein",
    "dietary_restrictions": [],
    "allergy_tags": [],
    "cooking_time": "Moderate",
    "budget": "Medium",
    "food_preferences": ["Chicken", "Rice"],
    "food_avoid": ["fried food"],
    "calorie_target": 2200,
    "calorie_range": [1980, 2420],
    "macro_targets": {
      "protein_g": 176,
      "carbs_g": 198,
      "fat_g": 68
    }
  },
  "fixed_skeleton": [
    {
      "day_index": 1,
      "meals": [
        {
          "meal_slot": "breakfast",
          "slot_id": "day1_breakfast_1",
          "calorie_range": [462, 770],
          "macro_targets": {
            "protein_g": 49,
            "carbs_g": 55,
            "fat_g": 19
          },
          "order": 1
        }
      ]
    }
  ],
  "candidates_by_slot": {
    "day1_breakfast_1": [
      {
        "id": 201,
        "name": "Greek Yogurt Bowl",
        "category": "Dairy",
        "tags": ["high_protein", "balanced"]
      }
    ]
  },
  "output_schema_id": "fitnet.nutrition.output.v1"
}
```

### Required Nutrition Output

```json
{
  "nutrition_days": [
    {
      "day_index": 1,
      "meals": [
        {
          "meal_slot": "breakfast",
          "meal_name": "Greek Yogurt Bowl",
          "food_ids": [201, 205, 212],
          "calories": 540,
          "protein_g": 42,
          "carbs_g": 58,
          "fat_g": 14,
          "notes": "High-protein breakfast to support satiety and recovery."
        }
      ],
      "daily_totals": {
        "calories": 2200,
        "protein_g": 176,
        "carbs_g": 198,
        "fat_g": 68
      }
    }
  ]
}
```

## Current Difference Between Workout And Nutrition

Workout has been upgraded to be more coach-like.

Nutrition is still mostly a constrained food selector.

Potential nutrition improvements:

- Add `nutrition_rationale`
- Add meal timing logic
- Add satiety/adherence strategy
- Add halal-first instruction
- Add protein/fiber emphasis
- Add grocery/prep notes
- Add goal-specific nutrition explanation
- Add allowed adjustment range for calories/macros

## Current Strengths

- Very safe output
- No invented IDs
- Approved exercise/food libraries only
- Strong validation before PDF generation
- Backend controls risky decisions
- Easy fallback if AI fails
- Good production reliability

## Current Weaknesses / Open Questions

1. Is the AI still too constrained to act like a real coach?
2. Should the AI be allowed to choose different set counts more freely?
3. Should the AI be allowed to adjust exercise order?
4. Should the AI be allowed to add warm-up sets or warm-up blocks?
5. Should the AI generate progression over multiple weeks?
6. Should the AI generate deload guidance?
7. Should workout output include RPE/RIR targets?
8. Should each exercise include tempo or coaching cues?
9. Should nutrition include meal prep instructions?
10. Should nutrition include portion sizes, not only food IDs?
11. Should the PDF explain why each day is structured as it is?
12. Should the system generate different plans for home, building gym, and full equipment gym beyond only candidate filtering?

## Suggested Target Direction

The ideal next version may be:

```text
Backend controls:
- safety
- allowed exercise/food IDs
- split rules
- schema
- validation
- hard boundaries

AI controls:
- professional coaching rationale
- best exercises/foods within approved candidates
- sets/reps/rest within safe ranges
- RPE/RIR/progression cues
- meal strategy
- adherence notes
- substitutions from approved candidates
```

## How To Print Real Filled Prompts

Use this command from the project root to print real prompts with actual skeletons and candidate IDs:

```bash
cd "/Users/hasanasfahani/Desktop/Fitnet /Dev/Web App Customers"

node - <<'NODE'
const fs = require("fs");
const { generateWorkoutPlan } = require("./lib/workout-engine");
const { generateNutritionPlan } = require("./lib/nutrition-engine");
const {
  buildWorkoutSelectionPrompt,
  buildNutritionSelectionPrompt
} = require("./lib/plan-contracts");

const exercises = JSON.parse(fs.readFileSync("data/exercise_library.json", "utf8"));
const foods = JSON.parse(fs.readFileSync("data/food_library.json", "utf8"));

const workoutInput = {
  goal: "Build Muscle",
  profile: {
    gender: "Male",
    birth_date: "1994-06-15",
    height_cm: 178,
    weight_kg: 88,
    experience: "Intermediate"
  },
  workout: {
    days: "4",
    duration: "60 minutes",
    place: "Building Gym",
    split: "Auto",
    focusAreas: ["Back", "Chest"],
    equipment: ["Dumbbells", "Barbell", "Cable machine", "Machines", "Bench"],
    injuries: ["None"]
  }
};

const nutritionInput = {
  goal: "Lose Weight",
  profile: workoutInput.profile,
  nutrition: {
    meals: "3",
    dietStyle: "High Protein",
    restrictions: ["None"],
    allergies: ["None"],
    cookingTime: "Moderate",
    budget: "Medium",
    preferences: ["Chicken", "Rice"],
    foodsToAvoid: ["Fried food"],
    foodAvoidOther: ""
  }
};

const workout = generateWorkoutPlan(workoutInput, exercises);
const nutrition = generateNutritionPlan(nutritionInput, foods);

console.log("\n--- WORKOUT SYSTEM PROMPT ---\n");
console.log(buildWorkoutSelectionPrompt({
  normalizedInput: workout.normalized_input,
  skeleton: workout.skeleton,
  candidateMap: workout.candidate_map
}).system);

console.log("\n--- WORKOUT USER PROMPT ---\n");
console.log(buildWorkoutSelectionPrompt({
  normalizedInput: workout.normalized_input,
  skeleton: workout.skeleton,
  candidateMap: workout.candidate_map
}).user);

console.log("\n--- NUTRITION SYSTEM PROMPT ---\n");
console.log(buildNutritionSelectionPrompt({
  normalizedInput: nutrition.normalized_input,
  skeleton: nutrition.skeleton,
  candidateMap: nutrition.candidate_map
}).system);

console.log("\n--- NUTRITION USER PROMPT ---\n");
console.log(buildNutritionSelectionPrompt({
  normalizedInput: nutrition.normalized_input,
  skeleton: nutrition.skeleton,
  candidateMap: nutrition.candidate_map
}).user);
NODE
```

## Questions For ChatGPT To Analyze

Please analyze this generation architecture and recommend improvements for:

1. Prompt quality
2. Workout coaching quality
3. Nutrition coaching quality
4. Schema design
5. Safety constraints
6. Backend/AI responsibility split
7. Progressive overload support
8. RPE/RIR and evidence-based programming
9. Nutrition adherence and meal structure
10. PDF output quality
11. What should remain deterministic in backend
12. What should be delegated to AI

Please suggest a better version of:

- Workout system prompt
- Workout user prompt shape
- Workout output schema
- Nutrition system prompt
- Nutrition user prompt shape
- Nutrition output schema
- Validation rules
- Backend split between deterministic logic and AI reasoning
