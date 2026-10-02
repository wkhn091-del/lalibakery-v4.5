import { ControlsIcon } from "@sanity/icons/Controls";
import { defineArrayMember, defineField, defineType, type ObjectRule } from "sanity";
import { altField, shekelsRule } from "../fields";
import { hebrew, localizedString, localizedText } from "../localized";

/*
  How the shop runs: one document, opened straight from the sidebar, never created or deleted.
  Everything urgent the site says comes from here and from the real orders: "נותרו 2 מקומות"
  only when the day really has 2 left, a promo's end date only as typed here. Nothing is invented.

  What's public: everything here except the reasons of blocked dates, which the site never reads.
*/

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const DAY_LIST = DAYS.map((title, value) => ({ title, value }));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const timeField = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: "string",
    placeholder: "09:00",
    validation: (rule) => rule.required().custom((v: string | undefined) => (!v || TIME.test(v) ? true : "שעה בפורמט 09:00")),
  });

type Window = { _key?: string; days?: number[]; from?: string; to?: string };
type Zone = { name?: unknown; cities?: string[] };
type Blocked = { from?: string; to?: string };
type Promo = { enabled?: boolean; type?: "percent" | "amount"; value?: number; startsAt?: string; endsAt?: string; label?: unknown };

/** Two windows on the same day mustn't overlap: the customer would see the same hours twice */
function noOverlaps(value: Window[] | undefined): true | string {
  const list = value ?? [];
  for (let day = 0; day < 7; day++) {
    const spans = list
      .filter((w) => w.days?.includes(day) && w.from && w.to && TIME.test(w.from) && TIME.test(w.to))
      .map((w) => [minutes(w.from!), minutes(w.to!)] as const)
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) return `בימי ${DAYS[day]} יש שני חלונות שחופפים`;
  }
  return true;
}

/** A city belongs to one delivery zone at most, or its fee would be ambiguous */
function citiesOnce(value: Zone[] | undefined): true | string {
  const seen = new Map<string, string>();
  for (const zone of value ?? []) {
    for (const city of zone.cities ?? []) {
      const key = city.trim();
      const other = seen.get(key);
      if (other !== undefined) return `${key} מופיעה גם ב״${other}״: עיר יכולה להיות רק באזור אחד`;
      seen.set(key, hebrew(zone.name) ?? "אזור");
    }
  }
  return true;
}

function promoRules(rule: ObjectRule) {
  return rule.custom((value: Promo | undefined) => {
    if (!value?.enabled) return true;
    if (!hebrew(value.label)) return "מבצע פעיל צריך שם בעברית (למשל: מבצע השקה)";
    if (!value.type || typeof value.value !== "number") return "בוחרים סוג הנחה וממלאים את גובה ההנחה";
    if (value.type === "percent" && (value.value < 1 || value.value > 50 || !Number.isInteger(value.value))) return "אחוז הנחה שלם, בין 1 ל-50";
    if (value.type === "amount" && (value.value < 1 || value.value > 1000)) return "הנחה בין 1 ל-1,000 ₪";
    if (!value.startsAt || !value.endsAt) return "מבצע פעיל צריך תאריך התחלה ותאריך סיום: האתר מציג את תאריך הסיום כפי שהוא";
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) return "תאריך הסיום צריך להיות אחרי ההתחלה";
    return true;
  });
}

