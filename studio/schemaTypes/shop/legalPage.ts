import { DocumentsIcon } from "@sanity/icons/Documents";
import { defineField, defineType } from "sanity";
import { hebrew, localizedBlocks, localizedString } from "../localized";

/** A legal page (../../legal.ts): five fixed documents, edited but never created or deleted */
export const legalPage = defineType({
  name: "legalPage",
  title: "דף משפטי",
  type: "document",
  icon: DocumentsIcon,
  fields: [
    localizedString({ name: "title", title: "כותרת", required: true, max: 60 }),
    defineField({
      name: "updatedAt",
      title: "עודכן לאחרונה",
      type: "date",
      options: { dateFormat: "DD/MM/YYYY" },
      description: "מופיע בראש הדף. מעדכנים בכל שינוי בתוכן.",
      validation: (rule) => rule.required(),
    }),
    localizedBlocks({
      name: "body",
      title: "תוכן",
      description: "מומלץ שעורך דין יעבור על הנוסח. אפשר כותרות, רשימות, הדגשות וקישורים.",
      required: true,
    }),
  ],
  preview: {
    select: { title: "title", updatedAt: "updatedAt" },
    prepare: ({ title, updatedAt }) => ({ title: hebrew(title) ?? "דף משפטי", subtitle: updatedAt ? `עודכן ${updatedAt}` : "עוד לא נכתב" }),
  },
});
