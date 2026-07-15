const app = document.querySelector("#app");
const API_BASE = window.FITNET_API_BASE || window.location.origin;
const APP_STORE_URL = "https://apps.apple.com/ae/app/fitnet-your-gym-partner/id6444032576";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.fitnet.app.gym.fitnet_application&hl=en";
const savedLanguage = (() => {
  try {
    return window.localStorage.getItem("fitnet_language") === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
})();

const state = {
  language: savedLanguage,
  step: "landing",
  goal: "",
  profile: {
    gender: "",
    birth_date: "",
    height_cm: "",
    weight_kg: "",
    experience: ""
  },
  birthDateDraft: {
    month: "",
    day: "",
    year: ""
  },
  planType: "",
  workout: {
    days: "",
    duration: "",
    place: "",
    split: "Auto",
    focusAreas: ["Full Body"],
    equipment: [],
    injuries: ["None"]
  },
  nutrition: {
    meals: "",
    activityLevel: "",
    safetyFlags: [],
    dietStyle: "",
    restrictions: ["None"],
    allergies: ["None"],
    cookingTime: "Flexible",
    budget: "Flexible",
    preferences: [],
    restrictionOther: "",
    foodsToAvoid: [],
    foodAvoidOther: ""
  },
  loadingIndex: 0,
  loadingProgress: 0,
  loadingTarget: 0,
  loadingStartedAt: null,
  exerciseQuery: "",
  exercises: [],
  foods: [],
  securityPolicy: null,
  securityState: null,
  securityError: "",
  securityEvents: [],
  turnstile: {
    required: false,
    siteKey: "",
    token: "",
    widgetId: null,
    error: ""
  },
  generatedWorkout: null,
  generatedNutrition: null,
  apiSessionId: null,
  apiStatus: null,
  apiPreview: null,
  apiError: "",
  downloadUrl: "",
  downloadUrls: [],
};

const goals = [
  "Lose Weight",
  "Build Muscle",
  "Gain Strength",
  "Improve Fitness",
  "Improve Body Shape"
];

const goalIcons = {
  "Lose Weight": "scale",
  "Build Muscle": "muscle",
  "Gain Strength": "strength",
  "Improve Fitness": "runner",
  "Improve Body Shape": "shape"
};

const profileOptions = {
  gender: ["Male", "Female", "Other"],
  experience: ["Beginner", "Intermediate", "Advanced"]
};

const planTypes = ["Workout Only", "Nutrition Only", "Workout + Nutrition"];

const workoutOptions = {
  days: ["2", "3", "4", "5", "6"],
  duration: ["30 minutes", "45 minutes", "60 minutes", "75 minutes", "90 minutes"],
  place: ["Full Equipment Gym", "Home", "Building Gym"],
  focusAreas: ["Full Body", "Glutes", "Chest", "Back", "Shoulders", "Arms", "Core", "Legs", "Cardio"],
  equipment: [
    "Bodyweight",
    "Dumbbells",
    "Barbell",
    "Cable machine",
    "Resistance bands",
    "Kettlebell",
    "Machines",
    "Bench"
  ]
};

const nutritionOptions = {
  meals: ["2", "3", "4", "5", "6"],
  activityLevel: ["Mostly sitting", "Lightly active", "Moderately active", "Very active"],
  safetyFlags: ["None", "Pregnant or breastfeeding", "Eating disorder history", "Medical nutrition needs"],
  dietStyle: ["Balanced", "High Protein", "Low Carb", "Mediterranean", "Vegetarian"],
  restrictions: ["None", "Gluten-free", "Dairy-free", "No red meat"],
  allergies: ["None", "Nuts", "Shellfish", "Eggs", "Dairy", "Soy"],
  preferences: ["Chicken", "Beef", "Fish", "Rice", "Pasta", "Salads", "Smoothies", "Coffee"],
  foodsToAvoid: ["Beef", "Fish", "Eggs", "Dairy", "Nuts", "Soy", "Spicy food", "Fried food"]
};

const loadingStepSets = {
  workout: [
    "Reviewing your training profile",
    "Building your weekly structure",
    "Selecting exercises and training targets",
    "Checking balance and session duration",
    "Creating your workout download"
  ],
  nutrition: [
    "Calculating your nutrition targets",
    "Building your meal structure",
    "Selecting and balancing recipes",
    "Checking portions and dietary needs",
    "Creating your nutrition download"
  ],
  combined: [
    "Reviewing your profile and goals",
    "Building your plan structures",
    "Creating your workout program",
    "Creating your nutrition plan",
    "Checking quality and preparing downloads"
  ]
};

const loadingStepThresholds = [0, 18, 38, 64, 84];

const iconMap = {
  back: "←",
  chevron: "→",
  check: "✓",
  target: "🎯",
  scale: "⚖️",
  muscle: "💪",
  strength: "🏋️",
  combo: "🏋️🥗",
  runner: "🏃",
  shape: "✨",
  dumbbell: "🏋️",
  utensils: "🥗",
  flame: "🔥",
  lock: "🔒",
  mail: "✉️",
  play: "▶",
  search: "🔎",
  sparkles: "✨",
  zap: "⚡"
};

const icon = (name) => `<span class="ui-icon ${name}" aria-hidden="true">${iconMap[name] || "•"}</span>`;

function render() {
  if (state.step === "landing") {
    app.innerHTML = landingScreen();
    finishLocalizedRender();
    return;
  }

  if (state.step === "loading") {
    app.innerHTML = loadingScreen();
    finishLocalizedRender();
    return;
  }

  const path = getPath();
  const progressIndex = Math.max(path.indexOf(state.step), 0);
  const progress = Math.round((progressIndex / Math.max(path.length - 2, 1)) * 100);

  app.innerHTML = `
    <main class="app-shell">
      <div class="ambient ambient-left"></div>
      <div class="ambient ambient-right"></div>
      <section class="phone-frame">
        ${state.step === "preview" ? resultsHeader() : funnelHeader(progress)}
        ${state.securityError ? securityNotice(state.securityError) : ""}
        ${activeScreen()}
        ${state.step !== "preview" ? stickyAction() : ""}
      </section>
    </main>
  `;
  finishLocalizedRender();
}

const arabicUi = {
  "Simple steps. Personal result.": "خطوات سريعة .. خطة مخصصة لك",
  "Your fitness plan, built for you.": "خطة تمرين وتغذية مصممة خصيصاً لك",
  "Answer a few friendly questions and get a workout plan, nutrition plan, or both — prepared around your goal.": "أجب عن بعض الأسئلة لتولد خطتك خلال دقيقتين",
  "Create My Free Plan": "أنشئ خطتي المجانية",
  "Trusted by 1,000+ Fitnet trainees": "موثوق به من أكثر من 1,000 متدرب في فيتنت",
  "to preview": "للمعاينة",
  "workout + meals": "تمارين + وجبات",
  "account needed": "حساب مطلوب",
  "Weekly Plan": "الخطة الأسبوعية",
  "Goal matched": "متوافقة مع الهدف",
  "Equipment filtered": "مناسبة للمعدات",
  "Meals balanced": "وجبات متوازنة",
  "Workout Plan": "خطة تمارين",
  "Nutrition Plan": "خطة تغذية",
  "How it works": "كيف تعمل الخدمة",
  "Starting is easy.": "ابدأ بخطوات بسيطة.",
  "Workout and nutrition, without the guesswork.": "خطة تمارين وتغذية مصممة خصيصاً لك",
  "Choose your goal": "اختر هدفك",
  "Tell Fitnet what you want to improve first.": "أخبر فيتنت بما تريد تحسينه أولاً.",
  "Answer fast questions": "أجب عن أسئلة سريعة",
  "No long forms, just simple choices that matter.": "لا نماذج طويلة، بل خيارات بسيطة ومهمة.",
  "Download your plan": "حمّل خطتك",
  "Get your workout and nutrition PDFs immediately after generation.": "احصل على ملفات التمارين والتغذية فور اكتمال الإنشاء.",
  "A few basics": "بعض المعلومات الأساسية",
  "Just enough to personalize your plan. Quick, simple, and no confusing fitness forms.": "معلومات كافية لتخصيص خطتك، بسرعة وبساطة ودون نماذج معقدة.",
  "Fitness Experience": "الخبرة الرياضية",
  "Height": "الطول",
  "Weight": "الوزن",
  "Birth date": "تاريخ الميلاد",
  "Month": "الشهر",
  "Day": "اليوم",
  "Year": "السنة",
  "Workout, nutrition, or both. You choose the result, Fitnet handles the structure.": "تمارين أو تغذية أو كليهما. اختر ما تريده وسيتولى فيتنت بناء الخطة.",
  "Workout setup": "إعداد التمارين",
  "Shape your training week": "صمّم أسبوعك التدريبي",
  "Tell us where and how often you want to train. We will choose the split for you.": "أخبرنا أين وكم مرة تريد التمرين، وسنختار التقسيم المناسب لك.",
  "Training days per week": "أيام التمرين أسبوعياً",
  "Session duration": "مدة الحصة",
  "Workout place": "مكان التمرين",
  "Focus areas, max 2": "مناطق التركيز، بحد أقصى 2",
  "Equipment": "المعدات",
  "Nutrition setup": "إعداد التغذية",
  "Tune your meals": "خصّص وجباتك",
  "A few food preferences help Fitnet build a realistic plan you can actually follow.": "تساعدنا بعض تفضيلات الطعام على إعداد خطة واقعية يمكنك الالتزام بها.",
  "Meals per day": "الوجبات يومياً",
  "Daily activity level": "مستوى نشاطك اليومي",
  "Mostly sitting": "أقضي معظم يومي جالساً",
  "Lightly active": "نشاط خفيف",
  "Moderately active": "نشاط متوسط",
  "Very active": "نشاط مرتفع",
  "Nutrition safety check": "فحص سلامة خطة التغذية",
  "Pregnant or breastfeeding": "حامل أو مرضعة",
  "Eating disorder history": "تاريخ سابق لاضطرابات الأكل",
  "Medical nutrition needs": "احتياجات تغذية طبية",
  "Automated nutrition plans are currently available for adults only.": "خطط التغذية الآلية متاحة حالياً للبالغين فقط.",
  "For your safety, this automated plan is not appropriate for the selected condition. Please consult a qualified healthcare professional.": "حرصاً على سلامتك، لا تناسب الخطة الآلية الحالة المحددة. يرجى استشارة مختص صحي مؤهل.",
  "Diet style": "النظام الغذائي",
  "Dietary restrictions": "القيود الغذائية",
  "Other dietary restriction": "قيود غذائية أخرى",
  "Food to avoid": "أطعمة ترغب في تجنبها",
  "Other food to avoid": "أطعمة أخرى ترغب في تجنبها",
  "Type anything else": "اكتب أي تفاصيل أخرى",
  "Allergies": "الحساسية",
  "Food preferences": "تفضيلات الطعام",
  "Step 01": "الخطوة 01", "Step 02": "الخطوة 02", "Step 03": "الخطوة 03",
  "Start My Plan": "ابدأ خطتي",
  "Your plan starts here": "خطتك تبدأ من هنا",
  "Pick the goal that matters most right now. Fitnet will shape everything around it.": "اختر الهدف الأهم لك الآن، وسنصمم خطتك بما يناسبه.",
  "Lose Weight": "خسارة الوزن",
  "Build Muscle": "بناء العضلات",
  "Gain Strength": "زيادة القوة",
  "Improve Fitness": "تحسين اللياقة",
  "Improve Body Shape": "تحسين شكل الجسم",
  "Tell us about you": "أخبرنا عن نفسك",
  "Gender": "الجنس",
  "Male": "ذكر",
  "Female": "أنثى",
  "Other": "آخر",
  "Beginner": "مبتدئ",
  "Intermediate": "متوسط",
  "Advanced": "متقدم",
  "Choose your plan": "اختر خطتك",
  "Workout Only": "تمارين فقط",
  "Nutrition Only": "تغذية فقط",
  "Workout + Nutrition": "تمارين وتغذية",
  "Continue": "متابعة",
  "Back": "رجوع",
  "Workout preferences": "تفضيلات التمارين",
  "Nutrition preferences": "تفضيلات التغذية",
  "None": "لا يوجد",
  "Gym": "النادي الرياضي",
  "Home": "المنزل",
  "Building Gym": "نادي المبنى",
  "Full Equipment Gym": "نادي متكامل التجهيزات",
  "Full Body": "كامل الجسم",
  "Glutes": "الأرداف", "Chest": "الصدر", "Back": "الظهر", "Shoulders": "الأكتاف", "Arms": "الذراعان", "Core": "وسط الجسم", "Legs": "الساقان", "Cardio": "الكارديو",
  "Bodyweight": "وزن الجسم", "Dumbbells": "دمبل", "Barbell": "بار حديد", "Cable machine": "جهاز الكابل", "Resistance bands": "أشرطة المقاومة", "Kettlebell": "كيتل بيل", "Machines": "الأجهزة", "Bench": "مقعد",
  "30 minutes": "30 دقيقة", "45 minutes": "45 دقيقة", "60 minutes": "60 دقيقة", "75 minutes": "75 دقيقة", "90 minutes": "90 دقيقة",
  "Balanced": "متوازن", "High Protein": "عالي البروتين", "Low Carb": "قليل الكربوهيدرات", "Mediterranean": "متوسطي", "Vegetarian": "نباتي",
  "Gluten-free": "خالٍ من الغلوتين", "Dairy-free": "خالٍ من الألبان", "No red meat": "دون لحوم حمراء",
  "Nuts": "المكسرات", "Shellfish": "المحار", "Eggs": "البيض", "Dairy": "الألبان", "Soy": "الصويا", "Spicy food": "الطعام الحار", "Fried food": "الطعام المقلي",
  "Chicken": "الدجاج", "Beef": "اللحم البقري", "Fish": "السمك", "Rice": "الأرز", "Pasta": "المعكرونة", "Salads": "السلطات", "Smoothies": "السموثي", "Coffee": "القهوة",
  "4 workouts · 2,250 kcal": "4 تمارين · 2,250 سعرة حرارية",
  "Fitnet is building your plans": "فيتنت يبني خطتك الآن",
  "This usually takes 1–3 minutes. You can keep this page open.": "يستغرق ذلك عادةً من دقيقة إلى ثلاث دقائق. يمكنك إبقاء هذه الصفحة مفتوحة.",
  "Still working. Detailed plans can occasionally take a little longer.": "ما زلنا نعمل على خطتك. قد تستغرق الخطط التفصيلية وقتاً أطول قليلاً.",
  "Workout": "التمارين",
  "Nutrition": "التغذية",
  "Waiting": "بانتظار البدء",
  "Waiting to start": "بانتظار البدء",
  "Preparing": "قيد الإعداد",
  "Final review": "المراجعة النهائية",
  "Building": "قيد الإنشاء",
  "Ready": "جاهزة",
  "Final checks": "المراجعة النهائية",
  "Needs another pass": "تحتاج إلى محاولة أخرى",
  "Ready for final checks": "جاهز للمراجعة النهائية",
  "Your Fitnet plans are ready": "خطط فيتنت الخاصة بك جاهزة",
  "Download": "تحميل",
  "Open plan": "فتح الخطة",
  "Reviewing your profile and goals": "مراجعة ملفك وأهدافك",
  "Building your plan structures": "بناء هيكل خطتك",
  "Creating your workout program": "إنشاء برنامج التمارين",
  "Creating your nutrition plan": "إنشاء خطة التغذية",
  "Checking quality and preparing downloads": "مراجعة الجودة وتجهيز الملفات",
  "Reviewing your training profile": "مراجعة ملفك التدريبي",
  "Building your weekly structure": "بناء جدولك الأسبوعي",
  "Selecting exercises and training targets": "اختيار التمارين والأهداف التدريبية",
  "Checking balance and session duration": "مراجعة التوازن ومدة الحصة",
  "Creating your workout download": "تجهيز ملف التمارين",
  "Calculating your nutrition targets": "حساب أهدافك الغذائية",
  "Building your meal structure": "بناء نظام الوجبات",
  "Selecting and balancing recipes": "اختيار الوصفات وموازنتها",
  "Checking portions and dietary needs": "مراجعة الحصص والاحتياجات الغذائية",
  "Creating your nutrition download": "تجهيز ملف التغذية",
  "Some plans ready": "بعض الخطط جاهزة",
  "One plan needs another pass.": "إحدى الخطط تحتاج إلى محاولة أخرى.",
  "Your Fitnet plans are ready.": "خطط فيتنت الخاصة بك جاهزة.",
  "Download the ready plan now, or retry the failed one.": "حمّل الخطة الجاهزة الآن، أو أعد محاولة إنشاء الخطة الأخرى.",
  "Goal": "الهدف",
  "Personalized": "مخصص",
  "Plan type": "نوع الخطة",
  "Fitnet plan": "خطة فيتنت",
  "Auto": "تلقائي",
  "Workout Program": "برنامج التمارين",
  "A practical 4-week workout plan with structured sessions, exercise sets and reps, progression rules, recovery guidance, and safety notes.": "خطة تمارين عملية لمدة 4 أسابيع، تشمل حصصاً منظمة ومجموعات وتكرارات وقواعد للتقدم وإرشادات للتعافي والسلامة.",
  "Repeat for 4 weeks": "كررها لمدة 4 أسابيع",
  "Needs retry": "تحتاج إلى إعادة المحاولة",
  "Validated by Fitnet": "تم التحقق منها بواسطة فيتنت",
  "A practical 4-week nutrition plan with daily calorie and macro targets, measured meal portions, preparation steps, and a weekly grocery list.": "خطة تغذية عملية لمدة 4 أسابيع، تشمل أهداف السعرات والمغذيات وحصص الوجبات وخطوات التحضير وقائمة تسوق أسبوعية.",
  "Weekly grocery list": "قائمة تسوق أسبوعية",
  "Download Fitnet App for more": "حمّل تطبيق فيتنت للمزيد",
  "Track workouts, monitor your activity, log progress, and keep building healthier habits with Fitnet.": "تابع تمارينك ونشاطك وتقدمك، واستمر في بناء عادات صحية مع فيتنت.",
  "We could not generate a valid version of this plan yet.": "تعذر إنشاء نسخة صالحة من هذه الخطة حتى الآن.",
  "Try again": "حاول مرة أخرى",
  "Preparing download": "جارٍ تجهيز الملف",
  "Please verify that you are human before creating your plan.": "يرجى التحقق من أنك مستخدم حقيقي قبل إنشاء خطتك.",
  "Security check complete": "اكتمل التحقق الأمني",
  "Download on the": "حمّله من",
  "Get it on": "احصل عليه من"
};

function localizeRenderedScope(scope) {
  if (state.language === "ar") {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const original = node.nodeValue.trim();
      if (arabicUi[original]) {
        node.nodeValue = node.nodeValue.replace(original, arabicUi[original]);
      }
    }

    scope.querySelectorAll?.("input[placeholder], textarea[placeholder]").forEach((field) => {
      if (arabicUi[field.placeholder]) {
        field.placeholder = arabicUi[field.placeholder];
      }
    });
  }
}

