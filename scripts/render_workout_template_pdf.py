import os
import re
import sys
from datetime import datetime
from urllib.parse import quote


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDORED_PYTHON = os.path.join(PROJECT_ROOT, "vendor", "python")
if os.path.isdir(VENDORED_PYTHON) and VENDORED_PYTHON not in sys.path:
    sys.path.insert(0, VENDORED_PYTHON)

import arabic_reshaper
from bidi.algorithm import get_display

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_W, PAGE_H = A4
MM = 72 / 25.4
INK = colors.HexColor("#111212")
GREEN = colors.HexColor("#00C875")
DEEP_GREEN = colors.HexColor("#003C2B")
MID_GREEN = colors.HexColor("#00965A")
ORANGE = colors.HexColor("#FF8736")
PALE_GREEN = colors.HexColor("#E6FAF0")
LIGHT = colors.HexColor("#F3F7F5")
LINE = colors.HexColor("#E2E9E5")
MUTED = colors.HexColor("#78817D")
WHITE = colors.white
WHATSAPP_PHONE = "9647513855361"
GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.fitnet.app.gym.fitnet_application&hl=en"
APP_STORE_URL = "https://apps.apple.com/ae/app/fitnet-your-gym-partner/id6444032576"
CURRENT_LANGUAGE = "en"
ARABIC_FONT_PATHS = [
    os.path.join(PROJECT_ROOT, "assets", "fonts", "NotoSansArabic-Regular.ttf"),
]
ARABIC_TEXT = {
    "Personal training plan": "خطة تدريب شخصية",
    "Your Fitnet\nplan is ready.": "خطة فيتنت الخاصة بك\nجاهزة.",
    "Profile & plan summary": "ملخص الملف والخطة",
    "Built around you.": "مصممة خصيصاً لك.",
    "Every set, rep and rest period on the following pages is calibrated to the profile and preferences below.": "تم ضبط كل مجموعة وتكرار وفترة راحة في الصفحات التالية وفق ملفك وتفضيلاتك.",
    "Goal": "الهدف", "Plan type": "نوع الخطة", "Gender": "الجنس", "Birth date": "تاريخ الميلاد",
    "Height": "الطول", "Weight": "الوزن", "Experience": "المستوى", "Split": "التقسيم",
    "Days per week": "أيام التمرين أسبوعياً", "Session duration": "مدة الحصة", "Workout place": "مكان التمرين",
    "Focus muscles": "العضلات المستهدفة", "AVAILABLE EQUIPMENT": "المعدات المتاحة",
    "Why this plan fits you": "لماذا تناسبك هذه الخطة", "Inside the app": "داخل التطبيق",
    "Make this plan visual.": "حوّل خطتك إلى تجربة مرئية.",
    "Turn this table into a workout you can actually follow - guided cards, sets, reps, rest timers, and a cleaner session flow.": "حوّل هذا الجدول إلى تمرين سهل المتابعة عبر بطاقات إرشادية ومجموعات وتكرارات ومؤقتات للراحة.",
    "Request a visual Fitnet plan and your exercises become guided cards with sets, reps, rest, timers, and progress tracking - all inside the app you already use to track calories, steps and training minutes.": "اطلب خطة فيتنت المرئية لتتحول تمارينك إلى بطاقات إرشادية تشمل المجموعات والتكرارات والراحة والمؤقتات وتتبع التقدم داخل التطبيق.",
    "Request your visual plan": "اطلب خطتك المرئية",
    "Turn today's table into guided cards in seconds": "حوّل جدول اليوم إلى بطاقات إرشادية خلال ثوانٍ",
    "Request Now": "اطلب الآن",
    "EXERCISE": "التمرين", "SETS": "المجموعات", "REPS": "التكرارات", "REST": "الراحة", "NOTES": "ملاحظات",
    "Progression & recovery": "التدرج والاستشفاء", "Know when to push.": "اعرف متى تزيد التحدي.",
    "A simple, repeatable rhythm for the next four weeks.": "نظام بسيط يمكنك تكراره خلال الأسابيع الأربعة القادمة.",
    "Starting load": "الوزن المبدئي", "Increase repetitions": "زيادة التكرارات", "Increase load": "زيادة الوزن",
    "If a set is too hard": "إذا كانت المجموعة صعبة", "If pain occurs": "عند الشعور بالألم",
    "FOUR-WEEK INSTRUCTION": "تعليمات الأسابيع الأربعة", "Recovery": "الاستشفاء",
    "Rest is part of the plan.": "الراحة جزء من الخطة.", "Safety guidance": "إرشادات السلامة",
    "Train smart.": "تمرّن بذكاء.", "During training": "أثناء التمرين", "Alternatives": "البدائل",
    "Range of motion": "مدى الحركة", "Professional support": "الدعم المتخصص",
    "Safety disclaimer: This plan provides general fitness guidance and is not medical advice. Stop any exercise that causes pain and consult a qualified professional if you have medical concerns.": "تنبيه السلامة: تقدم هذه الخطة إرشادات عامة للياقة وليست نصيحة طبية. أوقف أي تمرين يسبب ألماً واستشر مختصاً مؤهلاً إذا كانت لديك مخاوف صحية.",
    "Download Fitnet for": "حمّل فيتنت من أجل", "more.": "المزيد.",
    "Track your plan, log every session, and keep improving -": "تابع خطتك وسجّل كل حصة واستمر في التطور -",
    "right from your phone.": "مباشرة من هاتفك.",
    "Lose Weight": "خسارة الوزن", "Build Muscle": "بناء العضلات", "Gain Strength": "زيادة القوة",
    "Improve Fitness": "تحسين اللياقة", "Improve Body Shape": "تحسين شكل الجسم",
    "Workout Only": "تمارين فقط", "Nutrition Only": "تغذية فقط", "Workout + Nutrition": "تمارين وتغذية",
    "Male": "ذكر", "Female": "أنثى", "Beginner": "مبتدئ", "Intermediate": "متوسط", "Advanced": "متقدم",
    "Home": "المنزل", "Building Gym": "نادي المبنى", "Full Equipment Gym": "نادي متكامل التجهيزات",
    "Personal nutrition plan": "خطة تغذية شخصية", "Profile & nutrition summary": "ملخص الملف والتغذية",
    "Your calorie target, meal structure, and nutrition balance are summarized below.": "فيما يلي ملخص هدف السعرات ونظام الوجبات والتوازن الغذائي.",
    "Approximate daily calories": "السعرات اليومية التقريبية", "Meals per day": "الوجبات يومياً", "Daily fiber": "الألياف اليومية",
    "DAILY NUTRITION TARGETS": "الأهداف الغذائية اليومية", "Protein": "البروتين", "Carbs": "الكربوهيدرات", "Fat": "الدهون", "Fiber": "الألياف",
    "Join the movement": "انضم إلى مجتمعنا", "Build a healthier lifestyle.": "ابنِ أسلوب حياة أكثر صحة.",
    "Join Fitnet's growing community and turn healthy intentions into habits through movement, support, and consistent progress.": "انضم إلى مجتمع فيتنت المتنامي وحوّل نواياك الصحية إلى عادات مستمرة من خلال الحركة والدعم والتقدم المنتظم.",
    "Train, track your activity, and stay connected to a community built around sustainable progress. Fitnet helps make movement part of everyday life.": "تمرّن وتابع نشاطك وابقَ على تواصل مع مجتمع يدعم التقدم المستدام. يساعدك فيتنت على جعل الحركة جزءاً من حياتك اليومية.",
    "Join the Fitnet movement": "انضم إلى مجتمع فيتنت", "Build healthy habits with a growing community": "ابنِ عادات صحية مع مجتمع متنامٍ",
    "Join the movement ->": "انضم الآن <-", "Breakfast": "الإفطار", "Lunch": "الغداء", "Dinner": "العشاء", "Snack": "وجبة خفيفة",
    "users": "مستخدم", "coaches": "مدرب", "nutritionists": "مختص تغذية",
    "INGREDIENTS": "المكونات", "PREPARATION": "طريقة التحضير", "Weekly grocery list": "قائمة التسوق الأسبوعية",
    "Shop with a plan.": "تسوّق وفق خطة.", "Grocery list continued": "تكملة قائمة التسوق",
    "Consistency & safety": "الاستمرارية والسلامة", "Keep it practical.": "حافظ على بساطة التطبيق.",
    "REPEAT INSTRUCTION": "تعليمات التكرار", "Safety notes": "ملاحظات السلامة",
    "Keep your plan close, track progress, and build consistency -": "احتفظ بخطتك وتابع تقدمك وابنِ الاستمرارية -",
}


