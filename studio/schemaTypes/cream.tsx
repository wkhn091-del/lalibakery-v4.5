import { DropIcon } from "@sanity/icons/Drop";
import { defineField, defineType } from "sanity";
import { Swatch } from "../components/ToneInput";
import { ALLERGENS, allergensField, tasteGroupField, toneField } from "./fields";

/** A cream (filling and coating), offered by the cake types that list it */
export const cream = defineType({
  name: "cream",
  title: "קרם",
  type: "document",
  icon: DropIcon,
  fields: [
    defineField({
      name: "name",
      title: "שם",
      type: "string",
      description: "למשל: קרמל מלוח",
      validation: (rule) => rule.required().max(40),
    }),
    toneField,
    tasteGroupField,
    allergensField("קרם"),
    defineField({
      name: "parve",
      title: "יש גם גרסה פרווה",
      type: "boolean",
      description: "אם מסמנים, לקוח שביקש בלי מוצרי חלב יוכל לבחור בקרם הזה, וההזמנה תציין שהוא יוכן פרווה.",
      initialValue: false,
      hidden: ({ document }) => !(document?.contains as string[] | undefined)?.includes("dairy"),
    }),
  ],
  preview: {
    select: { title: "name", contains: "contains", parve: "parve", tone: "tone" },
    prepare({ title, contains, parve, tone }) {
      const has = ALLERGENS.filter((a) => (contains as string[] | undefined)?.includes(a.value)).map((a) => a.title);
      const subtitle = has.length ? `מכיל: ${has.join(", ")}${parve && has.includes("מוצרי חלב") ? " (יש גרסה פרווה)" : ""}` : "בלי אלרגנים מסומנים";
      return { title, subtitle, media: <Swatch value={tone} size={24} /> };
    },
  },
});