function uiText(value) {
  const text = String(value ?? "");
  return state.language === "ar" && arabicUi[text] ? arabicUi[text] : text;
}

function finishLocalizedRender() {
  document.documentElement.lang = state.language;
  document.documentElement.dir = state.language === "ar" ? "rtl" : "ltr";
  document.body.classList.toggle("is-rtl", state.language === "ar");
  localizeRenderedScope(app);

  if (state.step !== "loading" && state.step !== "preview") {
    const switcher = document.createElement("button");
    switcher.type = "button";
    switcher.className = "language-switcher";
    switcher.dataset.action = "language";
    switcher.dataset.value = state.language === "ar" ? "en" : "ar";
    switcher.textContent = state.language === "ar" ? "English" : "العربية";
    switcher.setAttribute("aria-label", state.language === "ar" ? "Switch to English" : "التبديل إلى العربية");
    app.appendChild(switcher);
  }
  mountTurnstile();
}

function renderPreservingScroll() {
  const scroller = document.querySelector(".screen");
  const scrollTop = scroller ? scroller.scrollTop : 0;
  render();
  const restore = () => {
    const nextScroller = document.querySelector(".screen");
    if (nextScroller) {
      nextScroller.scrollTop = scrollTop;
    }
  };

  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(restore);
  } else {
    window.setTimeout(restore, 0);
  }
}

