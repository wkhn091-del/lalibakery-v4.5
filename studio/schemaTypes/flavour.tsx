import { StackIcon } from "@sanity/icons/Stack";
import { defineField, defineType } from "sanity";
import { Swatch } from "../components/ToneInput";
import { ALLERGENS, allergensField, tasteGroupField, toneField } from "./fields";

/** A base (the cake's sponge or crust), offered by the cake types that list it */
export const flavour = defineType({
  name: "flavour",
  title: "טעם בסיס",
  type: "document",
  icon: StackIcon,
  fields: [
    defineField({
      name: "name",
      title: "שם",
      type: "string",
      description: "למשל: שוקולד",
      validation: (rule) => rule.required().max(40),
    }),
    defineField({
      name: "note",
      title: "תיאור קצר",
      type: "string",
      description: "שורה אחת מתחת לשם. למשל: ספוג שוקולד עשיר",
      validation: (rule) => rule.max(80),
    }),
    toneField,
    tasteGroupField,
    // gluten and eggs are in every sponge: the builder has its own notice for those requests
    allergensField("בסיס", ALLERGENS.filter((a) => a.value !== "gluten")),
  ],
  preview: {
    select: { title: "name", subtitle: "note", tone: "tone" },
    prepare: ({ title, subtitle, tone }) => ({ title, subtitle, media: <Swatch value={tone} size={24} /> }),
  },
});
