import argparse
import json
import os
import re
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    KeepTogether,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from render_workout_template_pdf import render_workout_template
from render_nutrition_template_pdf import render_nutrition_template


GREEN = colors.HexColor("#00BF6B")
DEEP_GREEN = colors.HexColor("#005C35")
ORANGE = colors.HexColor("#FF8A3B")
INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#555555")
LIGHT = colors.HexColor("#F5F7F6")
LINE = colors.HexColor("#D7DDD9")


def load_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def build_lookup(items, id_field):
    return {int(item[id_field]): item for item in items}


def require_lookup(lookup, item_id, label):
    try:
        return lookup[int(item_id)]
    except KeyError as exc:
        raise ValueError(f"Unresolved {label} id: {item_id}") from exc


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=34,
            leading=38,
            textColor=colors.white,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=13,
            leading=18,
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=21,
            leading=26,
            textColor=INK,
            spaceBefore=8,
            spaceAfter=10,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=DEEP_GREEN,
            spaceBefore=8,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=INK,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=MUTED,
        ),
        "compact": ParagraphStyle(
            "compact",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.2,
            leading=9,
            textColor=INK,
        ),
        "compact_bold": ParagraphStyle(
            "compact_bold",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.4,
            leading=9.2,
            textColor=INK,
        ),
        "badge": ParagraphStyle(
            "badge",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=GREEN,
            alignment=TA_CENTER,
        ),
        "cta": ParagraphStyle(
            "cta",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=31,
            textColor=colors.white,
            alignment=TA_CENTER,
        ),
    }


def paragraph(text, style):
    return Paragraph(str(text).replace("&", "&amp;"), style)


def nutrition_display_text(value, capitalize=False):
    text = re.sub(r"\bhalal\b\s*", "", str(value or ""), flags=re.IGNORECASE)
    text = re.sub(r"\s+([,.;:])", r"\1", re.sub(r"\s{2,}", " ", text)).strip()
    if capitalize and text:
        text = text[0].upper() + text[1:]
    return text


def key_value_table(rows, width):
    data = [[paragraph(label, S["small"]), paragraph(value or "-", S["body"])] for label, value in rows]
    table = Table(data, colWidths=[width * 0.36, width * 0.64])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def section_table(headers, rows, widths):
    data = [[paragraph(header, S["badge"]) for header in headers]]
    data.extend([[paragraph(cell, S["body"]) for cell in row] for row in rows])
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8FFF3")),
                ("TEXTCOLOR", (0, 0), (-1, 0), DEEP_GREEN),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def compact_section_table(headers, rows, widths, repeat_rows=1):
    data = [[paragraph(header, S["badge"]) for header in headers]]
    data.extend([[paragraph(cell, S["compact"]) for cell in row] for row in rows])
    table = Table(data, colWidths=widths, repeatRows=repeat_rows)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8FFF3")),
                ("TEXTCOLOR", (0, 0), (-1, 0), DEEP_GREEN),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def bullet_paragraphs(items):
    return [paragraph(f"- {item}", S["body"]) for item in items if item]