function activeScreen() {
  if (state.step === "goal") {
    return questionScreen(
      "Step 01",
      "Your plan starts here",
      "Pick the goal that matters most right now. Fitnet will shape everything around it.",
      `<div class="option-grid">${goals
        .map((item) =>
          optionButton({
            label: item,
            selected: state.goal === item,
            action: "goal",
            iconName: goalIcons[item]
          })
        )
        .join("")}</div>`
    );
  }

  if (state.step === "profile") {
    return questionScreen(
      "Step 02",
      "A few basics",
      "Just enough to personalize your plan. Quick, simple, and no confusing fitness forms.",
      [
        profileField("Gender", "gender"),
        birthDateWheelField(),
        profileNumberField("Height", "height_cm", "number", "cm", "175"),
        profileNumberField("Weight", "weight_kg", "number", "kg", "75"),
        profileField("Fitness Experience", "experience")
      ].join("")
    );
  }

  if (state.step === "planType") {
    return questionScreen(
      "Step 03",
      "Choose your plan",
      "Workout, nutrition, or both. You choose the result, Fitnet handles the structure.",
      `<div class="plan-type-grid">${planTypes
        .map((item) =>
          optionButton({
            label: item,
            selected: state.planType === item,
            action: "planType",
            iconName: planTypeIcon(item),
            large: true
          })
        )
        .join("")}</div>`
    );
  }

  if (state.step === "workout") {
    return questionScreen(
      "Workout setup",
      "Shape your training week",
      "Tell us where and how often you want to train. We will choose the split for you.",
      [
        workoutField("Training days per week", "days"),
        workoutField("Session duration", "duration"),
        workoutField("Workout place", "place"),
        workoutMultiField("Focus areas, max 2", "focusAreas", 2),
        shouldShowEquipmentField() ? workoutMultiField("Equipment", "equipment") : ""
      ].join("")
    );
  }

  if (state.step === "nutrition") {
    return questionScreen(
      "Nutrition setup",
      "Tune your meals",
      "A few food preferences help Fitnet build a realistic plan you can actually follow.",
      [
        nutritionField("Meals per day", "meals"),
        nutritionField("Daily activity level", "activityLevel"),
        nutritionMultiField("Nutrition safety check", "safetyFlags", true),
        nutritionField("Diet style", "dietStyle"),
        dietaryRestrictionsField(),
        nutritionMultiField("Allergies", "allergies", true),
        nutritionMultiField("Food preferences", "preferences"),
        foodAvoidField()
      ].join("")
    );
  }

  return previewScreen();
}

function landingScreen() {
  return `
    <main class="landing">
      <div class="landing-orb landing-orb-a"></div>
      <div class="landing-orb landing-orb-b"></div>
      <nav class="landing-nav">
        ${fitnetLogo()}
      </nav>
      <section class="landing-content">
        <div class="hero-copy">
          <span class="status-pill">${icon("sparkles")}Simple steps. Personal result.</span>
          <h1>Your fitness plan, built for you.</h1>
          <p>Answer a few friendly questions and get a workout plan, nutrition plan, or both — prepared around your goal.</p>
          <div class="hero-actions">
            <button class="primary-button hero-button" data-action="start">Create My Free Plan ${icon("chevron")}</button>
            <div class="no-account">${icon("check")}Trusted by 1,000+ Fitnet trainees</div>
          </div>
        </div>
        <div class="hero-visual" aria-label="Fitnet plan preview">
          <div class="fitness-photo"></div>
          <div class="hero-plan-card">
            <div class="device-top">${fitnetLogo(true)}<span>Ready</span></div>
            <div class="plan-meter">
              <strong>Weekly Plan</strong>
              <span>4 workouts · 2,250 kcal</span>
            </div>
            <div class="device-list">
              <span>${icon("target")}Goal matched</span>
              <span>${icon("dumbbell")}Equipment filtered</span>
              <span>${icon("utensils")}Meals balanced</span>
            </div>
          </div>
          <div class="floating-card card-a">${icon("dumbbell")}Workout Plan</div>
          <div class="floating-card card-b">${icon("utensils")}Nutrition Plan</div>
        </div>
      </section>
      <section class="landing-section how-section">
        <div class="section-heading">
          <span class="eyebrow">How it works</span>
          <h2>Starting is easy.</h2>
        </div>
        <div class="benefit-grid">
          ${benefitCard("1", "Choose your goal", "Tell Fitnet what you want to improve first.")}
          ${benefitCard("2", "Answer fast questions", "No long forms, just simple choices that matter.")}
          ${benefitCard("3", "Download your plan", "Get your workout and nutrition PDFs immediately after generation.")}
        </div>
      </section>
      <section class="landing-section cta-section">
        <div>
          <h2>Workout and nutrition, without the guesswork.</h2>
        </div>
        <div class="cta-actions">
          <button class="primary-button" data-action="start">Start My Plan ${icon("chevron")}</button>
          <div class="store-row" aria-label="Download Fitnet app">
            ${linkedStoreBadges()}
          </div>
        </div>
      </section>
    </main>
  `;
}

function benefitCard(number, title, text) {
  return `
    <article class="benefit-card">
      <span>${number}</span>
      <h3>${title}</h3>
      <p>${text}</p>
    </article>
  `;
}

function funnelHeader(progress) {
  return `
    <header class="funnel-header">
      <div class="header-row">
        <button class="back-button" data-action="back" aria-label="Go back">${icon("back")}</button>
        ${fitnetLogo(true)}
        <span class="progress-pill">${Math.min(progress, 100)}%</span>
      </div>
      <div class="progress-track" aria-label="Progress">
        <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
      </div>
    </header>
  `;
}

function resultsHeader() {
  return `
    <header class="funnel-header results-header">
      <button class="results-home-button" data-action="home" type="button" aria-label="Start a new Fitnet plan">
        ${fitnetLogo(true)}
      </button>
    </header>
  `;
}

function questionScreen(eyebrow, title, subtitle, children) {
  return `
    <div class="screen">
      <span class="eyebrow">${eyebrow}</span>
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <div class="screen-stack">${children}</div>
    </div>
  `;
}

function stickyAction() {
  return `
    <div class="sticky-action">
      ${generationSecurityChallenge()}
      <button class="primary-button" data-action="next" ${canContinue() ? "" : "disabled"}>
        Continue ${icon("chevron")}
      </button>
    </div>
  `;
}

