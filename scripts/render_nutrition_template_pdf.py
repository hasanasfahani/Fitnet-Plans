import math
import os
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from render_workout_template_pdf import (
    APP_STORE_URL,
    DEEP_GREEN,
    GREEN,
    INK,
    LIGHT,
    LINE,
    MM,
    MUTED,
    ORANGE,
    PAGE_H,
    PAGE_W,
    PALE_GREEN,
    WHITE,
    begin_light_page,
    center_text,
    draw_linked_store_badge,
    draw_logo,
    draw_phone_mockup,
    draw_text,
    footer,
    label_pill,
    pdfmetrics,
    register_fonts,
    rounded_box,
    set_language,
    tr,
    has_arabic,
    is_arabic,
    rtl_text,
    split_lines,
    arabic_font,
)


COMMUNITY_URL = "https://fitnetinfluencers.onelink.me/sLYI/hasanasfahani"


def display_text(value):
    text = re.sub(r"\bhalal\b\s*", "", str(value or ""), flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def arabic_household_measure(value):
    text = display_text(value)
    replacements = [
        (r"\bmedium tomato\b", "حبة طماطم متوسطة"),
        (r"\btablespoons?\b", "ملعقة كبيرة"),
        (r"\bteaspoons?\b", "ملعقة صغيرة"),
        (r"\bfillets?\b", "شريحة"),
        (r"\bcups?\b", "كوب"),
        (r"\bcloves?\b", "فص"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def ingredient_rows(meal):
    rows = []
    for item in meal.get("ingredients", []):
        name = display_text(item.get("name", "-"))
        grams = item.get("quantity_g", 0)
        household = display_text(item.get("household_quantity", "-"))
        if is_arabic():
            household = arabic_household_measure(household)
            rows.append(f"• {name} - {household} ({grams} غ)")
        else:
            rows.append(f"• {name} - {household} ({grams} g)")
    return "\n".join(rows) or "-"


def draw_cover(c, payload, root):
    profile = payload.get("profile", {})
    plan = payload.get("nutrition_plan", {})
    summary = plan.get("nutrition_summary", {})
    c.setFillColor(DEEP_GREEN)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.saveState()
    c.setFillColor(colors.Color(1, 0.55, 0.2, alpha=0.34))
    c.circle(PAGE_W + 12 * MM, PAGE_H - 22 * MM, 72 * MM, fill=1, stroke=0)
    c.setFillColor(colors.Color(0, 0.78, 0.46, alpha=0.35))
    c.circle(-8 * MM, -10 * MM, 68 * MM, fill=1, stroke=0)
    c.restoreState()
    right_edge = PAGE_W - 14 * MM
    logo_x = right_edge - 18 * MM if is_arabic() else 13 * MM
    pill_x = right_edge - 56 * MM if is_arabic() else 30 * MM
    title_x = right_edge - 168 * MM if is_arabic() else 14 * MM
    title_width = 168 * MM if is_arabic() else 150 * MM
    draw_logo(c, root, logo_x, PAGE_H - 31 * MM, 18 * MM)
    label_pill(c, "Personal nutrition plan", pill_x, PAGE_H - 72 * MM, 56 * MM, colors.Color(1, 1, 1, alpha=0.14), WHITE)
    cover_title = "خطة فيتنت الخاصة\nبك جاهزة." if is_arabic() else "Your Fitnet\nplan is ready."
    draw_text(c, cover_title, title_x, PAGE_H - 98 * MM, title_width, "Pilcrow-Bold", 34, 36, WHITE)
    meals = summary.get("meals_per_day", 4)
    subtitle = (f"خطة تغذية عملية لمدة 7 أيام تشمل {meals} وجبات يومياً، مصممة وفق هدفك وتفضيلاتك واحتياجاتك الغذائية."
                if is_arabic()
                else f"A practical 7-day nutrition plan with {meals} meals per day, built around your goal, preferences, and daily nutrition targets.")
    subtitle_width = 156 * MM if is_arabic() else 142 * MM
    subtitle_x = right_edge - subtitle_width if is_arabic() else 14 * MM
    draw_text(c, subtitle, subtitle_x, PAGE_H - 141 * MM, subtitle_width, "Pilcrow", 12.5, 18, colors.HexColor("#D8EEE4"), 4)
    goal_value = tr(summary.get('goal', profile.get('goal', '-')))
    chips = ([f"الهدف: {goal_value}", f"{summary.get('daily_calorie_target', '-')} سعرة", f"{meals} وجبات / يوم"]
             if is_arabic()
             else [f"Goal: {goal_value}", f"{summary.get('daily_calorie_target', '-')} kcal", f"{meals} Meals / Day"])
    if is_arabic():
        x = right_edge
        for index, chip in enumerate(chips):
            w = [45, 37, 40][index] * MM
            x -= w
            rounded_box(c, x, PAGE_H - 178 * MM, w, 11 * MM, 5.5 * MM, ORANGE if index == 2 else WHITE)
            center_text(c, chip, x, PAGE_H - 174.2 * MM, w, "Pilcrow-Bold", 8, WHITE if index == 2 else DEEP_GREEN)
            x -= 4 * MM
    else:
        x = 14 * MM
        for index, chip in enumerate(chips):
            w = [45, 37, 40][index] * MM
            rounded_box(c, x, PAGE_H - 178 * MM, w, 11 * MM, 5.5 * MM, ORANGE if index == 2 else WHITE)
            center_text(c, chip, x, PAGE_H - 174.2 * MM, w, "Pilcrow-Bold", 8, WHITE if index == 2 else DEEP_GREEN)
            x += w + 4 * MM
    c.setFont("Pilcrow", 7.5)
    c.setFillColor(colors.HexColor("#CDE8DB"))
    c.drawString(14 * MM, 19 * MM, "Prepared for consistent, practical nutrition")
    c.drawRightString(PAGE_W - 14 * MM, 19 * MM, f"Generated {datetime.utcnow().strftime('%Y-%m-%d')}")
    c.showPage()


def summary_card(c, label, value, x, y, w, h=19 * MM):
    rounded_box(c, x, y, w, h, 4 * MM, LIGHT, LINE, 0.4)
    c.setFont("Pilcrow-Bold", 6.2)
    c.setFillColor(MUTED)
    label_text = tr(label).upper()
    if has_arabic(label_text):
        c.setFont("FitnetArabic-Bold", 6.2)
        c.drawRightString(x + w - 4 * MM, y + h - 6 * MM, rtl_text(label_text))
    else:
        c.drawString(x + 4 * MM, y + h - 6 * MM, label_text)
    draw_text(c, display_text(value) or "-", x + 4 * MM, y + h - 12 * MM, w - 8 * MM, "Pilcrow-Bold", 9.2, 10.5, INK, 2)


def draw_summary(c, payload, root):
    begin_light_page(c)
    profile = payload.get("profile", {})
    summary = payload.get("nutrition_plan", {}).get("nutrition_summary", {})
    macros = summary.get("daily_macro_targets", {})
    label_pill(c, "Profile & nutrition summary", 20 * MM, PAGE_H - 28 * MM, 64 * MM)
    if is_arabic():
        draw_text(c, "Built around you.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 23, fill=GREEN)
    else:
        c.setFont("Pilcrow-Bold", 23)
        c.setFillColor(INK)
        c.drawString(20 * MM, PAGE_H - 46 * MM, "Built around ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Built around ", "Pilcrow-Bold", 23)
        c.setFillColor(GREEN)
        c.drawString(x2, PAGE_H - 46 * MM, "you.")
    draw_text(c, "Your calorie target, meal structure, and nutrition balance are summarized below.", 20 * MM, PAGE_H - 57 * MM, 158 * MM, "Pilcrow", 9.4, 12, MUTED, 2)
    cards = [
        ("Goal", summary.get("goal", profile.get("goal"))), ("Plan type", payload.get("plan_type")), ("Gender", profile.get("gender")),
        ("Birth date", profile.get("birth_date")), ("Height", f"{profile.get('height_cm', '-')} cm"), ("Weight", f"{profile.get('weight_kg', '-')} kg"),
        ("Approximate daily calories", f"{summary.get('daily_calorie_target', '-')} kcal"), ("Meals per day", summary.get("meals_per_day")), ("Daily fiber", f"{macros.get('fiber_g', '-')} g"),
    ]
    gap, card_w, card_h = 4 * MM, 51 * MM, 19 * MM
    top = PAGE_H - 88 * MM
    for i, (label, value) in enumerate(cards):
        col, row = i % 3, i // 3
        summary_card(c, label, value, 20 * MM + col * (card_w + gap), top - row * (card_h + gap), card_w, card_h)
    macro_y = top - 3 * (card_h + gap) - 20 * MM
    rounded_box(c, 20 * MM, macro_y, 161 * MM, 39 * MM, 5 * MM, PALE_GREEN)
    c.setFont("Pilcrow-Bold", 7)
    c.setFillColor(colors.HexColor("#00965A"))
    if is_arabic():
        draw_text(c, "DAILY NUTRITION TARGETS", 25 * MM, macro_y + 30 * MM, 151 * MM, "Pilcrow-Bold", 7, fill=colors.HexColor("#00965A"), max_lines=1)
    else:
        c.drawString(25 * MM, macro_y + 30 * MM, "DAILY NUTRITION TARGETS")
    values = [("Protein", macros.get("protein_g")), ("Carbs", macros.get("carbs_g")), ("Fat", macros.get("fat_g")), ("Fiber", macros.get("fiber_g"))]
    x = 25 * MM
    for label, value in values:
        rounded_box(c, x, macro_y + 8 * MM, 34 * MM, 16 * MM, 8 * MM, WHITE, colors.HexColor("#BDEDD8"), 0.5)
        center_text(c, f"{value} g", x, macro_y + 16.2 * MM, 34 * MM, "Pilcrow-Bold", 9.2, GREEN)
        center_text(c, label, x, macro_y + 11 * MM, 34 * MM, "Pilcrow-Medium", 6.5, INK)
        x += 38 * MM
    rationale_y = macro_y - 57 * MM
    rounded_box(c, 20 * MM, rationale_y, 161 * MM, 48 * MM, 5 * MM, colors.HexColor("#CAD8D2"))
    label_pill(c, "Why this plan fits you", 27 * MM, rationale_y + 35 * MM, 52 * MM, ORANGE, WHITE)
    draw_text(c, display_text(summary.get("nutrition_rationale", "This nutrition plan matches your goal and daily nutrition targets.")), 27 * MM, rationale_y + 27 * MM, 147 * MM, "Pilcrow", 8.6, 11, WHITE, 6)
    footer(c, root)
    c.showPage()


def draw_app_promo(c, root):
    begin_light_page(c)
    promo_pill_x = PAGE_W - 70 * MM if is_arabic() else 20 * MM
    label_pill(c, "Join the movement", promo_pill_x, PAGE_H - 28 * MM, 50 * MM)
    if is_arabic():
        draw_text(c, "Build a healthier lifestyle.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 23, fill=GREEN, max_lines=1)
    else:
        c.setFont("Pilcrow-Bold", 23)
        c.setFillColor(INK)
        c.drawString(20 * MM, PAGE_H - 46 * MM, "Build a healthier ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Build a healthier ", "Pilcrow-Bold", 23)
        c.setFillColor(GREEN)
        c.drawString(x2, PAGE_H - 46 * MM, "lifestyle.")
    draw_text(c, "Join Fitnet's growing community and turn healthy intentions into habits through movement, support, and consistent progress.", 20 * MM, PAGE_H - 57 * MM, 162 * MM, "Pilcrow", 9.2, 12, MUTED, 2)
    draw_phone_mockup(c, root, "home-page.png", 20 * MM, 128 * MM, 49 * MM, 105 * MM)
    draw_phone_mockup(c, root, "start-page.png", 142 * MM, 128 * MM, 49 * MM, 105 * MM)
    draw_text(c, "Train, track your activity, and stay connected to a community built around sustainable progress. Fitnet helps make movement part of everyday life.", 77 * MM, 211 * MM, 57 * MM, "Pilcrow", 9.2, 12, INK, 8)
    metrics = [("+1,500", "users"), ("+50", "coaches"), ("+10", "nutritionists")]
    x = 76 * MM
    for value, label in metrics:
        rounded_box(c, x, 143 * MM, 18 * MM, 17 * MM, 8.5 * MM, LIGHT, LINE, 0.5)
        center_text(c, value, x, 152.5 * MM, 18 * MM, "Pilcrow-Bold", 8.2, GREEN)
        center_text(c, label, x, 147 * MM, 18 * MM, "Pilcrow-Semibold", 6.2, INK)
        x += 20 * MM
    rounded_box(c, 20 * MM, 101 * MM, 161 * MM, 22 * MM, 5 * MM, INK)
    c.setFont("Pilcrow-Bold", 10)
    c.setFillColor(WHITE)
    draw_text(c, "Join the Fitnet movement", 27 * MM, 113 * MM, 101 * MM, "Pilcrow-Bold", 10, fill=WHITE, max_lines=1)
    c.setFont("Pilcrow", 7.5)
    c.setFillColor(colors.HexColor("#B8C1BD"))
    draw_text(c, "Build healthy habits with a growing community", 27 * MM, 107 * MM, 101 * MM, "Pilcrow", 7.5, fill=colors.HexColor("#B8C1BD"), max_lines=1)
    button_x, button_y, button_w, button_h = 135 * MM, 106 * MM, 41 * MM, 11 * MM
    rounded_box(c, button_x, button_y, button_w, button_h, 5.5 * MM, GREEN)
    center_text(c, "Join the movement ->", button_x, button_y + 3.7 * MM, button_w, "Pilcrow-Bold", 7.1, DEEP_GREEN)
    c.linkURL(COMMUNITY_URL, (button_x, button_y, button_x + button_w, button_y + button_h), relative=0, thickness=0)
    draw_linked_store_badge(c, root, "google-play.png", "https://play.google.com/store/apps/details?id=com.fitnet.app.gym.fitnet_application&hl=en", 20 * MM, 87 * MM, 32 * MM, 9.3 * MM)
    draw_linked_store_badge(c, root, "app-store.png", APP_STORE_URL, 56 * MM, 87 * MM, 32 * MM, 9.3 * MM)
    footer(c, root)
    c.showPage()


def draw_right_text(c, text, right, y, max_width, font="Pilcrow", size=10, leading=None, fill=INK, max_lines=None):
    text = tr(text)
    if has_arabic(text):
        font = arabic_font(font)
    leading = leading or size * 1.28
    lines = split_lines(text, font, size, max_width)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(fill)
    for line in lines:
        c.drawRightString(right, y, rtl_text(line) if has_arabic(line) else line)
        y -= leading
    return y


def meal_card(c, meal, x, y, w, h):
    rounded_box(c, x, y, w, h, 4 * MM, LIGHT, LINE, 0.45)
    slot = str(meal.get("meal_slot", "Meal")).title()
    ingredients = ingredient_rows(meal)

    if is_arabic():
        label_pill(c, slot, x + w - 28 * MM, y + h - 10 * MM, 24 * MM, ORANGE, WHITE)
        draw_right_text(c, meal.get("meal_name", "Fitnet meal"), x + w - 32 * MM, y + h - 6.2 * MM, w - 36 * MM, "Pilcrow-Bold", 10, 11, INK, 2)
        macro = f"{meal.get('calories', 0)} سعرة | بروتين {meal.get('protein_g', 0)}غ | كربوهيدرات {meal.get('carbs_g', 0)}غ | دهون {meal.get('fat_g', 0)}غ | ألياف {meal.get('fiber_g', 0)}غ"
        draw_right_text(c, macro, x + w - 4 * MM, y + h - 17 * MM, w - 8 * MM, "Pilcrow-Medium", 7.2, 8, colors.HexColor("#00965A"), 1)

        left_right = x + w / 2 - 2 * MM
        right_right = x + w - 4 * MM
        column_w = w / 2 - 8 * MM
        draw_right_text(c, "INGREDIENTS", left_right, y + h - 24 * MM, column_w, "Pilcrow-Bold", 6.2, fill=MUTED, max_lines=1)
        draw_right_text(c, "PREPARATION", right_right, y + h - 24 * MM, column_w, "Pilcrow-Bold", 6.2, fill=MUTED, max_lines=1)
        draw_right_text(c, ingredients, left_right, y + h - 29 * MM, column_w, "Pilcrow", 6.4, 7.5, INK, 7)
        draw_right_text(c, display_text(meal.get("cooking_method", "-")), right_right, y + h - 29 * MM, column_w, "Pilcrow", 6.4, 7.5, INK, 7)
    else:
        label_pill(c, slot, x + 4 * MM, y + h - 10 * MM, 24 * MM, ORANGE, WHITE)
        draw_text(c, meal.get("meal_name", "Fitnet meal"), x + 32 * MM, y + h - 6.2 * MM, w - 36 * MM, "Pilcrow-Bold", 10, 11, INK, 2)
        macro = f"{meal.get('calories', 0)} kcal  |  P {meal.get('protein_g', 0)}g  C {meal.get('carbs_g', 0)}g  F {meal.get('fat_g', 0)}g  |  Fiber {meal.get('fiber_g', 0)}g"
        draw_text(c, macro, x + 4 * MM, y + h - 17 * MM, w - 8 * MM, "Pilcrow-Medium", 7.2, 8, colors.HexColor("#00965A"), 1)
        draw_text(c, "INGREDIENTS", x + 4 * MM, y + h - 24 * MM, w / 2 - 8 * MM, "Pilcrow-Bold", 6.2, fill=MUTED, max_lines=1)
        draw_text(c, "PREPARATION", x + w / 2 + 2 * MM, y + h - 24 * MM, w / 2 - 6 * MM, "Pilcrow-Bold", 6.2, fill=MUTED, max_lines=1)
        draw_text(c, ingredients, x + 4 * MM, y + h - 29 * MM, w / 2 - 8 * MM, "Pilcrow", 6.4, 7.5, INK, 7)
        draw_text(c, display_text(meal.get("cooking_method", "-")), x + w / 2 + 2 * MM, y + h - 29 * MM, w / 2 - 6 * MM, "Pilcrow", 6.4, 7.5, INK, 7)


def draw_day_pages(c, day, root):
    meals = day.get("meals", [])
    chunks = [meals[index:index + 4] for index in range(0, len(meals), 4)] or [[]]
    totals = day.get("daily_totals", {})
    for chunk_index, chunk in enumerate(chunks):
        begin_light_page(c)
        index = day.get("day_index", 1)
        title = day.get("day_name") or f"Day {index}"
        if chunk_index: title = f"{title} - continued"
        if is_arabic():
            badge_x = PAGE_W - 32 * MM
            rounded_box(c, badge_x, PAGE_H - 48 * MM, 12 * MM, 12 * MM, 6 * MM, ORANGE)
            center_text(c, index, badge_x, PAGE_H - 44.2 * MM, 12 * MM, "Pilcrow-Bold", 10, WHITE)
            draw_text(c, f"اليوم {index}", 20 * MM, PAGE_H - 43 * MM, 145 * MM, "Pilcrow-Bold", 19, fill=INK, max_lines=1)
            macro = f"{totals.get('calories', 0)} سعرة | بروتين {totals.get('protein_g', 0)}غ | كربوهيدرات {totals.get('carbs_g', 0)}غ | دهون {totals.get('fat_g', 0)}غ | ألياف {totals.get('fiber_g', 0)}غ"
            draw_right_text(c, macro, PAGE_W - 36 * MM, PAGE_H - 51 * MM, 145 * MM, "Pilcrow-Medium", 8, 9, MUTED, 1)
        else:
            rounded_box(c, 20 * MM, PAGE_H - 48 * MM, 12 * MM, 12 * MM, 6 * MM, ORANGE)
            center_text(c, index, 20 * MM, PAGE_H - 44.2 * MM, 12 * MM, "Pilcrow-Bold", 10, WHITE)
            c.setFont("Pilcrow-Bold", 19)
            c.setFillColor(INK)
            c.drawString(36 * MM, PAGE_H - 43 * MM, title)
            macro = f"{totals.get('calories', 0)} kcal  |  Protein {totals.get('protein_g', 0)}g  |  Carbs {totals.get('carbs_g', 0)}g  |  Fat {totals.get('fat_g', 0)}g  |  Fiber {totals.get('fiber_g', 0)}g"
            draw_text(c, macro, 36 * MM, PAGE_H - 51 * MM, 145 * MM, "Pilcrow-Medium", 8, 9, MUTED, 1)
        available_h = 211 * MM
        gap = 4 * MM
        card_h = min(49 * MM, (available_h - gap * max(0, len(chunk) - 1)) / max(1, len(chunk)))
        y = PAGE_H - 68 * MM - card_h
        for meal in chunk:
            meal_card(c, meal, 20 * MM, y, 161 * MM, card_h)
            y -= card_h + gap
        footer(c, root)
        c.showPage()


def draw_grocery_pages(c, groups, root):
    items = [(group.get("category", "Pantry"), display_text(item.get("name", "-")), item.get("quantity_label", f"{item.get('quantity_g', 0)} g")) for group in groups for item in group.get("items", [])]
    page_total = max(1, math.ceil(len(items) / 50))
    page_size = max(1, math.ceil(len(items) / page_total))
    chunks = [items[index:index + page_size] for index in range(0, len(items), page_size)] or [[]]
    for page_index, chunk in enumerate(chunks):
        begin_light_page(c)
        label_pill(c, "Weekly grocery list", 20 * MM, PAGE_H - 28 * MM, 51 * MM)
        if is_arabic():
            draw_text(c, "Shop with a plan.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 23, fill=GREEN)
        else:
            c.setFont("Pilcrow-Bold", 23)
            c.setFillColor(INK)
            c.drawString(20 * MM, PAGE_H - 46 * MM, "Shop with a ")
            x2 = 20 * MM + pdfmetrics.stringWidth("Shop with a ", "Pilcrow-Bold", 23)
            c.setFillColor(GREEN)
            c.drawString(x2, PAGE_H - 46 * MM, "plan.")
        if page_index:
            c.setFont("Pilcrow-Medium", 8)
            c.setFillColor(MUTED)
            draw_text(c, "Grocery list continued", 20 * MM, PAGE_H - 56 * MM, 161 * MM, "Pilcrow-Medium", 8, fill=MUTED, max_lines=1)
        per_column = math.ceil(len(chunk) / 2)
        for column in range(2):
            x = 20 * MM + column * 82 * MM
            subset = chunk[column * per_column:(column + 1) * per_column]
            y = PAGE_H - 68 * MM
            previous_category = None
            for category, name, quantity in subset:
                if category != previous_category:
                    c.setFont("Pilcrow-Bold", 6.3)
                    c.setFillColor(ORANGE)
                    c.drawString(x, y, category.upper())
                    y -= 6 * MM
                    previous_category = category
                rounded_box(c, x, y - 6 * MM, 78 * MM, 7.5 * MM, 2 * MM, LIGHT)
                draw_text(c, name, x + 3 * MM, y - 1.5 * MM, 49 * MM, "Pilcrow-Medium", 6.6, 7, INK, 1)
                c.setFont("Pilcrow", 6.5)
                c.setFillColor(MUTED)
                c.drawRightString(x + 74 * MM, y - 1.5 * MM, str(quantity))
                y -= 9 * MM
        # Grocery rows can extend into the footer band, so this page intentionally has no store badges.
        c.showPage()


def draw_guidance(c, plan, root):
    begin_light_page(c)
    label_pill(c, "Consistency & safety", 20 * MM, PAGE_H - 28 * MM, 55 * MM)
    if is_arabic():
        draw_text(c, "Keep it practical.", 20 * MM, PAGE_H - 46 * MM, 161 * MM, "Pilcrow-Bold", 23, fill=GREEN)
    else:
        c.setFont("Pilcrow-Bold", 23)
        c.setFillColor(INK)
        c.drawString(20 * MM, PAGE_H - 46 * MM, "Keep it ")
        x2 = 20 * MM + pdfmetrics.stringWidth("Keep it ", "Pilcrow-Bold", 23)
        c.setFillColor(GREEN)
        c.drawString(x2, PAGE_H - 46 * MM, "practical.")
    rounded_box(c, 20 * MM, PAGE_H - 102 * MM, 161 * MM, 34 * MM, 5 * MM, PALE_GREEN)
    c.setFont("Pilcrow-Bold", 7)
    c.setFillColor(colors.HexColor("#00965A"))
    draw_text(c, "REPEAT INSTRUCTION", 26 * MM, PAGE_H - 79 * MM, 149 * MM, "Pilcrow-Bold", 7, fill=colors.HexColor("#00965A"), max_lines=1)
    draw_text(c, plan.get("repeat_instruction", "Repeat this 7-day plan for four weeks."), 26 * MM, PAGE_H - 87 * MM, 149 * MM, "Pilcrow", 8.5, 11, INK, 4)
    c.setFont("Pilcrow-Bold", 18)
    c.setFillColor(INK)
    draw_text(c, "Safety notes", 20 * MM, PAGE_H - 122 * MM, 161 * MM, "Pilcrow-Bold", 18, fill=INK, max_lines=1)
    y = PAGE_H - 150 * MM
    for index, note in enumerate(plan.get("safety_notes", []), 1):
        rounded_box(c, 20 * MM, y, 161 * MM, 25 * MM, 4 * MM, LIGHT, LINE, 0.4)
        c.setFillColor(ORANGE)
        c.circle(28 * MM, y + 16 * MM, 3.5 * MM, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Pilcrow-Bold", 7)
        c.drawCentredString(28 * MM, y + 13.7 * MM, str(index))
        draw_text(c, display_text(note), 36 * MM, y + 18 * MM, 138 * MM, "Pilcrow", 8.2, 10, INK, 3)
        y -= 30 * MM
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
    center_text(c, "Keep your plan close, track progress, and build consistency -", 25 * MM, 111 * MM, PAGE_W - 50 * MM, "Pilcrow", 10, colors.HexColor("#D6ECE2"))
    center_text(c, "right from your phone.", 31 * MM, 104 * MM, PAGE_W - 62 * MM, "Pilcrow", 10, colors.HexColor("#D6ECE2"))
    draw_linked_store_badge(c, root, "google-play.png", "https://play.google.com/store/apps/details?id=com.fitnet.app.gym.fitnet_application&hl=en", 62 * MM, 82 * MM, 36 * MM, 10.4 * MM)
    draw_linked_store_badge(c, root, "app-store.png", APP_STORE_URL, 103 * MM, 82 * MM, 36 * MM, 10.4 * MM)
    footer(c, None, "Fitnet - Your Gym Partner - plans.fitnetapp.com", True)
    c.showPage()


def render_nutrition_template(payload, output_path, root):
    set_language(payload.get("language", "en"))
    register_fonts(root)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    c = canvas.Canvas(output_path, pagesize=A4, pageCompression=1)
    c.setTitle("Fitnet Nutrition Plan")
    c.setAuthor("Fitnet")
    draw_cover(c, payload, root)
    draw_summary(c, payload, root)
    draw_app_promo(c, root)
    plan = payload.get("nutrition_plan", {})
    for day in plan.get("days", []):
        draw_day_pages(c, day, root)
    draw_grocery_pages(c, plan.get("weekly_grocery_list", []), root)
    draw_guidance(c, plan, root)
    draw_final_cta(c, root)
    c.save()