def set_language(language):
    global CURRENT_LANGUAGE
    CURRENT_LANGUAGE = "ar" if str(language or "").lower().startswith("ar") else "en"


def tr(text):
    return ARABIC_TEXT.get(str(text), str(text)) if CURRENT_LANGUAGE == "ar" else str(text)


def has_arabic(text):
    return any("\u0600" <= char <= "\u06ff" for char in str(text or ""))


def arabic_font(preferred="Pilcrow"):
    return "FitnetArabic-Bold" if "Bold" in str(preferred) or "Semibold" in str(preferred) else "FitnetArabic"


def is_arabic():
    return CURRENT_LANGUAGE == "ar"


def visual_plan_whatsapp_url():
    message = ("مرحباً، أود تحويل خطتي لخطة مرئية داخل تطبيق فيتنت."
               if is_arabic()
               else "Hello, I’d like to convert my plan into a visual plan in the Fitnet app.")
    return f"https://wa.me/{WHATSAPP_PHONE}?text={quote(message)}"


def rtl_text(text):
    text = str(text)
    if not has_arabic(text):
        return text
    text = text.translate(str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩"))
    # ReportLab needs a HarfBuzz runtime for its native `shaping=True` path.
    # Our PDF runtime does not provide it, so shape Arabic into contextual
    # presentation forms and apply the Unicode bidirectional algorithm here.
    return get_display(arabic_reshaper.reshape(text), base_dir="R")


def register_fonts(root):
    font_dir = os.path.join(root, "assets", "fonts")
    files = {
        "Pilcrow": "PilcrowRounded-Regular.ttf",
        "Pilcrow-Medium": "PilcrowRounded-Medium.ttf",
        "Pilcrow-Semibold": "PilcrowRounded-Semibold.ttf",
        "Pilcrow-Bold": "PilcrowRounded-Bold.ttf",
    }
    try:
        for name, filename in files.items():
            pdfmetrics.registerFont(TTFont(name, os.path.join(font_dir, filename)))
    except Exception:
        for name, base in {
            "Pilcrow": "Helvetica",
            "Pilcrow-Medium": "Helvetica",
            "Pilcrow-Semibold": "Helvetica-Bold",
            "Pilcrow-Bold": "Helvetica-Bold",
        }.items():
            pdfmetrics.registerFont(pdfmetrics.Font(name, base, "WinAnsiEncoding"))
    if CURRENT_LANGUAGE == "ar":
        arabic_path = next((item for item in ARABIC_FONT_PATHS if os.path.exists(item)), None)
        if not arabic_path:
            raise RuntimeError("Arabic PDF font is missing. Add assets/fonts/NotoSansArabic-Regular.ttf.")
        pdfmetrics.registerFont(TTFont("FitnetArabic", arabic_path, subfontIndex=0, shapable=True))
        bold_path = os.path.join(root, "assets", "fonts", "NotoSansArabic-Bold.ttf")
        if not os.path.exists(bold_path):
            raise RuntimeError("Arabic PDF bold font is missing. Add assets/fonts/NotoSansArabic-Bold.ttf.")
        pdfmetrics.registerFont(TTFont("FitnetArabic-Bold", bold_path, subfontIndex=0, shapable=True))


def color(value):
    return value if hasattr(value, "red") else colors.HexColor(value)


def rounded_box(c, x, y, w, h, radius=7, fill=LIGHT, stroke=None, width=0.6):
    c.setFillColor(color(fill))
    if stroke:
        c.setStrokeColor(color(stroke))
        c.setLineWidth(width)
        c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    else:
        c.roundRect(x, y, w, h, radius, fill=1, stroke=0)


def split_lines(text, font, size, max_width):
    text = str(text or "-").replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-")
    output = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            output.append("")
            continue
        line = words[0]
        for word in words[1:]:
            trial = f"{line} {word}"
            if pdfmetrics.stringWidth(trial, font, size) <= max_width:
                line = trial
            else:
                output.append(line)
                line = word
        output.append(line)
    return output


def draw_text(c, text, x, y, max_width, font="Pilcrow", size=10, leading=None, fill=INK, max_lines=None):
    text = tr(text)
    if has_arabic(text):
        font = arabic_font(font)
    leading = leading or size * 1.28
    lines = split_lines(text, font, size, max_width)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and pdfmetrics.stringWidth(f"{last}...", font, size) > max_width:
            last = last[:-1]
        lines[-1] = f"{last.rstrip()}..."
    c.setFont(font, size)
    c.setFillColor(color(fill))
    cursor = y
    for line in lines:
        if has_arabic(line):
            c.drawRightString(x + max_width, cursor, rtl_text(line))
        else:
            c.drawString(x, cursor, line)
        cursor -= leading
    return cursor


def center_text(c, text, x, y, w, font="Pilcrow", size=10, fill=INK):
    text = tr(text)
    if has_arabic(text):
        font = arabic_font(font)
    c.setFont(font, size)
    c.setFillColor(color(fill))
    c.drawCentredString(x + w / 2, y, rtl_text(text))


def label_pill(c, text, x, y, w=None, fill=PALE_GREEN, text_color=MID_GREEN):
    text = tr(text)
    font, size = ("FitnetArabic-Bold" if has_arabic(text) else "Pilcrow-Bold"), 7.2
    w = w or pdfmetrics.stringWidth(text.upper(), font, size) + 20
    rounded_box(c, x, y, w, 17, 8.5, fill)
    c.setFont(font, size)
    c.setFillColor(text_color)
    c.drawCentredString(x + w / 2, y + 5.3, rtl_text(text.upper()))
    return w


def draw_logo(c, root, x, y, w, on_dark=True):
    logo = os.path.join(root, "assets", "fitnet-white.png" if on_dark else "fitnet-colorful.png")
    c.drawImage(logo, x, y, width=w, height=w * 0.705, preserveAspectRatio=True, mask="auto", anchor="c")


def footer(c, root=None, text="Fitnet - Your Gym Partner", dark=False):
    if root and not dark:
        badge_w, badge_h, gap = 22 * MM, 6.4 * MM, 3 * MM
        start_x = (PAGE_W - badge_w * 2 - gap) / 2
        y = 9 * MM
        google = os.path.join(root, "assets", "pdf-template", "google-play.png")
        apple = os.path.join(root, "assets", "pdf-template", "app-store.png")
        c.drawImage(google, start_x, y, badge_w, badge_h, preserveAspectRatio=True, mask="auto")
        c.linkURL(GOOGLE_PLAY_URL, (start_x, y, start_x + badge_w, y + badge_h), relative=0, thickness=0)
        apple_x = start_x + badge_w + gap
        c.drawImage(apple, apple_x, y, badge_w, badge_h, preserveAspectRatio=True, mask="auto")
        c.linkURL(APP_STORE_URL, (apple_x, y, apple_x + badge_w, y + badge_h), relative=0, thickness=0)
        return
    c.setFont("Pilcrow", 6.5)
    c.setFillColor(colors.Color(1, 1, 1, alpha=0.48) if dark else colors.HexColor("#B4BDB8"))
    c.drawCentredString(PAGE_W / 2, 13 * MM, text)


def begin_light_page(c):
    c.setFillColor(WHITE)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def clean_equipment(value):
    aliases = {
        "Upright stationary bike": "Upright bike",
        "Recumbent bike": "Recumbent bike",
        "Elliptical / cross-trainer": "Elliptical",
        "Rowing ergometer": "Rowing ergometer",
        "Stepmill / stair climber": "Stepmill",
    }
    return [aliases.get(str(item), str(item)) for item in (value or [])]


def draw_cover(c, payload, root):
    profile = payload.get("profile", {})
    plan = payload.get("workout_plan", {})
    summary = plan.get("program_summary", {})
    c.setFillColor(DEEP_GREEN)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.saveState()
    c.setFillColor(colors.Color(1, 0.55, 0.2, alpha=0.34))
    c.circle(PAGE_W + 12 * MM, PAGE_H - 22 * MM, 72 * MM, fill=1, stroke=0)
    c.setFillColor(colors.Color(0, 0.78, 0.46, alpha=0.35))
    c.circle(-8 * MM, -10 * MM, 68 * MM, fill=1, stroke=0)
    c.setFillColor(colors.Color(1, 1, 1, alpha=0.07))
    c.roundRect(-20 * MM, PAGE_H - 48 * MM, 78 * MM, 13 * MM, 6 * MM, fill=1, stroke=0)
    c.restoreState()
    right_edge = PAGE_W - 14 * MM
    logo_x = right_edge - 18 * MM if is_arabic() else 13 * MM
    pill_x = right_edge - 55 * MM if is_arabic() else 30 * MM
    title_x = right_edge - 168 * MM if is_arabic() else 14 * MM
    title_width = 168 * MM if is_arabic() else 150 * MM
    draw_logo(c, root, logo_x, PAGE_H - 31 * MM, 18 * MM)
    label_pill(c, "Personal training plan", pill_x, PAGE_H - 72 * MM, 55 * MM, colors.Color(1, 1, 1, alpha=0.14), WHITE)
    draw_text(c, "Your Fitnet\nplan is ready.", title_x, PAGE_H - 98 * MM, title_width, "Pilcrow-Bold", 34, 36, WHITE)
    days = summary.get("days_per_week", len(plan.get("plan_days", [])))
    place = str(summary.get("workout_place", "your available equipment")).lower().replace("full equipment gym", "full-equipment")
    subtitle = (f"برنامج تمارين لمدة {days} أيام أسبوعياً، مصمم وفق هدفك وجدولك والمعدات المتاحة لك."
                if CURRENT_LANGUAGE == "ar"
                else f"A {days}-day, {place} programme built around your goal, your schedule, and the gear you actually have access to.")
    subtitle_width = 156 * MM if is_arabic() else 142 * MM
    subtitle_x = right_edge - subtitle_width if is_arabic() else 14 * MM
    draw_text(c, subtitle, subtitle_x, PAGE_H - 141 * MM, subtitle_width, "Pilcrow", 12.5, 18, colors.HexColor("#D8EEE4"), 4)
    goal_value = tr(summary.get('goal', profile.get('goal', '-')))
    chips = ([f"الهدف: {goal_value}", tr(payload.get("plan_type", "Workout Only")), f"{days} أيام / أسبوع"]
             if CURRENT_LANGUAGE == "ar"
             else [f"Goal: {goal_value}", payload.get("plan_type", "Workout Only"), f"{days} Days / Week"])
    if is_arabic():
        x = right_edge
        for index, chip in enumerate(chips):
            w = [45, 37, 38][index] * MM
            x -= w
            rounded_box(c, x, PAGE_H - 178 * MM, w, 11 * MM, 5.5 * MM, ORANGE if index == 2 else WHITE)
            center_text(c, chip, x, PAGE_H - 174.2 * MM, w, "Pilcrow-Bold", 8, WHITE if index == 2 else DEEP_GREEN)
            x -= 4 * MM
    else:
        x = 14 * MM
        for index, chip in enumerate(chips):
            w = [45, 37, 38][index] * MM
            rounded_box(c, x, PAGE_H - 178 * MM, w, 11 * MM, 5.5 * MM, ORANGE if index == 2 else WHITE)
            center_text(c, chip, x, PAGE_H - 174.2 * MM, w, "Pilcrow-Bold", 8, WHITE if index == 2 else DEEP_GREEN)
            x += w + 4 * MM
    experience = profile.get("experience", "Fitnet")
    c.setFont("Pilcrow", 7.5)
    c.setFillColor(colors.HexColor("#CDE8DB"))
    c.drawString(14 * MM, 19 * MM, "Prepared for an ")
    c.setFont("Pilcrow-Bold", 7.5)
    c.drawString(39 * MM, 19 * MM, f"{experience} lifter")
    c.setFont("Pilcrow", 7.5)
    c.drawRightString(PAGE_W - 14 * MM, 19 * MM, f"Generated {datetime.utcnow().strftime('%Y-%m-%d')}")
    c.showPage()


def summary_card(c, label, value, x, y, w, h=18 * MM):
    rounded_box(c, x, y, w, h, 4 * MM, LIGHT, LINE, 0.4)
    c.setFont("Pilcrow-Bold", 6.2)
    c.setFillColor(MUTED)
    label_text = tr(label).upper()
    if has_arabic(label_text):
        c.setFont("FitnetArabic-Bold", 6.2)
        c.drawRightString(x + w - 4 * MM, y + h - 6 * MM, rtl_text(label_text))
    else:
        c.drawString(x + 4 * MM, y + h - 6 * MM, label_text)
    draw_text(c, value or "-", x + 4 * MM, y + h - 11.7 * MM, w - 8 * MM, "Pilcrow-Bold", 9.2, 10.5, INK, 2)


def draw_summary(c, payload, root):
    begin_light_page(c)
    profile = payload.get("profile", {})
    plan = payload.get("workout_plan", {})
    summary = plan.get("program_summary", {})
    label_pill(c, "Profile & plan summary", 20 * MM, PAGE_H - 28 * MM, 57 * MM)
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, "Built around you.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 23, fill=GREEN)
    else:
        c.setFont("Pilcrow-Bold", 23)
        c.setFillColor(INK)
        c.drawString(20 * MM, PAGE_H - 46 * MM, "Built around ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Built around ", "Pilcrow-Bold", 23)
        c.setFillColor(GREEN)
        c.drawString(x2, PAGE_H - 46 * MM, "you.")
    draw_text(c, "Every set, rep and rest period on the following pages is calibrated to the profile and preferences below.", 20 * MM, PAGE_H - 57 * MM, 157 * MM, "Pilcrow", 9.4, 12, MUTED, 2)
    cards = [
        ("Goal", summary.get("goal", profile.get("goal"))), ("Plan type", payload.get("plan_type")), ("Gender", profile.get("gender")),
        ("Birth date", profile.get("birth_date")), ("Height", f"{profile.get('height_cm', '-')} cm"), ("Weight", f"{profile.get('weight_kg', '-')} kg"),
        ("Experience", profile.get("experience")), ("Split", summary.get("split")), ("Days per week", summary.get("days_per_week")),
        ("Session duration", f"{summary.get('session_duration_minutes', '-')} min"), ("Workout place", summary.get("workout_place")), ("Focus muscles", ", ".join(summary.get("focus_muscles") or ["Full Body"])),
    ]
    gap, card_w, card_h = 4 * MM, 51 * MM, 18 * MM
    top = PAGE_H - 88 * MM
    for i, (label, value) in enumerate(cards):
        col, row = i % 3, i // 3
        summary_card(c, label, value, 20 * MM + col * (card_w + gap), top - row * (card_h + gap), card_w, card_h)
    equipment_y = top - 3 * (card_h + gap) - 42 * MM - 5 * MM
    rounded_box(c, 20 * MM, equipment_y, 161 * MM, 42 * MM, 5 * MM, PALE_GREEN)
    c.setFont("Pilcrow-Bold", 7)
    c.setFillColor(MID_GREEN)
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, "AVAILABLE EQUIPMENT", 25 * MM, equipment_y + 33 * MM, 151 * MM, "Pilcrow-Bold", 7, fill=MID_GREEN, max_lines=1)
    else:
        c.drawString(25 * MM, equipment_y + 33 * MM, "AVAILABLE EQUIPMENT")
    equipment = clean_equipment(summary.get("available_equipment"))
    x, y = 25 * MM, equipment_y + 22 * MM
    for item in equipment:
        w = min(35 * MM, pdfmetrics.stringWidth(item, "Pilcrow-Medium", 6.8) + 8 * MM)
        if x + w > 176 * MM:
            x, y = 25 * MM, y - 10 * MM
        rounded_box(c, x, y, w, 7 * MM, 3.5 * MM, WHITE, colors.HexColor("#BDEDD8"), 0.5)
        center_text(c, item, x, y + 2.2 * MM, w, "Pilcrow-Medium", 6.8, MID_GREEN)
        x += w + 2 * MM
    rationale_y = equipment_y - 56 * MM
    rounded_box(c, 20 * MM, rationale_y, 161 * MM, 48 * MM, 5 * MM, colors.HexColor("#CAD8D2"))
    label_pill(c, "Why this plan fits you", 27 * MM, rationale_y + 35 * MM, 52 * MM, ORANGE, WHITE)
    draw_text(c, summary.get("coaching_rationale", "This plan matches your goal, schedule, and available equipment."), 27 * MM, rationale_y + 27 * MM, 147 * MM, "Pilcrow", 8.6, 11, WHITE, 6)
    footer(c, root)
    c.showPage()