function generationSecurityChallenge() {
  if (!isFinalQuestionStep() || !state.turnstile.required) return "";
  if (state.turnstile.token) {
    return `<div class="turnstile-verified">${icon("lock")} <span>Security check complete</span></div>`;
  }
  return `
    <div class="turnstile-challenge">
      <span>Please verify that you are human before creating your plan.</span>
      <div id="turnstile-widget"></div>
      ${state.turnstile.error ? `<small>${escapeHtml(state.turnstile.error)}</small>` : ""}
    </div>
  `;
}

function isFinalQuestionStep() {
  const path = getPath();
  return path[path.indexOf(state.step) + 1] === "loading";
}

function shouldShowEquipmentField() {
  return state.workout.place === "Home" || state.workout.place === "Building Gym";
}

function planTypeIcon(planType) {
  if (planType === "Workout Only") return "dumbbell";
  if (planType === "Nutrition Only") return "utensils";
  return "combo";
}

function updateContinueButton() {
  const button = document.querySelector('[data-action="next"]');
  if (button) {
    button.disabled = !canContinue();
  }
}

function securityNotice(message) {
  return `<div class="security-notice">${message}</div>`;
}

function birthDateParts() {
  if (state.birthDateDraft.year || state.birthDateDraft.month || state.birthDateDraft.day) {
    return { ...state.birthDateDraft };
  }

  const [year = "", month = "", day = ""] = (state.profile.birth_date || "").split("-");
  return { year, month, day };
}

function setBirthDatePart(part, value) {
  state.birthDateDraft = {
    ...birthDateParts(),
    [part]: value
  };

  const maxDay = daysInMonth(state.birthDateDraft.year, state.birthDateDraft.month);
  if (state.birthDateDraft.day && Number(state.birthDateDraft.day) > maxDay) {
    state.birthDateDraft.day = String(maxDay).padStart(2, "0");
  }

  if (state.birthDateDraft.year && state.birthDateDraft.month && state.birthDateDraft.day) {
    state.profile.birth_date = `${state.birthDateDraft.year}-${state.birthDateDraft.month}-${state.birthDateDraft.day}`;
    return;
  }

  state.profile.birth_date = "";
}

function daysInMonth(year, month) {
  const safeYear = Number(year) || 2000;
  const safeMonth = Number(month) || 1;
  return new Date(safeYear, safeMonth, 0).getDate();
}

function generationProfile() {
  return { ...state.profile };
}

function generationNutrition() {
  return {
    ...state.nutrition,
    restrictions: [
      ...state.nutrition.restrictions,
      state.nutrition.restrictionOther.trim()
    ].filter(Boolean),
    food_avoid: [
      ...state.nutrition.foodsToAvoid,
      state.nutrition.foodAvoidOther.trim()
    ].filter(Boolean)
  };
}

function profileField(label, field) {
  return fieldGroup(
    label,
    `<div class="option-grid compact">${profileOptions[field]
      .map((item) =>
        optionButton({
          label: item,
          selected: state.profile[field] === item,
          action: "profile",
          field
        })
      )
      .join("")}</div>`
  );
}

function profileNumberField(label, field, type, unit = "", placeholder = "") {
  const value = state.profile[field] || "";
  return fieldGroup(
    label,
    `<label class="number-input">
      <input
        data-action="profileInput"
        data-field="${field}"
        type="${type}"
        value="${escapeAttribute(value)}"
        placeholder="${escapeAttribute(placeholder)}"
        ${type === "number" ? 'inputmode="numeric" min="1"' : ""}
        aria-label="${escapeAttribute(label)}"
      />
      ${unit ? `<span>${unit}</span>` : ""}
    </label>`
  );
}

function birthDateWheelField() {
  const parts = birthDateParts();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 78 }, (_, index) => String(currentYear - 13 - index));
  const months = [
    ["01", "Jan"],
    ["02", "Feb"],
    ["03", "Mar"],
    ["04", "Apr"],
    ["05", "May"],
    ["06", "Jun"],
    ["07", "Jul"],
    ["08", "Aug"],
    ["09", "Sep"],
    ["10", "Oct"],
    ["11", "Nov"],
    ["12", "Dec"]
  ];
  const days = Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, index) =>
    String(index + 1).padStart(2, "0")
  );

  return fieldGroup(
    "Birth date",
    `<div class="date-wheel" aria-label="Birth date">
      ${wheelSelect("Month", "month", months, parts.month)}
      ${wheelSelect("Day", "day", days.map((day) => [day, day]), parts.day)}
      ${wheelSelect("Year", "year", years.map((year) => [year, year]), parts.year)}
    </div>`
  );
}

function wheelSelect(label, part, options, value) {
  return `
    <label class="wheel-column">
      <span>${label}</span>
      <select data-action="birthDateWheel" data-part="${part}" aria-label="${label}">
        <option value="">${label}</option>
        ${options
          .map(
            ([optionValue, optionLabel]) =>
              `<option value="${optionValue}" ${value === optionValue ? "selected" : ""}>${optionLabel}</option>`
          )
          .join("")}
      </select>
    </label>
  `;
}

function workoutField(label, field) {
  return fieldGroup(
    label,
    `<div class="option-grid compact">${workoutOptions[field]
      .map((item) =>
        optionButton({
          label: field === "place" && item === "Full Equipment Gym" ? "Gym" : item,
          selected: state.workout[field] === item,
          action: "workout",
          field,
          value: item
        })
      )
      .join("")}</div>`
  );
}

function workoutMultiField(label, field, limit = null, withNone = false) {
  return fieldGroup(
    label,
    `<div class="option-grid compact">${workoutOptions[field]
      .map((item) =>
        optionButton({
          label: item,
          selected: state.workout[field].includes(item),
          action: "workoutMulti",
          field,
          limit,
          withNone
        })
      )
      .join("")}</div>`
  );
}

function nutritionField(label, field) {
  return fieldGroup(
    label,
    `<div class="option-grid compact">${nutritionOptions[field]
      .map((item) =>
        optionButton({
          label: item,
          selected: state.nutrition[field] === item,
          action: "nutrition",
          field
        })
      )
      .join("")}</div>`
  );
}

function nutritionMultiField(label, field, withNone = false) {
  return fieldGroup(
    label,
    `<div class="option-grid compact">${nutritionOptions[field]
      .map((item) =>
        optionButton({
          label: item,
          selected: state.nutrition[field].includes(item),
          action: "nutritionMulti",
          field,
          withNone
        })
      )
      .join("")}</div>`
  );
}

function dietaryRestrictionsField() {
  return fieldGroup(
    "Dietary restrictions",
    `<div class="option-grid compact">${nutritionOptions.restrictions
      .map((item) =>
        optionButton({
          label: item,
          selected: state.nutrition.restrictions.includes(item),
          action: "nutritionMulti",
          field: "restrictions",
          withNone: true
        })
      )
      .join("")}</div>
    <label class="input-field soft-input">
      <span>Other dietary restriction</span>
      <input
        data-action="nutritionRestrictionOther"
        value="${escapeAttribute(state.nutrition.restrictionOther)}"
        placeholder="Type anything else"
      />
    </label>`
  );
}

function foodAvoidField() {
  return fieldGroup(
    "Food to avoid",
    `<div class="option-grid compact">${nutritionOptions.foodsToAvoid
      .map((item) =>
        optionButton({
          label: item,
          selected: state.nutrition.foodsToAvoid.includes(item),
          action: "nutritionMulti",
          field: "foodsToAvoid"
        })
      )
      .join("")}</div>
    <label class="input-field soft-input">
      <span>Other food to avoid</span>
      <input
        data-action="nutritionAvoidOther"
        value="${escapeAttribute(state.nutrition.foodAvoidOther)}"
        placeholder="Type anything else"
      />
    </label>`
  );
}

function fieldGroup(label, children) {
  return `<section class="field-group"><h2>${label}</h2>${children}</section>`;
}

function optionButton({ label, value = label, selected, action, field = "", iconName = "", large = false, limit, withNone = false }) {
  return `
    <button
      class="${large ? "select-option large" : "select-option"} ${selected ? "selected" : ""}"
      data-action="${action}"
      data-field="${field}"
      data-value="${escapeAttribute(value)}"
      data-limit="${limit ?? ""}"
      data-with-none="${withNone ? "true" : "false"}"
    >
      ${iconName ? icon(iconName) : ""}
      <span>${label}</span>
    </button>
  `;
}

function exerciseSearch() {
  return fieldGroup(
    "Disliked exercises",
    `
      <div class="search-box">
        ${icon("search")}
        <input id="exercise-search" value="${escapeAttribute(state.exerciseQuery)}" placeholder="Search approved exercise library" autocomplete="off" />
      </div>
      <div class="selected-stack">${selectedExerciseHtml()}</div>
      <div class="exercise-results">${exerciseResultsHtml()}</div>
    `
  );
}

function selectedExerciseHtml() {
  return state.workout.dislikedExercises
    .map(
      (exercise) => `
      <button class="selected-chip" data-action="removeExercise" data-id="${exercise.exercise_id}">
        ${exercise.name}
        <span>Remove</span>
      </button>
    `
    )
    .join("");
}

function exerciseResultsHtml() {
  return getExerciseResults()
    .map(
      (exercise) => `
      <button class="exercise-result" data-action="addExercise" data-id="${exercise.exercise_id}">
        <span>${exercise.name}</span>
        <small>${exercise.category} · ${exercise.difficulty}</small>
      </button>
    `
    )
    .join("");
}

