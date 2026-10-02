import { SparklesIcon } from "@sanity/icons/Sparkles";
import { defineArrayMember, defineField, defineType } from "sanity";
import { CATEGORIES } from "../../categories";
import { hebrew, localizedString, localizedText } from "../localized";

/**
 * An add-on of the cake builder (../../addons.ts): ten fixed documents. The owner edits them but
 * can't create or delete them. Never a price: builder cakes are priced over WhatsApp.
 */
export const builderAddon = defineType({
  name: "builderAddon",
  title: "תוספת בבונה",
  type: "document",
  icon: SparklesIcon,
  fields: [
    localizedString({ name: "title", title: "שם התוספת", required: true, max: 40 }),
    localizedText({ name: "description", title: "תיאור קצר", description: "שורה אחת מתחת לשם בבונה.", max: 160, rows: 2 }),
    defineField({
      name: "available",
      title: "מוצגת בבונה",
      type: "boolean",
      description: "לכבות כדי שהתוספת לא תופיע בבונה (למשל כשאין פרחים טריים בעונה).",
      initialValue: true,
    }),
    defineField({
      name: "categories",
      title: "בסוגי העוגות",
      type: "array",
      description: "באילו סוגי עוגות התוספת מופיעה.",
      of: [defineArrayMember({ type: "string" })],
      options: { list: CATEGORIES.map(({ key, title }) => ({ title, value: key })), layout: "grid" },
      validation: (rule) => rule.required().min(1).error("בחרו לפחות סוג עוגה אחד").unique(),
    }),
    defineField({
      name: "options",
      title: "אפשרויות לבחירה",
      type: "array",
      description: "לא חובה. למשל בפרחים: טריים או מסוכר. הלקוח בוחר אחת.",
      of: [
        defineArrayMember({
          type: "object",
          name: "addonOption",
          title: "אפשרות",
          fields: [localizedString({ name: "label", title: "שם האפשרות", required: true, max: 40 })],
          preview: { select: { label: "label" }, prepare: ({ label }) => ({ title: hebrew(label) ?? "אפשרות בלי שם" }) },
        }),
      ],
      validation: (rule) => rule.max(12),
    }),
    defineField({
      name: "colorable",
      title: "הלקוח בוחר צבע",
      type: "boolean",
      description: "מוסיף בחירת צבע לתוספת (מפלטת הצבעים של הבונה).",
      initialValue: false,
    }),
    defineField({
      name: "textMax",
      title: "טקסט חופשי: עד כמה תווים",
      type: "number",
      description: "לא חובה. למשל בכיתוב: 40. ריק או 0: בלי טקסט.",
      validation: (rule) => rule.integer().min(0).max(200),
    }),
    defineField({
      name: "quantity",
      title: "כמות לבחירה",
      type: "object",
      description: "לא חובה. למשל במקרונים: מ-3 עד 12.",
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({ name: "min", title: "מ-", type: "number", validation: (rule) => rule.integer().min(1).max(100) }),
        defineField({
          name: "max",
          title: "עד",
          type: "number",
          validation: (rule) =>
            rule
              .integer()
              .min(1)
              .max(100)
              .custom((max: number | undefined, { parent }) => {
                const min = (parent as { min?: number } | undefined)?.min;
                if (max === undefined && min === undefined) return true;
                if (max === undefined || min === undefined) return "ממלאים את שני המספרים, או אף אחד";
                return max >= min ? true : "״עד״ לא יכול להיות פחות מ״מ-״";
              }),
        }),
      ],
    }),
    defineField({
      name: "imageByWhatsapp",
      title: "הלקוח שולח תמונה בוואטסאפ",
      type: "boolean",
      description: "לתוספת שצריכה תמונה מהלקוח (הדפס אכיל): אחרי ההזמנה מופיעה לו תזכורת לשלוח אותה בוואטסאפ. האתר עצמו לא מקבל תמונות.",
      initialValue: false,
    }),
  ],
  preview: {
    select: { title: "title", available: "available" },
    prepare: ({ title, available }) => ({ title: hebrew(title) ?? "תוספת", subtitle: available === false ? "מוסתרת" : undefined }),
  },
});