def phone_image(root, filename):
    return ImageReader(os.path.join(root, "assets", "pdf-template", filename))


def draw_phone_mockup(c, root, filename, x, y, w, h):
    rounded_box(c, x, y, w, h, 6 * MM, colors.HexColor("#151716"))
    c.drawImage(phone_image(root, filename), x + 2.2 * MM, y + 3.8 * MM, w - 4.4 * MM, h - 7.6 * MM, preserveAspectRatio=True, mask="auto", anchor="c")
    rounded_box(c, x + w * 0.34, y + h - 4.8 * MM, w * 0.32, 2.2 * MM, 1.1 * MM, colors.HexColor("#050505"))
    c.setStrokeColor(colors.HexColor("#333735"))
    c.setLineWidth(0.7)
    c.roundRect(x, y, w, h, 6 * MM, fill=0, stroke=1)


def draw_linked_store_badge(c, root, filename, url, x, y, w, h):
    c.drawImage(os.path.join(root, "assets", "pdf-template", filename), x, y, w, h, preserveAspectRatio=True, mask="auto")
    c.linkURL(url, (x, y, x + w, y + h), relative=0, thickness=0)


def draw_app_promo(c, root):
    begin_light_page(c)
    label_pill(c, "Inside the app", 20 * MM, PAGE_H - 28 * MM, 43 * MM)
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, "Make this plan visual.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 23, fill=GREEN)
    else:
        c.setFont("Pilcrow-Bold", 23)
        c.setFillColor(INK)
        c.drawString(20 * MM, PAGE_H - 46 * MM, "Make this plan ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Make this plan ", "Pilcrow-Bold", 23)
        c.setFillColor(GREEN)
        c.drawString(x2, PAGE_H - 46 * MM, "visual.")
    draw_text(c, "Turn this table into a workout you can actually follow - guided cards, sets, reps, rest timers, and a cleaner session flow.", 20 * MM, PAGE_H - 57 * MM, 162 * MM, "Pilcrow", 9.2, 12, MUTED, 2)
    draw_phone_mockup(c, root, "home-page.png", 20 * MM, 128 * MM, 49 * MM, 105 * MM)
    draw_phone_mockup(c, root, "start-page.png", 142 * MM, 128 * MM, 49 * MM, 105 * MM)
    draw_text(c, "Request a visual Fitnet plan and your exercises become guided cards with sets, reps, rest, timers, and progress tracking - all inside the app you already use to track calories, steps and training minutes.", 77 * MM, 213 * MM, 57 * MM, "Pilcrow", 9.2, 12, INK, 9)
    metrics = [("+1,500", "users"), ("+50", "coaches"), ("Visual", "plans")]
    x = 76 * MM
    for value, label in metrics:
        rounded_box(c, x, 143 * MM, 18 * MM, 17 * MM, 8.5 * MM, LIGHT, LINE, 0.5)
        center_text(c, value, x, 152.5 * MM, 18 * MM, "Pilcrow-Bold", 8.2, GREEN)
        center_text(c, label, x, 147 * MM, 18 * MM, "Pilcrow-Semibold", 6.2, INK)
        x += 20 * MM
    rounded_box(c, 20 * MM, 101 * MM, 161 * MM, 22 * MM, 5 * MM, INK)
    c.setFont("Pilcrow-Bold", 10)
    c.setFillColor(WHITE)
    draw_text(c, "Request your visual plan", 27 * MM, 113 * MM, 101 * MM, "Pilcrow-Bold", 10, fill=WHITE, max_lines=1)
    c.setFont("Pilcrow", 7.5)
    c.setFillColor(colors.HexColor("#B8C1BD"))
    draw_text(c, "Turn today's table into guided cards in seconds", 27 * MM, 107 * MM, 101 * MM, "Pilcrow", 7.5, fill=colors.HexColor("#B8C1BD"), max_lines=1)
    button_x, button_y, button_w, button_h = 135 * MM, 106 * MM, 41 * MM, 11 * MM
    rounded_box(c, button_x, button_y, button_w, button_h, 5.5 * MM, GREEN)
    center_text(c, "Request Now", button_x, button_y + 3.7 * MM, button_w, "Pilcrow-Bold", 7.4, DEEP_GREEN)
    c.linkURL(visual_plan_whatsapp_url(), (button_x, button_y, button_x + button_w, button_y + button_h), relative=0, thickness=0)
    draw_linked_store_badge(c, root, "google-play.png", GOOGLE_PLAY_URL, 20 * MM, 87 * MM, 32 * MM, 9.3 * MM)
    draw_linked_store_badge(c, root, "app-store.png", APP_STORE_URL, 56 * MM, 87 * MM, 32 * MM, 9.3 * MM)
    footer(c, root)
    c.showPage()


