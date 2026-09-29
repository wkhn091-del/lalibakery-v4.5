import { orderRankField, orderRankOrdering } from "@sanity/orderable-document-list";
import { ImagesIcon } from "@sanity/icons/Images";
import { defineField, defineType } from "sanity";
import { altField } from "./fields";

/** A cake in the homepage gallery ("עוגות שכבר יצאו מהמטבח") */
export const cake = defineType({
  name: "cake",
  title: "עוגה",
  type: "document",
  icon: ImagesIcon,
  orderings: [orderRankOrdering],
  fields: [
    // the gallery's order: drag cakes in the list. A new cake goes first.
    orderRankField({ type: "cake", newItemPosition: "before" }),
    defineField({
      name: "name",
      title: "שם העוגה",
      type: "string",
      description: "מופיע מתחת לתמונה. למשל: אדינה, 12",
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: "image",
      title: "תמונה",
      type: "image",
      description:
        "אפשר לצלם או לבחור ישר מהטלפון, בכל גודל: האתר מקטין ודוחס לבד. בגלריה התמונה נחתכת לריבוע; כדי לבחור מה חשוב שיישאר בפנים, לחצו על העיפרון שעל התמונה וסמנו את העוגה.",
      options: { hotspot: true, accept: "image/*" },
      fields: [altField],
      validation: (rule) => rule.required().error("צריך תמונה כדי שהעוגה תופיע בגלריה"),
    }),
    defineField({
      name: "description",
      title: "תיאור",
      type: "text",
      rows: 2,
      description: "משפט קצר שמופיע אחרי השם. למשל: זהב, גיבסנית וסרט סאטן",
      validation: (rule) => rule.max(160),
    }),
    defineField({
      name: "price",
      title: "מחיר התחלתי (₪)",
      type: "number",
      description: "לא חובה. אם ממלאים, מתחת לתמונה יופיע למשל: החל מ-450 ₪",
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({
      name: "category",
      title: "סוג העוגה",
      type: "reference",
      to: [{ type: "category" }],
      options: { disableNew: true },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "featured",
      title: "להציג בגלריה בדף הבית",
      type: "boolean",
      description: "לכבות כדי להסתיר את העוגה מהאתר בלי למחוק אותה.",
      initialValue: true,
    }),
  ],
  preview: {
    select: { title: "name", category: "category.title", media: "image", price: "price", featured: "featured" },
    prepare({ title, category, media, price, featured }) {
      const subtitle = [category, typeof price === "number" ? `החל מ-${price.toLocaleString("en-US")} ₪` : null, featured === false ? "מוסתרת" : null];
      return { title: title || "עוגה בלי שם", subtitle: subtitle.filter(Boolean).join(" · "), media };
    },
  },
});