def coach_notes_table(day_label, notes):
    data = [[paragraph(day_label, S["h2"])]]
    data.extend([[paragraph(f"- {note}", S["body"])]] for note in notes if note)
    table = Table(data, colWidths=[165 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, 0), 2),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 3),
                ("TOPPADDING", (0, 1), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 1),
            ]
        )
    )
    return table


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(colors.HexColor("#FAFAFA"))
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(18 * mm, height - 13 * mm, "Fitnet")
    canvas.setFillColor(GREEN)
    canvas.circle(14 * mm, height - 10.5 * mm, 3 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def cover_page(payload):
    story = []
    plan_type = payload["plan_type"]
    goal = payload["profile"].get("goal", "Personalized")
    generated = datetime.utcnow().strftime("%Y-%m-%d")

    box = Table(
        [
            [paragraph("FITNET", S["badge"])],
            [paragraph("Your Fitnet Plan Is Ready", S["cover_title"])],
            [paragraph(f"{goal} - {plan_type}", S["cover_subtitle"])],
            [paragraph(f"Generated {generated}", S["cover_subtitle"])],
        ],
        colWidths=[165 * mm],
        rowHeights=[18 * mm, 34 * mm, 18 * mm, 18 * mm],
    )
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#050505")),
                ("BOX", (0, 0), (-1, -1), 1.2, GREEN),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    story.extend([Spacer(1, 38 * mm), box, Spacer(1, 14 * mm)])
    if payload.get("workout_plan"):
        fit_text = "Tailored to your goals, schedule, experience, preferences, and available equipment."
    else:
        fit_text = "Tailored to your goals, daily nutrition targets, preferences, and dietary needs."
    story.append(paragraph(fit_text, S["body"]))
    story.append(PageBreak())
    return story


def profile_summary(payload):
    profile = payload["profile"]
    workout_summary = (payload.get("workout_plan") or {}).get("program_summary", {})
    rows = [
        ("Goal", profile.get("goal")),
        ("Plan type", payload.get("plan_type")),
        ("Gender", profile.get("gender")),
        ("Birth date", profile.get("birth_date") or profile.get("age_range")),
        ("Height", format_metric(profile.get("height_cm"), "cm") or profile.get("height_range")),
        ("Weight", format_metric(profile.get("weight_kg"), "kg") or profile.get("weight_range")),
    ]
    if payload.get("workout_plan"):
        rows.extend([
            ("Experience", profile.get("experience")),
            ("Days per week", workout_summary.get("days_per_week")),
            ("Session duration", f"{workout_summary.get('session_duration_minutes')} min" if workout_summary.get("session_duration_minutes") else None),
        ])
    return [paragraph("Profile Summary", S["h1"]), key_value_table(rows, 170 * mm), Spacer(1, 8 * mm)]


def format_metric(value, unit):
    if value in (None, ""):
        return None
    return f"{value} {unit}"


def workout_sections(payload, exercise_lookup):
    plan = payload.get("workout_plan")
    if not plan:
        return []
    if plan.get("program_summary") and plan.get("repeat_instruction"):
        return workout_sections_v2(plan, exercise_lookup)

    story = [paragraph("Workout Weekly Schedule", S["h1"])]
    rationale = plan.get("coaching_rationale")
    if rationale:
        story.append(paragraph("Coach rationale", S["h2"]))
        story.append(paragraph(rationale, S["body"]))
        story.append(Spacer(1, 6 * mm))

    schedule_rows = []
    for day in plan["plan_days"]:
        exercise_count = len(day["exercises"])
        schedule_rows.append([f"Day {day['day_index']}", day["day_name"], f"{exercise_count} exercises"])
    story.append(section_table(["Day", "Focus", "Volume"], schedule_rows, [30 * mm, 90 * mm, 45 * mm]))
    story.append(Spacer(1, 8 * mm))

    for day in plan["plan_days"]:
        block = [paragraph(f"Day {day['day_index']} - {day['day_name']}", S["h2"])]
        rows = []
        for item in day["exercises"]:
          exercise = require_lookup(exercise_lookup, item["exercise_id"], "exercise")
          reps = ", ".join(str(rep) for rep in item["reps"])
          notes = item["notes"] or "-"
          rows.append([
              exercise.get("display_name") or exercise["name"],
              f"{item['sets']} x {reps}",
              f"{item['rest_seconds']} sec",
              notes,
          ])
        block.append(section_table(["Exercise", "Sets/Reps", "Rest", "Notes"], rows, [58 * mm, 34 * mm, 24 * mm, 49 * mm]))
        block.append(Spacer(1, 6 * mm))
        story.append(KeepTogether(block))

    return story


def workout_sections_v2(plan, exercise_lookup):
    summary = plan.get("program_summary", {})
    story = [paragraph("Weekly Workout Plan", S["h1"])]
    story.append(key_value_table([
        ("Goal", summary.get("goal")),
        ("Split", summary.get("split")),
        ("Days per week", summary.get("days_per_week")),
        ("Session duration", f"{summary.get('session_duration_minutes', '-')} min"),
    ], 170 * mm))
    story.append(Spacer(1, 6 * mm))

    personalization_rows = [
        ("Workout place", summary.get("workout_place")),
        ("Available equipment", join_list(summary.get("available_equipment"))),
        ("Focus muscles", join_list(summary.get("focus_muscles"))),
        ("Disliked exercises", join_list(summary.get("disliked_exercises"))),
    ]
    story.append(paragraph("Personalization Summary", S["h2"]))
    story.append(key_value_table(personalization_rows, 170 * mm))
    story.append(Spacer(1, 6 * mm))

    story.append(paragraph("Why this plan fits you", S["h2"]))
    story.append(paragraph(summary.get("coaching_rationale", "-"), S["body"]))
    story.append(Spacer(1, 6 * mm))

    schedule_rows = []
    for day in plan.get("plan_days", []):
        schedule_rows.append([
            f"Day {day.get('day_index')}",
            day.get("day_name", "-"),
            day.get("day_focus", "-"),
        ])
    if schedule_rows:
        story.append(section_table(["Day", "Workout", "Focus"], schedule_rows, [24 * mm, 45 * mm, 96 * mm]))
        story.append(Spacer(1, 6 * mm))

    for day in plan.get("plan_days", []):
        rows = []
        for item in day.get("exercises", []):
            exercise = require_lookup(exercise_lookup, item["exercise_id"], "exercise")
            rows.append(
                [
                    item.get("exercise_name") or exercise.get("display_name") or exercise["name"],
                    str(item.get("sets", "")),
                    str(item.get("reps", "")),
                    str(item.get("rest", "")),
                    item.get("notes", ""),
                ]
            )
        story.append(paragraph(f"Day {day.get('day_index')} - {day.get('day_name')}", S["h2"]))
        story.append(section_table(["Exercise", "Sets", "Reps", "Rest", "Notes"], rows, [52 * mm, 18 * mm, 28 * mm, 24 * mm, 43 * mm]))
        story.append(Spacer(1, 6 * mm))

    if plan.get("program_version") == "fitnet.workout.output.v3":
        story.extend(workout_coaching_sections_v3(plan))
    else:
        story.append(paragraph("Repeat Instruction", S["h2"]))
        story.append(paragraph(plan.get("repeat_instruction", "Repeat this weekly plan for 4 weeks."), S["body"]))
        story.append(Spacer(1, 6 * mm))
        safety = plan.get("safety_notes", [])
        if safety:
            story.append(paragraph("Safety Notes", S["h2"]))
            story.extend(bullet_paragraphs(safety))
            story.append(Spacer(1, 8 * mm))
    return story


def workout_coaching_sections_v3(plan):
    story = []
    progression = plan.get("progression_guidance", {})

    progression_rows = [
        ("Starting load", progression.get("starting_load")),
        ("Increase repetitions", progression.get("increase_reps")),
        ("Increase load", progression.get("increase_load")),
        ("If a set is too hard", progression.get("if_too_hard")),
        ("If pain occurs", progression.get("if_pain_occurs")),
        ("Four-week instruction", plan.get("repeat_instruction")),
    ]
    story.append(paragraph("Progression", S["h1"]))
    story.append(key_value_table(progression_rows, 170 * mm))
    story.append(Spacer(1, 6 * mm))

    recovery = plan.get("recovery_guidance", [])
    if recovery:
        story.append(paragraph("Recovery", S["h1"]))
        story.extend(bullet_paragraphs(recovery))
        story.append(Spacer(1, 6 * mm))

    safety = plan.get("pain_safety_guidance", [])
    if safety:
        story.append(paragraph("Safety Guidance", S["h1"]))
        story.extend(bullet_paragraphs(safety))
        story.append(Spacer(1, 8 * mm))
    return story


def join_list(value):
    if isinstance(value, list):
        return ", ".join(str(item) for item in value if item not in (None, ""))
    return value


def nutrition_sections(payload, food_lookup):
    plan = payload.get("nutrition_plan")
    if not plan:
        return []
    if plan.get("program_version") == "fitnet.nutrition.output.v2":
        return nutrition_sections_v2(plan)

    day = plan["nutrition_days"][0]
    totals = day["daily_totals"]
    story = [paragraph("Nutrition Daily Plan", S["h1"])]
    story.append(
        key_value_table(
            [
                ("Calories", f"{totals['calories']} kcal"),
                ("Protein", f"{totals['protein_g']} g"),
                ("Carbs", f"{totals['carbs_g']} g"),
                ("Fat", f"{totals['fat_g']} g"),
            ],
            170 * mm,
        )
    )
    story.append(Spacer(1, 8 * mm))

    rows = []
    for meal in day["meals"]:
        foods = [require_lookup(food_lookup, food_id, "food")["name"] for food_id in meal["food_ids"]]
        rows.append(
            [
                meal["meal_slot"].title(),
                meal["meal_name"],
                ", ".join(foods),
                f"{meal['calories']} kcal / P{meal['protein_g']} C{meal['carbs_g']} F{meal['fat_g']}",
            ]
        )
    story.append(section_table(["Meal", "Name", "Approved Foods", "Totals"], rows, [25 * mm, 42 * mm, 62 * mm, 36 * mm]))
    story.append(Spacer(1, 8 * mm))
    return story


def nutrition_sections_v2(plan):
    story = [paragraph("7-Day Nutrition Plan", S["h1"])]
    summary = plan.get("nutrition_summary", {})
    macros = summary.get("daily_macro_targets", {})
    story.append(
        key_value_table(
            [
                ("Goal", summary.get("goal", "-")),
                ("Approximate Daily Calories", f"{summary.get('daily_calorie_target', 0)} kcal"),
                ("Daily Protein", f"{macros.get('protein_g', 0)} g"),
                ("Daily Carbs", f"{macros.get('carbs_g', 0)} g"),
                ("Daily Fat", f"{macros.get('fat_g', 0)} g"),
                ("Daily Fiber", f"{macros.get('fiber_g', 0)} g"),
                ("Meals Per Day", summary.get("meals_per_day", "-")),
            ],
            170 * mm,
        )
    )
    story.append(Spacer(1, 6 * mm))

    if summary.get("nutrition_rationale"):
        story.append(paragraph("Why This Fits You", S["h2"]))
        story.append(paragraph(nutrition_display_text(summary.get("nutrition_rationale")), S["body"]))
        story.append(Spacer(1, 6 * mm))

    story.append(PageBreak())
    for day in plan.get("days", []):
        if day.get("day_index") in (3, 5, 7):
            story.append(PageBreak())
        totals = day.get("daily_totals", {})
        day_block = [paragraph(day.get("day_name") or f"Day {day.get('day_index')}", S["h2"])]
        day_block.append(paragraph(
            f"{totals.get('calories', 0)} kcal | Protein {totals.get('protein_g', 0)}g | Carbs {totals.get('carbs_g', 0)}g | Fat {totals.get('fat_g', 0)}g | Fiber {totals.get('fiber_g', 0)}g",
            S["small"],
        ))
        meal_rows = []
        for meal in day.get("meals", []):
            ingredients = "; ".join(
                f"{nutrition_display_text(item.get('name', '-'), capitalize=True)} {item.get('quantity_g', 0)}g ({item.get('household_quantity', '-')})"
                for item in meal.get("ingredients", [])
            )
            meal_rows.append([
                meal.get("meal_slot", "").title(),
                f"<b>{meal.get('meal_name', '-')}</b><br/>{meal.get('calories', 0)} kcal | P{meal.get('protein_g', 0)} C{meal.get('carbs_g', 0)} F{meal.get('fat_g', 0)} | Fiber {meal.get('fiber_g', 0)}g",
                ingredients,
                nutrition_display_text(meal.get("cooking_method", "-")),
            ])
        day_block.append(compact_section_table(
            ["Meal", "Recipe & totals", "Ingredients", "Preparation"],
            meal_rows,
            [18 * mm, 42 * mm, 59 * mm, 46 * mm],
        ))
        day_block.append(Spacer(1, 3 * mm))
        story.extend(day_block)

    story.append(paragraph("Weekly Grocery List", S["h1"]))
    grocery_rows = []
    for group in plan.get("weekly_grocery_list", []):
        grocery_rows.extend([
            [group.get("category", "Pantry"), nutrition_display_text(item.get("name", "-"), capitalize=True), item.get("quantity_label", f"{item.get('quantity_g', 0)} g")]
            for item in group.get("items", [])
        ])
    story.append(compact_section_table(["Category", "Item", "Buy"], grocery_rows, [38 * mm, 82 * mm, 45 * mm]))
    story.append(Spacer(1, 5 * mm))

    story.append(paragraph("Repeat Instruction", S["h2"]))
    story.append(paragraph(plan.get("repeat_instruction", "Repeat this 7-day meal plan for 4 weeks."), S["body"]))
    story.append(Spacer(1, 6 * mm))

    if plan.get("safety_notes"):
        story.append(paragraph("Safety Notes", S["h2"]))
        story.append(section_table(["Guidance"], [[note] for note in plan.get("safety_notes", [])], [165 * mm]))
        story.append(Spacer(1, 8 * mm))

    return story


def disclaimer_and_cta(payload):
    has_workout = bool(payload.get("workout_plan"))
    has_nutrition = bool(payload.get("nutrition_plan"))
    if has_nutrition and not has_workout:
        disclaimer = "This plan provides general nutrition guidance and is not medical advice. If you have a medical condition, are pregnant, or need therapeutic nutrition support, consult a qualified clinician."
    elif has_workout and not has_nutrition:
        disclaimer = "This plan provides general fitness guidance and is not medical advice. Stop any exercise that causes pain and consult a qualified professional if you have medical concerns."
    else:
        disclaimer = "This plan provides general fitness and nutrition guidance and is not medical advice. Stop any exercise that causes pain and consult a qualified professional if you have medical or nutrition concerns."
    story = []
    if has_workout or not has_nutrition:
        story.extend([
            paragraph("Safety Disclaimer", S["h1"]),
            paragraph(disclaimer, S["body"]),
            Spacer(1, 2 * mm),
        ])
    else:
        story.append(Spacer(1, 8 * mm))
    cta_subtitle = "Track your plan, log sessions, and keep improving inside Fitnet." if has_workout else "Save your plan, track meals, and build consistent habits inside Fitnet."
    cta = Table(
        [
            [paragraph("Download Fitnet App for more", S["cta"])],
            [paragraph(cta_subtitle, S["cover_subtitle"])],
        ],
        colWidths=[165 * mm],
        rowHeights=[22 * mm, 14 * mm],
    )
    cta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#050505")),
                ("BOX", (0, 0), (-1, -1), 1.2, GREEN),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    story.append(KeepTogether([cta]))
    return story


def render(payload_path, output_path, exercise_path, food_path):
    payload = load_json(payload_path)
    exercise_lookup = build_lookup(load_json(exercise_path), "exercise_id")
    food_lookup = build_lookup(load_json(food_path), "food_id")

    if payload.get("workout_plan") and not payload.get("nutrition_plan"):
        render_workout_template(payload, output_path, exercise_lookup, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return
    if payload.get("nutrition_plan") and not payload.get("workout_plan"):
        render_nutrition_template(payload, output_path, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=16 * mm,
        title=f"Fitnet {payload['plan_type']} Plan",
        author="Fitnet",
    )

    story = []
    story.extend(cover_page(payload))
    story.extend(profile_summary(payload))
    story.extend(workout_sections(payload, exercise_lookup))
    story.extend(nutrition_sections(payload, food_lookup))
    story.extend(disclaimer_and_cta(payload))
    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)


S = styles()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--exercises", required=True)
    parser.add_argument("--foods", required=True)
    args = parser.parse_args()
    render(args.payload, args.output, args.exercises, args.foods)


if __name__ == "__main__":
    main()