def day_focus(day_name):
    name = str(day_name or "Workout")
    if CURRENT_LANGUAGE == "ar":
        if "Upper" in name: return "دفع - سحب - أكتاف - ذراعان - كارديو ختامي"
        if "Lower" in name: return "قرفصاء - مفصل الورك - اندفاع - وسط الجسم"
        if "Full Body" in name: return "دفع - سحب - أرجل - وسط الجسم - حصة متكاملة"
        if "Push" in name: return "صدر - أكتاف - عضلة ثلاثية"
        if "Pull" in name: return "ظهر - كتف خلفي - عضلة ثنائية"
        if "Legs" in name: return "قرفصاء - مفصل الورك - أرجل - وسط الجسم"
        return "القوة - جودة الحركة - تقدم ثابت"
    if "Upper" in name: return "Push - Pull - Shoulders - Arms - Cardio finish"
    if "Lower" in name: return "Squat - Hinge - Lunge - Core"
    if "Full Body" in name: return "Push - Pull - Legs - Core - all in one session"
    if "Push" in name: return "Chest - Shoulders - Triceps"
    if "Pull" in name: return "Back - Rear delts - Biceps"
    if "Legs" in name: return "Squat - Hinge - Legs - Core"
    return "Strength - movement quality - steady progress"


def day_tip(day, plan):
    name = str(day.get("day_name", ""))
    duration = plan.get("program_summary", {}).get("session_duration_minutes", 60)
    if CURRENT_LANGUAGE == "ar":
        if "Upper" in name: return f"حافظ على جودة تمارين الدفع والسحب والأكتاف ضمن فترات الراحة المحددة لتُنهي الحصة خلال {duration} دقيقة."
        if "Lower" in name or "Legs" in name: return "إذا شعرت بإجهاد كبير في الساقين هذا الأسبوع، أبعد هذه الحصة عن أصعب أو أكثر أيامك انشغالاً."
        if "Full Body" in name: return "تجمع هذه الحصة عناصر الأسبوع معاً؛ حافظ على وتيرة مناسبة منذ البداية حتى لا تتأثر الحركات الأخيرة."
        if "Push" in name: return "نفّذ حركات الدفع بتحكم واحتفظ بطاقة كافية لتمارين الأكتاف والعضلة الثلاثية في النهاية."
        if "Pull" in name: return "ابدأ كل حركة سحب من الظهر وقلّل الزخم وأنهِ تمارين الذراعين دون استعجال."
        return "استخدم تكرارات نظيفة والتزم بفترات الراحة المحددة لتحافظ على جودة الحصة ووقتها."
    if "Upper" in name: return f"Keep push, pull and shoulder work crisp within the listed rest windows so the full session fits inside {duration} minutes."
    if "Lower" in name or "Legs" in name: return "If your legs feel especially tired this week, keep this session away from your hardest or busiest day."
    if "Full Body" in name: return "This session ties the week together - pace yourself early so the final movements do not suffer."
    if "Push" in name: return "Keep the pressing movements controlled and save enough energy for the final shoulder and triceps work."
    if "Pull" in name: return "Lead each pull with the back, keep momentum low, and finish the arm work without rushing."
    return "Use clean repetitions and the listed rest periods to keep the session productive and on schedule."


