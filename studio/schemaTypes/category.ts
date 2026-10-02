import { ThLargeIcon } from "@sanity/icons/ThLarge";
import { defineArrayMember, defineField, defineType } from "sanity";
import { categoryKeyOf } from "../categories";
import { altField } from "./fields";

// these two tiles are designed around a photo; the other two have a drawing of their own
const NEEDS_PHOTO = new Set(["designer", "birthday"]);

/**
 * A cake type in the cake builder. Four fixed documents (see categories.ts): the owner edits them,
 * but can't create, delete or reorder them.
 */
export const category = defineType({
  name: "category",
  title: "סוג עוגה",
  type: "document",
  icon: ThLargeIcon,
  fields: [
    defineField({
      name: "title",
      title: "שם הסוג",
      type: "string",
      description: "הכותרת על הכרטיס בבונה העוגה.",
      validation: (rule) => rule.required().max(40),
    }),
    defineField({
      name: "blurb",
      title: "תיאור קצר",
      type: "string",
      description: "שורה אחת מתחת לכותרת.",
      validation: (rule) => rule.max(80),
    }),
    defineField({
      name: "image",
      title: "תמונה לכרטיס",
      type: "image",
      description: "בעוגות מספרים ובעוגות גן לא חובה: בלי תמונה, הכרטיס מציג איור. אחרי ההעלאה, לחצו על העיפרון וסמנו את העוגה, כדי שהיא תישאר במרכז בכל גודל מסך.",
      options: { hotspot: true, accept: "image/*" },
      fields: [altField],
      validation: (rule) =>
        rule.custom((value: { asset?: unknown } | undefined, { document }) =>
          value?.asset || !NEEDS_PHOTO.has(categoryKeyOf(document?._id) ?? "") ? true : "לסוג הזה צריך תמונה: הכרטיס שלו מעוצב סביב צילום",
        ),
    }),
    defineField({
      name: "gallery",
      title: "תמונות נוספות לכרטיס",
      type: "array",
      description: "לא חובה. כשיש כאן תמונות, הכרטיס מחליף לאט בין התמונה הראשית לבין אלה. בכל תמונה, סמנו בעיפרון את העוגה.",
      of: [defineArrayMember({ type: "image", options: { hotspot: true, accept: "image/*" }, fields: [altField] })],
      hidden: ({ document }) => !(document?.image as { asset?: unknown } | undefined)?.asset,
      validation: (rule) => rule.max(5),
    }),
    defineField({
      name: "sizes",
      title: "גדלים ומחירים",
      type: "array",
      description: "בסדר שבו יופיעו ללקוח (אפשר לגרור). בין 1 ל-6 גדלים.",
      of: [defineArrayMember({ type: "cakeSize" })],
      validation: (rule) => rule.required().min(1).max(6),
    }),
    defineField({
      name: "bases",
      title: "טעמי בסיס",
      type: "array",
      description: "הטעמים שאפשר לבחור לסוג הזה. טעם חדש מוסיפים קודם ברשימת ״טעמי בסיס״. הראשון ברשימה הוא ברירת המחדל שהעוגה מתחילה ממנה.",
      of: [defineArrayMember({ type: "reference", to: [{ type: "flavour" }], options: { disableNew: true } })],
      validation: (rule) => rule.required().min(1).unique(),
    }),
    defineField({
      name: "creams",
      title: "קרמים",
      type: "array",
      description: "הקרמים שאפשר לבחור לסוג הזה. קרם חדש מוסיפים קודם ברשימת ״קרמים״. הראשון ברשימה הוא ברירת המחדל.",
      of: [defineArrayMember({ type: "reference", to: [{ type: "cream" }], options: { disableNew: true } })],
      validation: (rule) => rule.required().min(1).unique(),
    }),
    defineField({
      name: "fillings",
      title: "מילויים",
      type: "array",
      description: "לא חובה: המילויים שאפשר להוסיף בין השכבות. מילוי חדש מוסיפים קודם ברשימת ״מילויים״. העוגה מתחילה בלי מילוי.",
      of: [defineArrayMember({ type: "reference", to: [{ type: "filling" }], options: { disableNew: true } })],
      validation: (rule) => rule.unique(),
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "blurb", media: "image" },
  },
});