function localizedResultValue(value) {
  return state.language === "ar" ? uiText(String(value)) : value;
}

function workoutDurationSummary(days) {
  const value = localizedResultValue(days);
  return state.language === "ar" ? `4 أسابيع · ${value} أيام` : `4 weeks · ${value} days`;
}

function calorieTargetSummary(calories) {
  const value = formattedCalorieValue(calories);
  return state.language === "ar" ? `حوالي ${value} سعرة حرارية يومياً` : `Approx. ${value} kcal/day`;
}

function trainingDaysFact(days) {
  const value = localizedResultValue(days);
  return state.language === "ar" ? `${value} أيام تمرين أسبوعياً` : `${value} training days/week`;
}

function calorieFact(calories) {
  const value = formattedCalorieValue(calories);
  return state.language === "ar" ? `هدف السعرات اليومي: ${value} سعرة حرارية` : `Daily calorie target: ${value} kcal`;
}

function formattedCalorieValue(calories) {
  const numeric = Number(calories);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  return Math.round(numeric).toLocaleString(state.language === "ar" ? "ar-AE" : "en-US");
}

function resultNutritionCalorieTarget(nutritionSummary = {}) {
  const serverTarget = [
    nutritionSummary.daily_calorie_target,
    nutritionSummary.average_daily_calories,
    nutritionSummary.daily_totals?.calories
  ].map(Number).find((value) => Number.isFinite(value) && value > 0);
  if (serverTarget) return Math.round(serverTarget);

  try {
    const calculation = window.FitnetNutritionEngine?.calculateCalorieTarget(
      generationProfile(),
      state.goal,
      state.nutrition.activityLevel
    );
    const clientTarget = Number(calculation?.daily_calorie_target);
    return Number.isFinite(clientTarget) && clientTarget > 0 ? Math.round(clientTarget) : null;
  } catch {
    return null;
  }
}

function mealsPerDayFact(meals) {
  const value = localizedResultValue(meals);
  return state.language === "ar" ? `${value} وجبات يومياً` : `${value} meals/day`;
}

function localizedGenerationError(error, kind = "generation") {
  if (state.language !== "ar") return error;

  const value = String(error || "").toLowerCase();
  if (/timed out|taking longer|timeout/.test(value)) {
    return "استغرق إنشاء خطتك وقتاً أطول من المتوقع. حاول مرة أخرى.";
  }
  if (/api server|failed to fetch|network|connection/.test(value)) {
    return "تعذر الاتصال بخادم إنشاء الخطط. تأكد من تشغيل الخادم ثم حاول مرة أخرى.";
  }
  if (/blocked|rate limit|too many/.test(value)) {
    return "تعذر إنشاء الخطة حالياً. انتظر قليلاً ثم حاول مرة أخرى.";
  }

  return kind === "plan"
    ? "تعذر إنشاء نسخة صالحة من هذه الخطة حتى الآن. حاول مرة أخرى."
    : "تعذر إكمال إنشاء خطتك. يمكنك المحاولة مرة أخرى.";
}

function previewScreen() {
  const hasWorkout = state.planType.includes("Workout");
  const hasNutrition = state.planType.includes("Nutrition");
  const preview = state.apiPreview?.preview || {};
  const workoutSummary = preview.workout || {};
  const nutritionSummary = preview.nutrition || {};
  const planStatuses = state.apiStatus?.plan_statuses || preview.plan_statuses || {};
  const planErrors = state.apiStatus?.plan_errors || preview.plan_errors || {};
  const downloadLinks = state.downloadUrls.length ? state.downloadUrls : directDownloadLinks();
  const workoutFailed = planStatuses.workout === "failed";
  const nutritionFailed = planStatuses.nutrition === "failed";
  const partialReady = state.apiStatus?.status === "partial_ready";
  const workoutDays = state.workout.days || workoutSummary.days || "Auto";
  // The results card describes the calculated target. Individual menu days can
  // vary slightly around it and must not replace the target with day 1's total.
  const nutritionCalories = resultNutritionCalorieTarget(nutritionSummary);
  const nutritionMeals = nutritionSummary.meals || state.nutrition.meals || "Auto";

  return `
    <div class="screen preview-screen">
      ${partialReady ? `<span class="eyebrow success">Some plans ready</span>` : ""}
      <h1>${partialReady ? "One plan needs another pass." : "Your Fitnet plans are ready."}</h1>
      ${partialReady ? "<p>Download the ready plan now, or retry the failed one.</p>" : ""}
      ${state.apiError ? securityNotice(localizedGenerationError(state.apiError)) : ""}
      <div class="summary-grid">
        ${summaryCard("Goal", state.goal || "Personalized", "target")}
        ${summaryCard("Plan type", state.planType || "Fitnet plan", "zap")}
        ${hasWorkout ? summaryCard("Workout", workoutDurationSummary(workoutDays), "dumbbell") : ""}
        ${hasNutrition ? summaryCard("Nutrition", calorieTargetSummary(nutritionCalories), "utensils") : ""}
      </div>
      <div class="results-stack">
        ${hasWorkout ? resultPlanCard({
          iconName: "dumbbell",
          title: "Workout Program",
          description: "A practical 4-week workout plan with structured sessions, exercise sets and reps, progression rules, recovery guidance, and safety notes.",
          facts: [
            "Repeat for 4 weeks",
            trainingDaysFact(workoutDays),
            workoutFailed ? "Needs retry" : "Validated by Fitnet"
          ],
          link: downloadLinks.find((item) => item.kind === "workout"),
          failed: workoutFailed,
          error: planErrors.workout
        }) : ""}
        ${hasNutrition ? resultPlanCard({
          iconName: "utensils",
          title: "Nutrition Plan",
          description: "A practical 4-week nutrition plan with daily calorie and macro targets, measured meal portions, preparation steps, and a weekly grocery list.",
          facts: [
            calorieFact(nutritionCalories),
            mealsPerDayFact(nutritionMeals),
            nutritionFailed ? "Needs retry" : "Weekly grocery list"
          ],
          link: downloadLinks.find((item) => item.kind === "nutrition"),
          failed: nutritionFailed,
          error: planErrors.nutrition
        }) : ""}
      </div>
      <div class="app-download-panel">
        <h2>Download Fitnet App for more</h2>
        <p>Track workouts, monitor your activity, log progress, and keep building healthier habits with Fitnet.</p>
        <div class="store-row">
          ${linkedStoreBadges()}
        </div>
      </div>
    </div>
  `;
}

function directDownloadLinks() {
  return (state.apiStatus?.pdf_downloads || state.apiPreview?.pdf_downloads || state.apiStatus?.download_urls || []).map((item) => ({
    ...item,
    ...(item.url ? { absolute_url: item.absolute_url || `${API_BASE}${item.url}` } : {})
  }));
}

function setDownloadLinks(items = []) {
  state.downloadUrls = items.map((item) => ({
    ...item,
    ...(item.url ? { absolute_url: item.absolute_url || `${API_BASE}${item.url}` } : {})
  }));
  state.downloadUrl = state.downloadUrls[0]?.absolute_url || "";
}

function resultPlanCard({ iconName, title, description, facts, link, failed = false, error = "" }) {
  const displayTitle = uiText(title);
  const downloadLabel = state.language === "ar" ? `تحميل ${displayTitle}` : `Download ${displayTitle}`;

  return `
    <section class="result-plan-card">
      <div class="result-plan-top">
        <div class="summary-icon ${iconName}">${icon(iconName)}</div>
        <div>
          <h2>${displayTitle}</h2>
        </div>
      </div>
      <p>${uiText(description)}</p>
      ${failed ? `<div class="security-notice">${escapeHtml(localizedGenerationError(error, "plan") || uiText("We could not generate a valid version of this plan yet."))}</div>` : ""}
      <div class="result-facts">
        ${facts.map((fact) => `<span>${uiText(fact)}</span>`).join("")}
      </div>
      ${
        link
          ? link.payload
            ? `<button class="primary-button" data-action="downloadPdf" data-kind="${escapeAttribute(link.kind)}" type="button">${downloadLabel} ${icon("chevron")}</button>`
            : `<a class="primary-button" href="${escapeAttribute(link.absolute_url)}" target="_blank" rel="noopener">${downloadLabel} ${icon("chevron")}</a>`
          : failed
            ? `<button class="primary-button" data-action="retryFailedPlan" type="button">${uiText("Try again")}</button>`
          : `<button class="primary-button" disabled>${uiText("Preparing download")}</button>`
      }
    </section>
  `;
}

function getGeneratedWorkout() {
  if (!state.generatedWorkout && window.FitnetWorkoutEngine && state.exercises.length) {
    state.generatedWorkout = window.FitnetWorkoutEngine.generateWorkoutPlan(
      {
        goal: state.goal,
        profile: generationProfile(),
        workout: state.workout
      },
      state.exercises,
      { includeNames: true }
    );
  }

  return state.generatedWorkout;
}