def draw_day_conversion_banner(c):
    x, y, w, h = 20 * MM, 20 * MM, 161 * MM, 17 * MM
    rounded_box(c, x, y, w, h, 5 * MM, INK)
    c.setFont("Pilcrow-Bold", 8.4)
    c.setFillColor(WHITE)
    draw_text(c, "Request your visual plan", x + 7 * MM, y + 10.2 * MM, 100 * MM, "Pilcrow-Bold", 8.4, fill=WHITE, max_lines=1)
    c.setFont("Pilcrow", 6.4)
    c.setFillColor(colors.HexColor("#B8C1BD"))
    draw_text(c, "Turn today's table into guided cards in seconds", x + 7 * MM, y + 4.6 * MM, 100 * MM, "Pilcrow", 6.4, fill=colors.HexColor("#B8C1BD"), max_lines=1)
    button_x, button_y, button_w, button_h = x + w - 48 * MM, y + 3 * MM, 42 * MM, 11 * MM
    rounded_box(c, button_x, button_y, button_w, button_h, 5.5 * MM, GREEN)
    center_text(c, "Request Now", button_x, button_y + 3.7 * MM, button_w, "Pilcrow-Bold", 7.2, DEEP_GREEN)
    c.linkURL(visual_plan_whatsapp_url(), (button_x, button_y, button_x + button_w, button_y + button_h), relative=0, thickness=0)