export const storeSettings = defineType({
  name: "storeSettings",
  title: "הגדרות החנות",
  type: "document",
  icon: ControlsIcon,
  groups: [
    { name: "capacity", title: "יומן והזמנות", default: true },
    { name: "delivery", title: "משלוח ואיסוף" },
    { name: "promo", title: "מבצע" },
    { name: "policy", title: "ביטולים" },
    { name: "kosher", title: "כשרות" },
    { name: "business", title: "פרטי העסק" },
  ],
  fields: [
    /* ───────── the calendar ───────── */
    defineField({
      name: "dailyCapacity",
      title: "כמה עוגות ביום",
      type: "number",
      group: "capacity",
      description: "כשיום מתמלא הוא נחסם להזמנות. סופר הזמנות מהחנות ובקשות מהבונה יחד. ״נותרו X מקומות״ מוצג רק כשזה נכון.",
      initialValue: 5,
      validation: (rule) => rule.required().integer().min(1).max(50),
    }),
    defineField({
      name: "weekdayCapacity",
      title: "ימים עם מספר אחר",
      type: "array",
      group: "capacity",
      description: "לא חובה. למשל שישי: 3. אפס: היום סגור (למשל שבת).",
      of: [
        defineArrayMember({
          type: "object",
          name: "weekdayCapacityItem",
          title: "יום",
          fields: [
            defineField({ name: "day", title: "יום", type: "number", options: { list: DAY_LIST }, validation: (rule) => rule.required() }),
            defineField({ name: "capacity", title: "כמה עוגות", type: "number", validation: (rule) => rule.required().integer().min(0).max(50) }),
          ],
          preview: {
            select: { day: "day", capacity: "capacity" },
            prepare: ({ day, capacity }) => ({ title: DAYS[day as number] ?? "יום", subtitle: capacity === 0 ? "סגור" : `${capacity ?? "?"} עוגות` }),
          },
        }),
      ],
      validation: (rule) =>
        rule.max(7).custom((value: { day?: number }[] | undefined) => {
          const days = (value ?? []).map((v) => v.day);
          return new Set(days).size === days.length ? true : "כל יום מופיע פעם אחת";
        }),
    }),
    defineField({
      name: "leadBusinessDays",
      title: "כמה ימי עסקים מראש",
      type: "number",
      group: "capacity",
      description: "ההזמנה המוקדמת ביותר: היום ועוד כך וכך ימי עסקים. ימי עסקים: לא ימים סגורים ולא תאריכים חסומים.",
      initialValue: 3,
      validation: (rule) => rule.required().integer().min(0).max(30),
    }),
    defineField({
      name: "maxAdvanceDays",
      title: "עד כמה ימים קדימה אפשר להזמין",
      type: "number",
      group: "capacity",
      initialValue: 90,
      validation: (rule) => rule.required().integer().min(7).max(365),
    }),
    defineField({
      name: "blockedDates",
      title: "תאריכים חסומים",
      type: "array",
      group: "capacity",
      description: "חגים, חופשות, ימים מלאים מראש. באתר התאריך פשוט לא זמין; הסיבה לא מוצגת לאף אחד.",
      of: [
        defineArrayMember({
          type: "object",
          name: "blockedRange",
          title: "תאריכים",
          fields: [
            defineField({ name: "from", title: "מתאריך", type: "date", options: { dateFormat: "DD/MM/YYYY" }, validation: (rule) => rule.required() }),
            defineField({
              name: "to",
              title: "עד תאריך (כולל)",
              type: "date",
              options: { dateFormat: "DD/MM/YYYY" },
              description: "ליום אחד: אותו תאריך.",
              validation: (rule) =>
                rule.required().custom((to: string | undefined, { parent }) => {
                  const from = (parent as Blocked | undefined)?.from;
                  return !to || !from || to >= from ? true : "״עד״ לפני ״מ-״";
                }),
            }),
            defineField({ name: "reason", title: "סיבה (רק לך)", type: "string", validation: (rule) => rule.max(80) }),
          ],
          preview: {
            select: { from: "from", to: "to", reason: "reason" },
            prepare: ({ from, to, reason }) => ({ title: from === to || !to ? from : `${from} – ${to}`, subtitle: reason }),
          },
        }),
      ],
      validation: (rule) => rule.max(200),
    }),

    /* ───────── delivery and pickup ───────── */
    defineField({
      name: "pickupEnabled",
      title: "אפשר לאסוף",
      type: "boolean",
      group: "delivery",
      initialValue: true,
    }),
    localizedText({
      name: "pickupNote",
      title: "הסבר על האיסוף",
      group: "delivery",
      description: "מוצג ליד אפשרות האיסוף. הכתובת לא מופיעה באתר: נשלחת בוואטסאפ.",
      max: 200,
      rows: 2,
    }),
    defineField({
      name: "deliveryWindows",
      title: "חלונות זמן",
      type: "array",
      group: "delivery",
      description: "הלקוח בוחר אחד בקופה, למשלוח ולאיסוף. בדרך כלל 3 שעות. יום בלי חלון: אין בו משלוחים ואיסופים.",
      of: [
        defineArrayMember({
          type: "object",
          name: "deliveryWindow",
          title: "חלון",
          fields: [
            defineField({
              name: "days",
              title: "בימים",
              type: "array",
              of: [defineArrayMember({ type: "number" })],
              options: { list: DAY_LIST, layout: "grid" },
              validation: (rule) => rule.required().min(1).unique(),
            }),
            timeField("from", "משעה"),
            defineField({
              ...timeField("to", "עד שעה"),
              validation: (rule) =>
                rule.required().custom((to: string | undefined, { parent }) => {
                  const from = (parent as Window | undefined)?.from;
                  if (!to || !TIME.test(to)) return "שעה בפורמט 12:00";
                  if (!from || !TIME.test(from)) return true;
                  return minutes(to) > minutes(from) ? true : "שעת הסיום אחרי שעת ההתחלה";
                }),
            }),
          ],
          preview: {
            select: { days: "days", from: "from", to: "to" },
            prepare: ({ days, from, to }) => ({
              title: `${from ?? "?"}–${to ?? "?"}`,
              subtitle: ((days as number[] | undefined) ?? []).map((d) => DAYS[d]).join(", "),
            }),
          },
        }),
      ],
      validation: (rule) => rule.max(40).custom(noOverlaps),
    }),
    defineField({
      name: "deliveryZones",
      title: "אזורי משלוח",
      type: "array",
      group: "delivery",
      description: "עיר שלא מופיעה באף אזור: הלקוח מקבל הצעה לאסוף או לתאם בוואטסאפ.",
      of: [
        defineArrayMember({
          type: "object",
          name: "deliveryZone",
          title: "אזור",
          fields: [
            localizedString({ name: "name", title: "שם האזור", description: "למשל: נתניה, סביבת נתניה", required: true, max: 40 }),
            defineField({ name: "fee", title: "דמי משלוח (₪)", type: "number", validation: (rule) => shekelsRule(rule) }),
            defineField({
              name: "freeAbove",
              title: "משלוח חינם מעל (₪)",
              type: "number",
              description: "לא חובה. סכום ההזמנה אחרי הנחות.",
              validation: (rule) => shekelsRule(rule, { required: false, min: 1 }),
            }),
            defineField({
              name: "cities",
              title: "ערים ויישובים",
              type: "array",
              of: [defineArrayMember({ type: "string", validation: (rule) => rule.required().min(2).max(40) })],
              options: { layout: "tags" },
              validation: (rule) => rule.required().min(1).unique(),
            }),
          ],
          preview: {
            select: { name: "name", fee: "fee", freeAbove: "freeAbove", cities: "cities" },
            prepare: ({ name, fee, freeAbove, cities }) => ({
              title: hebrew(name) ?? "אזור",
              subtitle: [`${fee ?? "?"} ₪`, typeof freeAbove === "number" ? `חינם מעל ${freeAbove} ₪` : null, `${(cities as string[] | undefined)?.length ?? 0} יישובים`]
                .filter(Boolean)
                .join(" · "),
            }),
          },
        }),
      ],
      validation: (rule) => rule.max(10).custom(citiesOnce),
    }),

    /* ───────── the launch promo ───────── */
    defineField({
      name: "launchPromo",
      title: "מבצע השקה",
      type: "object",
      group: "promo",
      description: "הנחה על מוצרי החנות (לא על מארזים ולא על בקשות מהבונה). לא מצטברת עם קופון: הלקוח מקבל את ההנחה הגדולה מביניהם.",
      options: { collapsible: false },
      fields: [
        defineField({ name: "enabled", title: "פעיל", type: "boolean", initialValue: false }),
        localizedString({ name: "label", title: "שם המבצע", description: "למשל: מבצע השקה", max: 60 }),
        defineField({
          name: "type",
          title: "סוג ההנחה",
          type: "string",
          options: {
            list: [
              { title: "אחוזים", value: "percent" },
              { title: "סכום (₪)", value: "amount" },
            ],
            layout: "radio",
            direction: "horizontal",
          },
        }),
        defineField({ name: "value", title: "גובה ההנחה", type: "number", validation: (rule) => rule.min(0).precision(2) }),
        defineField({ name: "minSubtotal", title: "בהזמנה מעל (₪)", type: "number", description: "לא חובה.", validation: (rule) => shekelsRule(rule, { required: false, min: 1 }) }),
        defineField({ name: "startsAt", title: "מתחיל", type: "datetime", options: { dateFormat: "DD/MM/YYYY", timeFormat: "HH:mm" } }),
        defineField({ name: "endsAt", title: "נגמר", type: "datetime", options: { dateFormat: "DD/MM/YYYY", timeFormat: "HH:mm" } }),
      ],
      validation: promoRules,
    }),

    /* ───────── cancellations ───────── */
    defineField({
      name: "catalogCancellationDays",
      title: "ביטול הזמנה מהחנות: עד כמה ימים לפני",
      type: "number",
      group: "policy",
      description: "עד כך וכך ימים לפני מועד המשלוח או האיסוף. עוגה מהבונה: אי אפשר לבטל אחרי שאושר מחיר.",
      initialValue: 3,
      validation: (rule) => rule.required().integer().min(0).max(30),
    }),

    /* ───────── kosher ───────── */
    defineField({
      name: "kosherAuthority",
      title: "גוף הכשרות",
      type: "string",
      group: "kosher",
      description: "לא חובה. כפי שכתוב בתעודה.",
      validation: (rule) => rule.max(80),
    }),
    defineField({
      name: "kosherCertificate",
      title: "תעודת הכשרות",
      type: "image",
      group: "kosher",
      description: "צילום של התעודה. מוצג בדף הכשרות.",
      options: { accept: "image/*" },
      fields: [altField],
    }),
    defineField({
      name: "kosherValidUntil",
      title: "בתוקף עד",
      type: "date",
      group: "kosher",
      options: { dateFormat: "DD/MM/YYYY" },
      description: "אחרי התאריך הזה האתר מפסיק להציג את התעודה, עד שמעלים חדשה.",
    }),

    /* ───────── the business ───────── */
    defineField({
      name: "legalName",
      title: "שם העסק הרשמי",
      type: "string",
      group: "business",
      description: "כפי שרשום ברשויות. מופיע בתקנון ובחשבוניות. חובה לפני ההשקה.",
      validation: (rule) => rule.max(100),
    }),
    defineField({
      name: "businessType",
      title: "סוג העסק",
      type: "string",
      group: "business",
      options: {
        list: [
          { title: "עוסק פטור", value: "exempt" },
          { title: "עוסק מורשה", value: "licensed" },
          { title: "חברה בע״מ", value: "company" },
        ],
        layout: "radio",
      },
    }),
    defineField({
      name: "businessNumber",
      title: "מספר עוסק / ח״פ",
      type: "string",
      group: "business",
      validation: (rule) => rule.custom((v: string | undefined) => (!v || /^\d{9}$/.test(v) ? true : "9 ספרות, בלי מקפים")),
    }),
    defineField({
      name: "legalAddress",
      title: "כתובת למכתבים",
      type: "string",
      group: "business",
      description: "חוק הגנת הצרכן מחייב כתובת בתקנון של מכירה באינטרנט. אפשר כתובת למכתבים או ת״ד, לא חייבים את כתובת האיסוף.",
      validation: (rule) => rule.max(120),
    }),
    defineField({
      name: "legalEmail",
      title: "מייל לפניות",
      type: "string",
      group: "business",
      validation: (rule) => rule.email().error("כתובת מייל מלאה"),
    }),
  ],
  preview: { prepare: () => ({ title: "הגדרות החנות" }) },
});