function resetGeneratedWorkout() {
  state.generatedWorkout = null;
}

function getGeneratedNutrition() {
  if (!state.generatedNutrition && window.FitnetNutritionEngine && state.foods.length) {
    state.generatedNutrition = window.FitnetNutritionEngine.generateNutritionPlan(
      {
        goal: state.goal,
        profile: generationProfile(),
        nutrition: generationNutrition()
      },
      state.foods,
      { includeNames: true }
    );
  }

  return state.generatedNutrition;
}

function resetGeneratedNutrition() {
  state.generatedNutrition = null;
}

function workoutExercisePreview(day) {
  const exercises = (day?.exercises || []).slice(0, 3);

  if (!exercises.length) {
    return previewLine("Sample exercises", "Workout generation pending");
  }

  return exercises
    .map((exercise, index) =>
      previewLine(
        `Exercise ${index + 1}`,
        `${exercise._exercise_name || `Exercise #${exercise.exercise_id}`} · ${exercise.sets} sets`
      )
    )
    .join("");
}

function summaryCard(label, value, iconName) {
  return `
    <div class="summary-card">
      <div class="summary-icon ${iconName}">${icon(iconName)}</div>
      <span>${uiText(label)}</span>
      <strong>${uiText(value)}</strong>
    </div>
  `;
}

function previewLine(title, detail) {
  return `<div class="preview-line"><span>${title}</span><strong>${detail}</strong></div>`;
}