def draw_day(c, day, plan, exercise_lookup, root):
    begin_light_page(c)
    index = day.get("day_index", 1)
    rounded_box(c, 20 * MM, PAGE_H - 48 * MM, 12 * MM, 12 * MM, 6 * MM, ORANGE)
    center_text(c, index, 20 * MM, PAGE_H - 44.2 * MM, 12 * MM, "Pilcrow-Bold", 10, WHITE)
    c.setFont("Pilcrow-Bold", 19)
    c.setFillColor(INK)
    day_name = str(day.get("day_name", "Workout"))
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, f"اليوم {index}: {day_name}", 36 * MM, PAGE_H - 43 * MM, 145 * MM, "Pilcrow-Bold", 19, fill=INK, max_lines=1)
    else:
        c.drawString(36 * MM, PAGE_H - 43 * MM, day_name)
    draw_text(c, day_focus(day.get("day_name")), 36 * MM, PAGE_H - 51 * MM, 140 * MM, "Pilcrow", 8.5, 10, MUTED, 1)
    x0, top, width = 20 * MM, PAGE_H - 64 * MM, 161 * MM
    col = [10, 71, 17, 22, 21, 20]
    scale = width / sum(col)
    col = [v * scale for v in col]
    headers = ["#", "EXERCISE", "SETS", "REPS", "REST", "NOTES"]
    c.setFillColor(INK)
    c.roundRect(x0, top - 9 * MM, width, 9 * MM, 2.5 * MM, fill=1, stroke=0)
    x = x0
    for i, header in enumerate(headers):
        c.setFont("Pilcrow-Bold", 6.8)
        c.setFillColor(WHITE)
        header_text = tr(header)
        if has_arabic(header_text):
            c.setFont("FitnetArabic-Bold", 6.8)
            c.drawString(x + 3 * MM, top - 5.7 * MM, rtl_text(header_text))
        else:
            c.drawString(x + 3 * MM, top - 5.7 * MM, header_text)
        x += col[i]
    y = top - 9 * MM
    exercises = day.get("exercises", [])
    row_h = min(15 * MM, 116 * MM / max(1, len(exercises)))
    for row_index, item in enumerate(exercises):
        y -= row_h
        if row_index % 2:
            c.setFillColor(LIGHT)
            c.rect(x0, y, width, row_h, fill=1, stroke=0)
        source = exercise_lookup.get(int(item.get("exercise_id", 0)), {})
        values = [
            str(row_index + 1),
            item.get("exercise_name") or source.get("display_name") or source.get("name") or "Exercise",
            str(item.get("sets", "")), str(item.get("reps", "")), str(item.get("rest", "")), item.get("notes") or "-",
        ]
        x = x0
        for i, value in enumerate(values):
            font = "Pilcrow-Bold" if i in (0, 1) else "Pilcrow"
            fill = ORANGE if i == 0 else INK if i == 1 else MUTED
            size = 7.5 if i == 1 else 7
            draw_text(c, value, x + 3 * MM, y + row_h - 5 * MM, col[i] - 5 * MM, font, size, 8.2, fill, 2)
            x += col[i]
        c.setStrokeColor(LINE)
        c.setLineWidth(0.35)
        c.line(x0, y, x0 + width, y)
    tip_y = max(42 * MM, y - 20 * MM)
    rounded_box(c, 20 * MM, tip_y, 161 * MM, 16 * MM, 4 * MM, PALE_GREEN)
    c.setFillColor(GREEN)
    c.circle(27 * MM, tip_y + 8 * MM, 3.2 * MM, fill=1, stroke=0)
    c.setFont("Pilcrow-Bold", 8)
    c.setFillColor(WHITE)
    c.drawCentredString(27 * MM, tip_y + 5.5 * MM, "i")
    draw_text(c, day_tip(day, plan), 34 * MM, tip_y + 10.5 * MM, 140 * MM, "Pilcrow-Medium", 7.5, 9, MID_GREEN, 2)
    draw_day_conversion_banner(c)
    footer(c, root)
    c.showPage()


