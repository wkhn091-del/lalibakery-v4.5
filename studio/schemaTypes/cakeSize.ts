import { defineField, defineType } from "sanity";
import { categoryKeyOf } from "../categories";

type Shape = "round" | "tiers" | "tray" | "cupcakes";
type SizeValue = { servingsMin?: number; shape?: Shape };

// number cakes are shaped like the number itself: no shape to pick, the builder draws a figure
const inNumberCategory = ({ document }: { document?: { _id?: string } }) => categoryKeyOf(document?._id) === "number";
const shapeOf = (parent: unknown): Shape => (parent as SizeValue | undefined)?.shape ?? "round";

/** A size of a cake type in the builder: its name, servings, starting price and line drawing */
export const cakeSize = defineType({
  name: "cakeSize",
  title: "גודל",
  type: "object",
  fieldsets: [
    { name: "servings", title: "כמה מנות", description: "בעוגות מספרים: לכל ספרה או אות.", options: { columns: 2 } },
    { name: "tray", title: "מידות המגש (ס״מ)", options: { columns: 2 } },
  ],
  fields: [
    defineField({
      name: "label",
      title: "שם הגודל",
      type: "string",
      description: "כמו שהלקוח יראה. למשל: קוטר 20 ס״מ",
      validation: (rule) => rule.required().max(40),
    }),
    defineField({
      name: "detail",
      title: "פירוט",
      type: "string",
      description: "לא חובה: שורה קטנה מתחת לשם. למשל: 16 ו-24 ס״מ",
      validation: (rule) => rule.max(60),
    }),
    defineField({
      name: "servingsMin",
      title: "מ-",
      type: "number",
      fieldset: "servings",
      validation: (rule) => rule.required().integer().min(1),
    }),
    defineField({
      name: "servingsMax",
      title: "עד",
      type: "number",
      fieldset: "servings",
      validation: (rule) =>
        rule
          .required()
          .integer()
          .min(1)
          .custom((max, { parent }) => {
            const min = (parent as SizeValue | undefined)?.servingsMin;
            return max == null || min == null || max >= min ? true : "צריך להיות לפחות כמו המספר שב-״מ-״";
          }),
    }),
    defineField({
      name: "price",
      title: "מחיר התחלתי (₪)",
      type: "number",
      description: "לא חובה (בלי מחיר, לא מוצג מחיר). מוצג כ״החל מ-״. בעוגות מספרים: המחיר לכל ספרה או אות, והבונה מכפיל לבד.",
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({
      name: "shape",
      title: "האיור בכרטיס",
      type: "string",
      options: {
        list: [
          { title: "עוגה עגולה", value: "round" },
          { title: "קומות", value: "tiers" },
          { title: "מגש", value: "tray" },
          { title: "קאפקייקס", value: "cupcakes" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "round",
      hidden: inNumberCategory,
    }),
    defineField({
      name: "diameter",
      title: "קוטר (ס״מ)",
      type: "number",
      description: "לגודל העיגול באיור.",
      hidden: (context) => inNumberCategory(context) || shapeOf(context.parent) !== "round",
      validation: (rule) => rule.min(8).max(60),
    }),
    defineField({
      name: "trayWidth",
      title: "רוחב",
      type: "number",
      fieldset: "tray",
      hidden: (context) => inNumberCategory(context) || shapeOf(context.parent) !== "tray",
      validation: (rule) => rule.min(10).max(80),
    }),
    defineField({
      name: "trayLength",
      title: "אורך",
      type: "number",
      fieldset: "tray",
      hidden: (context) => inNumberCategory(context) || shapeOf(context.parent) !== "tray",
      validation: (rule) => rule.min(10).max(80),
    }),
  ],
  preview: {
    select: { title: "label", min: "servingsMin", max: "servingsMax", price: "price" },
    prepare({ title, min, max, price }) {
      const servings = min == null ? null : min === max || max == null ? `${min} מנות` : `${min} עד ${max} מנות`;
      const from = typeof price === "number" ? `החל מ-${price.toLocaleString("en-US")} ₪` : null;
      return { title, subtitle: [servings, from].filter(Boolean).join(" · ") };
    },
  },
});