function loadingScreen() {
  const steps = loadingSteps();
  const progress = Math.min(Math.round(state.loadingProgress), 100);
  const activeIndex = displayedLoadingPhase(progress);
  const elapsedSeconds = state.loadingStartedAt ? Math.floor((Date.now() - state.loadingStartedAt) / 1000) : 0;
  const timeMessage = elapsedSeconds >= 90
    ? "Still working. Detailed plans can occasionally take a little longer."
    : "This usually takes 1–3 minutes. You can keep this page open.";
  return `
    <main class="loading-screen">
      <section class="loading-panel" aria-labelledby="loading-title">
        <div class="pulse-orbit">${fitnetLogo(true)}</div>
        <h1 id="loading-title">Fitnet is building your plans</h1>
        <p class="loading-time-message" data-loading-time>${timeMessage}</p>
        ${loadingFacts()}
        <div class="loading-progress-meta">
          <span data-loading-active>${escapeHtml(steps[activeIndex])}</span>
          <strong data-loading-percent>${progress}%</strong>
        </div>
        <div class="loading-track" data-loading-track role="progressbar" aria-label="Plan generation progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <div class="loading-fill" data-loading-fill style="width: ${progress}%"></div>
        </div>
        ${combinedPlanProgress()}
        <div class="loading-list">
          ${steps
            .map((item, index) => {
              const statusClass = progress >= 100 || index < activeIndex ? "completed" : index === activeIndex ? "current" : "upcoming";
              return `
                <div class="loading-item ${statusClass}" data-loading-step="${index}">
                  <span data-loading-step-marker>${progress >= 100 || index < activeIndex ? icon("check") : index + 1}</span>
                  <strong>${item}</strong>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
    </main>
  `;
}

function loadingSteps() {
  if (state.planType === "Workout Only") return loadingStepSets.workout;
  if (state.planType === "Nutrition Only") return loadingStepSets.nutrition;
  return loadingStepSets.combined;
}

function loadingFacts() {
  const facts = [];
  if (state.planType.includes("Workout")) {
    facts.push(state.language === "ar"
      ? `${state.workout.days || "مخصصة"} أيام تمرين`
      : `${state.workout.days || "Personalized"} training days`);
  }
  if (state.planType.includes("Nutrition")) {
    facts.push(state.language === "ar"
      ? `${state.nutrition.meals || "مخصصة"} وجبات يومياً`
      : `${state.nutrition.meals || "Personalized"} meals per day`);
  }
  facts.push(state.goal ? uiText(state.goal) : (state.language === "ar" ? "هدف مخصص" : "Personalized goal"));
  return `<div class="loading-facts">${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("")}</div>`;
}

function combinedPlanProgress() {
  if (state.planType !== "Workout + Nutrition") return "";
  const workoutStatus = inferredPlanProgress("workout");
  const nutritionStatus = inferredPlanProgress("nutrition");
  return `
    <div class="loading-plan-progress" aria-label="Individual plan progress">
      <div data-plan-kind="workout"><span class="loading-status-dot ${workoutStatus.className}"></span><strong>${uiText("Workout Plan")}</strong><small>${workoutStatus.label}</small></div>
      <div data-plan-kind="nutrition"><span class="loading-status-dot ${nutritionStatus.className}"></span><strong>${uiText("Nutrition Plan")}</strong><small>${nutritionStatus.label}</small></div>
    </div>
  `;
}

function generationEventsText(status = state.apiStatus) {
  return JSON.stringify(status?.generation_events || []).toLowerCase();
}

function displayedLoadingPhase(progress = state.loadingProgress) {
  return loadingStepThresholds.reduce(
    (current, threshold, index) => (progress >= threshold ? index : current),
    0
  );
}

function loadingProgressForCurrentPhase() {
  const durations = state.planType === "Workout + Nutrition"
    ? [12, 22, 35, 28, 75]
    : [12, 20, 35, 25, 55];
  let remainingSeconds = Math.max(0, (Date.now() - (state.loadingStartedAt || Date.now())) / 1000);

  for (let index = 0; index < loadingStepThresholds.length; index += 1) {
    const duration = durations[index];
    const start = loadingStepThresholds[index];
    const end = index === loadingStepThresholds.length - 1 ? 98 : loadingStepThresholds[index + 1] - 0.5;
    if (remainingSeconds <= duration) {
      return start + (end - start) * Math.min(remainingSeconds / duration, 1);
    }
    remainingSeconds -= duration;
  }

  return 98;
}

function inferredPlanProgress(kind) {
  const status = state.apiStatus?.plan_statuses?.[kind];
  if (status === "ready" && state.loadingProgress >= 99.95) return { label: "Ready", className: "ready" };
  if (status === "failed") return { label: "Needs another pass", className: "failed" };

  const events = generationEventsText();
  let actualRank = status === "ready" || events.includes(`${kind}_openai_valid`)
    ? 2
    : events.includes(`${kind}_started`) || events.includes(`${kind}_local_ready`)
      ? 1
      : 0;
  const visiblePhase = displayedLoadingPhase();
  const allowedRank = kind === "workout"
    ? visiblePhase < 2 ? 0 : visiblePhase < 3 ? 1 : 2
    : visiblePhase < 3 ? 0 : visiblePhase < 4 ? 1 : 2;
  if (!state.apiStatus) actualRank = allowedRank;
  const visibleRank = Math.min(actualRank, allowedRank);

  if (visibleRank === 2) return { label: "Final review", className: "building" };
  if (visibleRank === 1) return { label: "Preparing", className: "building" };
  return { label: "Waiting to start", className: "waiting" };
}

function updateLoadingView() {
  if (state.step !== "loading") return;
  const steps = loadingSteps();
  const progress = Math.min(Math.round(state.loadingProgress), 100);
  const activeIndex = displayedLoadingPhase(progress);
  const elapsedSeconds = state.loadingStartedAt ? Math.floor((Date.now() - state.loadingStartedAt) / 1000) : 0;
  const timeMessage = elapsedSeconds >= 90
    ? "Still working. Detailed plans can occasionally take a little longer."
    : "This usually takes 1–3 minutes. You can keep this page open.";

  const time = document.querySelector("[data-loading-time]");
  const active = document.querySelector("[data-loading-active]");
  const percent = document.querySelector("[data-loading-percent]");
  const track = document.querySelector("[data-loading-track]");
  const fill = document.querySelector("[data-loading-fill]");
  if (time) time.textContent = uiText(timeMessage);
  if (active) active.textContent = uiText(steps[activeIndex]);
  if (percent) percent.textContent = `${progress}%`;
  if (track) track.setAttribute("aria-valuenow", String(progress));
  if (fill) fill.style.width = `${progress}%`;

  document.querySelectorAll("[data-loading-step]").forEach((item) => {
    const index = Number(item.dataset.loadingStep);
    const statusClass = progress >= 100 || index < activeIndex ? "completed" : index === activeIndex ? "current" : "upcoming";
    item.className = `loading-item ${statusClass}`;
    const marker = item.querySelector("[data-loading-step-marker]");
    if (marker) marker.innerHTML = progress >= 100 || index < activeIndex ? icon("check") : String(index + 1);
  });

  ["workout", "nutrition"].forEach((kind) => {
    const card = document.querySelector(`[data-plan-kind="${kind}"]`);
    if (!card) return;
    const status = inferredPlanProgress(kind);
    const dot = card.querySelector(".loading-status-dot");
    const label = card.querySelector("small");
    if (dot) dot.className = `loading-status-dot ${status.className}`;
    if (label) label.textContent = uiText(status.label);
  });
}

function fitnetLogo(compact = false, white = false) {
  return `
    <div class="${compact ? "fitnet-logo compact" : "fitnet-logo"}">
      <img src="${white ? "assets/fitnet-white.png" : "assets/fitnet-colorful.png"}" alt="Fitnet" />
    </div>
  `;
}

function appStoreIcon() {
  return `
    <svg class="store-icon apple-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.7 12.4c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.8 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3.1 2.4 1.2 0 1.7-.8 3.1-.8s1.8.8 3.1.8 2.1-1.2 2.9-2.4c.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.8-1.1-2.8-3.9Z" />
      <path d="M14.4 5.6c.7-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2-.5 2.7-1.2Z" />
    </svg>
  `;
}

function googlePlayIcon() {
  return `
    <svg class="store-icon play-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path class="play-blue" d="M4.2 2.8c-.2.3-.3.7-.3 1.2v16c0 .5.1.9.3 1.2l8.7-9.2-8.7-9.2Z" />
      <path class="play-green" d="m13 12 2.8-3L5.3 2.9c-.4-.2-.8-.3-1.1-.1L13 12Z" />
      <path class="play-yellow" d="m13 12-8.8 9.2c.3.2.8.1 1.1-.1L15.8 15 13 12Z" />
      <path class="play-red" d="m15.8 9-2.8 3 2.8 3 3.5-2c1-.6 1-1.4 0-2l-3.5-2Z" />
    </svg>
  `;
}

function linkedStoreBadges() {
  return `
    <a class="store-badge" href="${APP_STORE_URL}" target="_blank" rel="noopener" aria-label="Download Fitnet on the App Store">
      ${appStoreIcon()}<div><span>Download on the</span><strong>App Store</strong></div>
    </a>
    <a class="store-badge" href="${GOOGLE_PLAY_URL}" target="_blank" rel="noopener" aria-label="Get Fitnet on Google Play">
      ${googlePlayIcon()}<div><span>Get it on</span><strong>Google Play</strong></div>
    </a>
  `;
}

function canContinue() {
  if (state.step === "goal") {
    return Boolean(state.goal);
  }

  if (state.step === "profile") {
    return Boolean(
      state.profile.gender &&
        state.profile.birth_date &&
        state.profile.height_cm &&
        state.profile.weight_kg &&
        state.profile.experience
    );
  }

  if (state.step === "planType") {
    return Boolean(state.planType);
  }

  if (state.step === "workout") {
    const complete = Boolean(state.workout.days && state.workout.duration && state.workout.place);
    return complete && (!isFinalQuestionStep() || !state.turnstile.required || Boolean(state.turnstile.token));
  }

  if (state.step === "nutrition") {
    const complete = Boolean(
      state.nutrition.meals &&
      state.nutrition.activityLevel &&
      state.nutrition.safetyFlags.length &&
      state.nutrition.dietStyle
    );
    return complete && (!isFinalQuestionStep() || !state.turnstile.required || Boolean(state.turnstile.token));
  }

  return true;
}

function setStep(step) {
  state.securityError = "";
  state.step = step;
  render();

  if (step === "loading") {
    runLoading();
  }
}

function nextStep() {
  const path = getPath();
  const index = path.indexOf(state.step);
  const next = path[index + 1] || "preview";

  if (next === "loading") {
    const nutritionSafetyError = nutritionEligibilityMessage();
    if (nutritionSafetyError) {
      state.securityError = nutritionSafetyError;
      render();
      return;
    }
    const guard = validateGenerationGuard();
    if (!guard.allowed) {
      state.securityError = securityMessage(guard.reason);
      render();
      return;
    }
  }

  setStep(next);
}

function nutritionEligibilityMessage() {
  if (!state.planType.includes("Nutrition")) return "";
  const birthDate = new Date(state.profile.birth_date);
  if (!Number.isNaN(birthDate.getTime())) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    if (age < 18) return "Automated nutrition plans are currently available for adults only.";
  }
  if (state.nutrition.safetyFlags.some((flag) => flag !== "None")) {
    return "For your safety, this automated plan is not appropriate for the selected condition. Please consult a qualified healthcare professional.";
  }
  return "";
}

function backStep() {
  const path = getPath();
  const index = path.indexOf(state.step);
  setStep(path[index - 1] || "landing");
}

function getPath() {
  const path = ["landing", "goal", "profile", "planType"];

  if (state.planType === "Workout Only" || state.planType === "Workout + Nutrition") {
    path.push("workout");
  }

  if (state.planType === "Nutrition Only" || state.planType === "Workout + Nutrition") {
    path.push("nutrition");
  }

  path.push("loading", "preview");
  return path;
}

function runLoading() {
  state.loadingIndex = 0;
  state.loadingProgress = 3;
  state.loadingTarget = 8;
  state.loadingStartedAt = Date.now();
  state.apiError = "";
  state.apiSessionId = null;
  state.apiStatus = null;
  state.apiPreview = null;
  document.title = "Fitnet is building your plans";
  render();

  const visualTimer = startLoadingAnimation();

  Promise.all([sleep(2400), startApiGeneration()])
    .then(async () => {
      document.title = "Your Fitnet plans are ready";
      await completeLoadingProgress(visualTimer);
      await sleep(450);
    })
    .then(() => setStep("preview"))
    .catch((error) => {
      window.clearInterval(visualTimer);
      state.apiError = error.message || "We could not prepare your real plan yet. Please make sure the API server is running.";
      setStep("preview");
    });
}

function startLoadingAnimation() {
  return window.setInterval(() => {
    const phaseTarget = loadingProgressForCurrentPhase();
    const effectiveTarget = state.loadingTarget >= 100
      ? 100
      : Math.min(98, Math.max(state.loadingTarget, phaseTarget));
    const distance = effectiveTarget - state.loadingProgress;

    if (distance > 0.05) {
      const maxStep = state.loadingProgress >= 90 ? 0.28 : 0.85;
      const minStep = state.loadingProgress >= 90 ? 0.04 : 0.08;
      const step = Math.min(maxStep, Math.max(minStep, distance * 0.06));
      state.loadingProgress = Math.min(effectiveTarget, state.loadingProgress + step);
    }
    updateLoadingView();
  }, 250);
}

function completeLoadingProgress(timer) {
  window.clearInterval(timer);
  state.loadingTarget = 100;
  const startProgress = state.loadingProgress;
  const startedAt = Date.now();
  const duration = 700;

  return new Promise((resolve) => {
    const frame = () => {
      const ratio = Math.min((Date.now() - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      state.loadingProgress = startProgress + (100 - startProgress) * eased;
      updateLoadingView();
      if (ratio < 1) {
        window.setTimeout(frame, 16);
        return;
      }
      state.loadingProgress = 100;
      updateLoadingView();
      resolve();
    };
    frame();
  });
}

async function startApiGeneration() {
  let result;
  try {
    result = await apiPost("/api/generate", {
      language: state.language,
      goal: state.goal,
      profile: generationProfile(),
      plan_type: state.planType,
      workout: state.planType.includes("Workout") ? state.workout : null,
      nutrition: state.planType.includes("Nutrition") ? generationNutrition() : null,
      turnstile_token: state.turnstile.token
    });
  } finally {
    state.turnstile.token = "";
  }
  state.apiSessionId = result.session_id;
  state.apiStatus = result;
  state.apiPreview = result;
  updateLoadingMilestone(result);
  setDownloadLinks(result.pdf_downloads || []);
}

async function downloadStatelessPdf(kind, button) {
  const download = state.downloadUrls.find((item) => item.kind === kind);
  if (!download?.payload || !download?.signature) return;

  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = uiText("Preparing download");

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${API_BASE}/api/render-pdf`;
  form.target = "_blank";
  form.rel = "noopener";
  form.style.display = "none";
  [["payload", download.payload], ["signature", download.signature]].forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  form.remove();

  window.setTimeout(() => {
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }, 1200);
}

function updateLoadingMilestone(status = {}) {
  const events = JSON.stringify(status.generation_events || []).toLowerCase();
  let target = 24;

  if (status.status === "rendering_pdf") target = 94;
  else if (["ready", "partial_ready"].includes(status.status)) target = 98;
  else if (state.planType === "Workout + Nutrition") {
    if (events.includes("nutrition_local_ready")) target = 72;
    else if (events.includes("nutrition_started")) target = 64;
    else if (events.includes("workout_local_ready")) target = 42;
    else if (events.includes("workout_started")) target = 34;
  } else {
    const kind = state.planType === "Nutrition Only" ? "nutrition" : "workout";
    if (events.includes(`${kind}_local_ready`)) target = 58;
    else if (events.includes(`${kind}_started`)) target = 36;
  }

  if (events.includes("openai_valid") || events.includes("succeeded")) target = Math.max(target, 82);
  state.loadingTarget = Math.max(state.loadingTarget, target);
}