def guidance_card(c, number, title, body, x, y, w, h, warning=False, body_max_lines=3):
    rounded_box(c, x, y, w, h, 4 * MM, LIGHT, LINE, 0.4)
    c.setFillColor(ORANGE if warning else GREEN)
    c.circle(x + 7 * MM, y + h - 8 * MM, 3.5 * MM, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Pilcrow-Bold", 7)
    c.drawCentredString(x + 7 * MM, y + h - 10.2 * MM, str(number))
    c.setFont("Pilcrow-Bold", 8.8)
    c.setFillColor(INK)
    title_text = tr(title)
    if has_arabic(title_text):
        c.setFont("FitnetArabic-Bold", 8.8)
        c.drawRightString(x + w - 6 * MM, y + h - 7 * MM, rtl_text(title_text))
    else:
        c.drawString(x + 14 * MM, y + h - 7 * MM, title_text)
    draw_text(c, body, x + 14 * MM, y + h - 13 * MM, w - 20 * MM, "Pilcrow", 7.5, 9, MUTED, body_max_lines)


def draw_progression(c, plan, root):
    begin_light_page(c)
    label_pill(c, "Progression & recovery", 20 * MM, PAGE_H - 28 * MM, 58 * MM)
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, "Know when to push.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 23, fill=GREEN)
    else:
        c.setFont("Pilcrow-Bold", 23)
        c.setFillColor(INK)
        c.drawString(20 * MM, PAGE_H - 46 * MM, "Know when to ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Know when to ", "Pilcrow-Bold", 23)
        c.setFillColor(GREEN)
        c.drawString(x2, PAGE_H - 46 * MM, "push.")
    draw_text(c, "A simple, repeatable rhythm for the next four weeks.", 20 * MM, PAGE_H - 57 * MM, 160 * MM, "Pilcrow", 9.5, 12, MUTED, 1)
    progression = plan.get("progression_guidance", {})
    cards = [
        (1, "Starting load", progression.get("starting_load"), False),
        (2, "Increase repetitions", progression.get("increase_reps"), False),
        (3, "Increase load", progression.get("increase_load"), False),
        ("!", "If a set is too hard", progression.get("if_too_hard"), True),
        ("!", "If pain occurs", progression.get("if_pain_occurs"), True),
    ]
    y = PAGE_H - 86 * MM
    for number, title, body, warning in cards:
        guidance_card(c, number, title, body or "-", 20 * MM, y, 161 * MM, 24 * MM, warning)
        y -= 28 * MM
    rounded_box(c, 20 * MM, y - 5 * MM, 161 * MM, 32 * MM, 4 * MM, LIGHT, LINE, 0.4)
    c.setFont("Pilcrow-Bold", 7)
    c.setFillColor(MUTED)
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, "FOUR-WEEK INSTRUCTION", 25 * MM, y + 17 * MM, 151 * MM, "Pilcrow-Bold", 7, fill=MUTED, max_lines=1)
    else:
        c.drawString(25 * MM, y + 17 * MM, "FOUR-WEEK INSTRUCTION")
    draw_text(c, plan.get("repeat_instruction", "Repeat this routine for four weeks."), 25 * MM, y + 10 * MM, 151 * MM, "Pilcrow", 7.5, 9, MUTED, 4)
    footer(c, root)
    c.showPage()


