import { defineField, type NumberRule } from "sanity";
import { ToneInput } from "../components/ToneInput";
import { TONE_VALUE, TONES } from "../tones";

/** The colour of a base, a cream or a filling (the dot next to it in the cake builder, and its colour in the 3D preview) */
export const toneField = defineField({
  name: "tone",
  title: "צבע",
  type: "string",
  description: "הנקודה הצבעונית שמופיעה ליד האפשרות בבונה העוגה, וגם הצבע שלה בהדמיה התלת־ממדית. אפשר לבחור גוון מהרשימה או \"גוון אחר\".",
  components: { input: ToneInput },
  initialValue: TONES[1].value,
  validation: (rule) => rule.required().custom((value: string | undefined) => (!value || TONE_VALUE.test(value) ? true : "גוון לא תקין")),
});

export const TASTE_GROUPS = [
  { title: "קלאסי", value: "classic" },
  { title: "שוקולד", value: "chocolate" },
  { title: "פירותי ורענן", value: "fruity" },
  { title: "אגוזים ופיסטוק", value: "nutty" },
  { title: "עוגיות וממתקים", value: "sweets" },
  { title: "מיוחדים ומתובלים", value: "special" },
];

/** Which tab of a long list the option sits in, in the cake builder */
export const tasteGroupField = defineField({
  name: "group",
  title: "קבוצה",
  type: "string",
  description: "כשהרשימה בבונה ארוכה, היא מחולקת ללשוניות לפי הקבוצות האלה. השמות עצמם: \"דף הזמנת עוגה\".",
  options: { list: TASTE_GROUPS, layout: "radio", direction: "horizontal" },
});

export const ALLERGENS = [
  { title: "מוצרי חלב", value: "dairy" },
  { title: "אגוזים או בוטנים", value: "nuts" },
  { title: "גלוטן", value: "gluten" },
];

/** What's in it, for the builder's allergy checks */
export function allergensField(what: string, list = ALLERGENS) {
  return defineField({
    name: "contains",
    title: `מה יש ב${what}`,
    type: "array",
    of: [{ type: "string" }],
    options: { list, layout: "grid" },
    description: `חשוב, בגלל אלרגיות: לסמן כל מה שיש ב${what}. בונה העוגה לא מאפשר לשלוח הזמנה עם ${what} שמכיל משהו שהלקוח ביקש בלעדיו (למשל אגוזים).`,
    validation: (rule) => rule.unique(),
  });
}

/** Alt text of a photo: what a screen reader reads, and what Google understands of the photo */
export const altField = defineField({
  name: "alt",
  title: "מה רואים בתמונה",
  type: "string",
  description: "תיאור קצר, לקוראי מסך ולגוגל. למשל: עוגה לבנה עם הספרה 12 בזהב וזר גיבסנית.",
  validation: (rule) => rule.max(160),
});

/** The same, required: a product photo is the only way a screen reader knows what's for sale */
export const requiredAltField = defineField({
  ...altField,
  validation: (rule) => rule.required().error("צריך לתאר מה רואים בתמונה").max(160),
});

/** Letters (Hebrew too) and digits, joined by single dashes: "עוגת מספרים 12!" → "עוגת-מספרים-12" */
export function slugify(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, "") // nikud and cantillation marks
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

/** The page's address on the site, made from the Hebrew name with one click */
export function slugField(source = "title.he", group?: string) {
  return defineField({
    name: "slug",
    title: "כתובת הדף באתר",
    type: "slug",
    description: "נוצרת מהשם בלחיצה על Generate. אחרי שהדף פורסם עדיף לא לשנות: קישורים ששותפו יפסיקו לעבוד.",
    ...(group ? { group } : {}),
    options: { source, slugify, maxLength: 80 },
    validation: (rule) =>
      rule.required().custom((value: { current?: string } | undefined) => {
        const current = value?.current ?? "";
        if (!current) return "לחצו על Generate כדי ליצור כתובת";
        if (current.length > 80) return "עד 80 תווים";
        return SLUG.test(current) ? true : "רק אותיות, ספרות ומקפים בודדים (בלי רווחים וסימנים)";
      }),
  });
}

/** An amount in shekels, as the owner types it: whole shekels or agorot, never negative */
export function shekelsRule(rule: NumberRule, { required = true, min = 0 } = {}) {
  const base = rule.min(min).max(100_000).precision(2);
  return required ? base.required() : base;
}