async function apiPost(path, body) {
  return apiRequest(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function apiGet(path) {
  return apiRequest(path, { method: "GET" });
}

async function apiRequest(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json"
    },
    ...options
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Fitnet API request failed.");
  }

  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toggleValue(values, value) {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  return [...values, value];
}

function toggleLimited(values, value, limit) {
  if (values.includes(value)) {
    const next = values.filter((item) => item !== value);
    return next.length ? next : ["Full Body"];
  }

  if (value === "Full Body") {
    return ["Full Body"];
  }

  const withoutFullBody = values.filter((item) => item !== "Full Body");

  if (limit && values.length >= limit) {
    return [...withoutFullBody.slice(Math.max(withoutFullBody.length - limit + 1, 0)), value];
  }

  return [...withoutFullBody, value];
}

function toggleWithNone(values, value) {
  if (value === "None") {
    return ["None"];
  }

  const withoutNone = values.filter((item) => item !== "None");

  if (withoutNone.includes(value)) {
    const next = withoutNone.filter((item) => item !== value);
    return next.length ? next : ["None"];
  }

  return [...withoutNone, value];
}

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

async function loadExercises() {
  try {
    const response = await fetch("data/exercise_library.json");
    state.exercises = await response.json();
  } catch {
    state.exercises = await loadExercisesFromCsv();
  }
}

async function loadFoods() {
  try {
    const response = await fetch("data/food_library.json");
    state.foods = await response.json();
  } catch {
    state.foods = [];
  }
}

async function loadSecurityPolicy() {
  try {
    const response = await fetch("data/security-policy.json");
    state.securityPolicy = await response.json();
  } catch {
    state.securityPolicy = window.FitnetSecurityGuards?.DEFAULT_POLICY || null;
  }

  if (window.FitnetSecurityGuards) {
    state.securityState = window.FitnetSecurityGuards.createSecurityState(state.securityPolicy);
  }
}

async function loadSecurityConfig() {
  try {
    const config = await apiGet("/api/security/config");
    state.turnstile.required = Boolean(config.turnstile?.required);
    state.turnstile.siteKey = String(config.turnstile?.site_key || "");
    if (state.turnstile.required && !state.turnstile.siteKey) {
      state.turnstile.error = "Plan verification is temporarily unavailable.";
    }
  } catch {
    // Local static-only previews can still render; production enforcement remains server-side.
    state.turnstile.required = false;
  }
}

function mountTurnstile() {
  const container = document.querySelector("#turnstile-widget");
  if (!container || !state.turnstile.siteKey || state.turnstile.token) return;

  const renderWidget = () => {
    if (!window.turnstile || !document.body.contains(container) || container.dataset.rendered) return;
    container.dataset.rendered = "true";
    state.turnstile.widgetId = window.turnstile.render(container, {
      sitekey: state.turnstile.siteKey,
      language: state.language,
      callback(token) {
        state.turnstile.token = token;
        state.turnstile.error = "";
        renderPreservingScroll();
      },
      "expired-callback"() {
        state.turnstile.token = "";
        state.turnstile.error = "Verification expired. Please try again.";
        renderPreservingScroll();
      },
      "error-callback"() {
        state.turnstile.token = "";
        state.turnstile.error = "Verification failed. Please try again.";
        return true;
      }
    });
  };

  if (window.turnstile) {
    renderWidget();
    return;
  }

  let script = document.querySelector("script[data-fitnet-turnstile]");
  if (!script) {
    script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.fitnetTurnstile = "true";
    document.head.appendChild(script);
  }
  script.addEventListener("load", renderWidget, { once: true });
}

function validateGenerationGuard() {
  if (!window.FitnetSecurityGuards || !state.securityState) {
    return { allowed: true };
  }

  const result = window.FitnetSecurityGuards.validateGenerationRequest(state.securityState);
  collectSecurityEvents();
  return result;
}

function collectSecurityEvents() {
  if (!window.FitnetSecurityGuards || !state.securityState) {
    return;
  }

  state.securityEvents.push(...window.FitnetSecurityGuards.consumeSecurityEvents(state.securityState));
}

function securityMessage(reason) {
  const messages = {
    generation_kill_switch: "Plan generation is temporarily paused. Please try again later.",
    duplicate_generation_debounced: "Your plan is already being prepared. Give it a moment before trying again.",
    generation_rate_limited: "Too many plan attempts from this browser. Please try again later.",
    generation_daily_rate_limited: "You have reached today's plan limit. Please try again tomorrow.",
    honeypot_triggered: "We could not submit this request.",
    lead_missing_required_fields: "Please complete all required fields.",
    lead_invalid_email: "Please enter a valid email address.",
    disposable_email_blocked: "Please use a non-temporary email address.",
    captcha_failed: "Please complete the Fitnet verification prompt.",
    email_rate_limited: "Too many email submissions for this address today."
  };

  return messages[reason] || "Security check failed. Please try again.";
}

async function loadExercisesFromCsv() {
  try {
    const response = await fetch("exercises_library_structure.csv");
    const csv = await response.text();
    const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
    const headers = parseCsvLine(headerLine);
    const idIndex = headers.indexOf("exercise_id");
    const nameIndex = headers.indexOf("full_name");
    const categoryIndex = headers.indexOf("category");
    const equipmentIndex = headers.indexOf("equipment");

    return rows
      .map((row) => {
        const columns = parseCsvLine(row);
        return {
          exercise_id: columns[idIndex] || "",
          name: columns[nameIndex] || "",
          category: columns[categoryIndex] || "",
          equipment: columns[equipmentIndex] || "",
          difficulty: "Unreviewed",
          movement_pattern: ""
        };
      })
      .filter((exercise) => exercise.exercise_id && exercise.name);
  } catch {
    return [];
  }
}

function getExerciseResults() {
  const query = state.exerciseQuery.trim().toLowerCase();
  return state.exercises
    .filter((exercise) => {
      if (!query) {
        return true;
      }

      return `${exercise.name} ${exercise.category} ${exercise.equipment} ${exercise.movement_pattern || ""}`
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 6);
}

function updateExerciseResults() {
  const resultNode = document.querySelector(".exercise-results");
  if (resultNode) {
    resultNode.innerHTML = exerciseResultsHtml();
  }
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const { action, value, field, limit, withNone, id } = button.dataset;

  if (action === "language") {
    state.language = value === "en" ? "en" : "ar";
    try {
      window.localStorage.setItem("fitnet_language", state.language);
    } catch {}
    render();
    return;
  }

  if (action === "start") {
    state.securityError = "";
    setStep("goal");
  }

  if (action === "home") {
    window.location.assign(`${window.location.origin}/`);
    return;
  }

  if (action === "next" && canContinue()) {
    nextStep();
  }

  if (action === "back") {
    backStep();
  }

  if (action === "goal") {
    state.goal = value;
    resetGeneratedWorkout();
    resetGeneratedNutrition();
    renderPreservingScroll();
  }

  if (action === "profile") {
    state.profile[field] = value;
    resetGeneratedWorkout();
    resetGeneratedNutrition();
    renderPreservingScroll();
  }

  if (action === "planType") {
    state.planType = value;
    renderPreservingScroll();
  }

  if (action === "workout") {
    state.workout[field] = value;
    if (field === "days") {
      state.workout.split = "Auto";
    }
    if (field === "place" && value === "Full Equipment Gym") {
      state.workout.equipment = [];
    }
    resetGeneratedWorkout();
    renderPreservingScroll();
  }

  if (action === "workoutMulti") {
    const current = state.workout[field];
    state.workout[field] =
      withNone === "true"
        ? toggleWithNone(current, value)
        : toggleLimited(current, value, Number(limit) || null);
    resetGeneratedWorkout();
    renderPreservingScroll();
  }

  if (action === "nutrition") {
    state.nutrition[field] = value;
    resetGeneratedNutrition();
    renderPreservingScroll();
  }

  if (action === "nutritionMulti") {
    const current = state.nutrition[field];
    state.nutrition[field] = withNone === "true" ? toggleWithNone(current, value) : toggleValue(current, value);
    resetGeneratedNutrition();
    renderPreservingScroll();
  }

  if (action === "downloadPdf") {
    downloadStatelessPdf(button.dataset.kind, button);
    return;
  }

  if (action === "retryFailedPlan") {
    state.apiError = "";
    const path = getPath();
    setStep(path[Math.max(0, path.indexOf("loading") - 1)]);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.dataset.action === "profileInput") {
    state.profile[event.target.dataset.field] = event.target.value;
    resetGeneratedWorkout();
    resetGeneratedNutrition();
    updateContinueButton();
    return;
  }

  if (event.target.dataset.action === "nutritionAvoidOther") {
    state.nutrition.foodAvoidOther = event.target.value;
    resetGeneratedNutrition();
    updateContinueButton();
    return;
  }

  if (event.target.dataset.action === "nutritionRestrictionOther") {
    state.nutrition.restrictionOther = event.target.value;
    resetGeneratedNutrition();
    updateContinueButton();
    return;
  }

  if (event.target.id === "exercise-search") {
    state.exerciseQuery = event.target.value;
    updateExerciseResults();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.action === "birthDateWheel") {
    setBirthDatePart(event.target.dataset.part, event.target.value);
    resetGeneratedWorkout();
    resetGeneratedNutrition();
    renderPreservingScroll();
  }
});

Promise.all([loadExercises(), loadFoods(), loadSecurityPolicy(), loadSecurityConfig()]).then(render);