def draw_recovery(c, plan, root):
    begin_light_page(c)
    label_pill(c, "Recovery", 20 * MM, PAGE_H - 28 * MM, 34 * MM)
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, "Rest is part of the plan.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 22, fill=GREEN)
    else:
        c.setFont("Pilcrow-Bold", 22)
        c.setFillColor(INK)
        c.drawString(20 * MM, PAGE_H - 46 * MM, "Rest is part of the ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Rest is part of the ", "Pilcrow-Bold", 22)
        c.setFillColor(GREEN)
        c.drawString(x2, PAGE_H - 46 * MM, "plan.")
    y = PAGE_H - 70 * MM
    for index, item in enumerate(plan.get("recovery_guidance", [])[:4], 1):
        guidance_card(c, "v", "", item, 20 * MM, y, 161 * MM, 18 * MM, body_max_lines=2)
        y -= 21 * MM
    label_pill(c, "Safety guidance", 20 * MM, y - 3 * MM, 43 * MM)
    if CURRENT_LANGUAGE == "ar":
        draw_text(c, "Train smart.", 20 * MM, y - 20 * MM, 161 * MM, "Pilcrow-Bold", 21, fill=GREEN)
    else:
        c.setFont("Pilcrow-Bold", 21)
        c.setFillColor(INK)
        c.drawString(20 * MM, y - 20 * MM, "Train ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Train ", "Pilcrow-Bold", 21)
        c.setFillColor(GREEN)
        c.drawString(x2, y - 20 * MM, "smart.")
    safety_titles = ["During training", "Alternatives", "Range of motion", "Professional support"]
    card_gap = 4 * MM
    card_width = (161 * MM - card_gap) / 2
    safety_top = y - 54 * MM
    for index, item in enumerate(plan.get("pain_safety_guidance", [])[:4], 1):
        item_index = index - 1
        col, row = item_index % 2, item_index // 2
        card_x = 20 * MM + col * (card_width + card_gap)
        card_y = safety_top - row * 30 * MM
        guidance_card(c, index, safety_titles[item_index], item, card_x, card_y, card_width, 26 * MM, True)
    disclaimer_y = 36 * MM
    rounded_box(c, 20 * MM, disclaimer_y, 161 * MM, 19 * MM, 3 * MM, colors.HexColor("#FFF0E5"))
    draw_text(c, "Safety disclaimer: This plan provides general fitness guidance and is not medical advice. Stop any exercise that causes pain and consult a qualified professional if you have medical concerns.", 25 * MM, disclaimer_y + 12 * MM, 151 * MM, "Pilcrow-Medium", 6.8, 8, colors.HexColor("#9A4B1D"), 3)
    footer(c, root)
    c.showPage()


def draw_final_cta(c, root):
    c.setFillColor(DEEP_GREEN)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.saveState()
    c.setFillColor(colors.Color(1, 0.55, 0.2, alpha=0.35))
    c.circle(PAGE_W - 4 * MM, -8 * MM, 65 * MM, fill=1, stroke=0)
    c.setFillColor(colors.Color(0, 0.78, 0.46, alpha=0.34))
    c.circle(PAGE_W - 24 * MM, 13 * MM, 55 * MM, fill=1, stroke=0)
    c.restoreState()
    draw_logo(c, root, PAGE_W / 2 - 11 * MM, 166 * MM, 22 * MM)
    center_text(c, "Download Fitnet for", 36 * MM, 142 * MM, PAGE_W - 72 * MM, "Pilcrow-Bold", 26, WHITE)
    center_text(c, "more.", 36 * MM, 128 * MM, PAGE_W - 72 * MM, "Pilcrow-Bold", 26, WHITE)
    center_text(c, "Track your plan, log every session, and keep improving -", 31 * MM, 111 * MM, PAGE_W - 62 * MM, "Pilcrow", 10, colors.HexColor("#D6ECE2"))
    center_text(c, "right from your phone.", 31 * MM, 104 * MM, PAGE_W - 62 * MM, "Pilcrow", 10, colors.HexColor("#D6ECE2"))
    draw_linked_store_badge(c, root, "google-play.png", GOOGLE_PLAY_URL, 62 * MM, 82 * MM, 36 * MM, 10.4 * MM)
    draw_linked_store_badge(c, root, "app-store.png", APP_STORE_URL, 103 * MM, 82 * MM, 36 * MM, 10.4 * MM)
    footer(c, None, "Fitnet - Your Gym Partner - plans.fitnetapp.com", True)
    c.showPage()


def render_workout_template(payload, output_path, exercise_lookup, root):
    set_language(payload.get("language", "en"))
    register_fonts(root)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    c = canvas.Canvas(output_path, pagesize=A4, pageCompression=1)
    c.setTitle("Fitnet Workout Plan")
    c.setAuthor("Fitnet")
    draw_cover(c, payload, root)
    draw_summary(c, payload, root)
    draw_app_promo(c, root)
    plan = payload.get("workout_plan", {})
    for day in plan.get("plan_days", []):
        draw_day(c, day, plan, exercise_lookup, root)
    draw_progression(c, plan, root)
    draw_recovery(c, plan, root)
    draw_final_cta(c, root)
    c.save()
