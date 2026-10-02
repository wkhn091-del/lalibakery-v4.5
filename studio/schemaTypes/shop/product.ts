import { orderRankField, orderRankOrdering } from "@sanity/orderable-document-list";
import { BasketIcon } from "@sanity/icons/Basket";
import { PackageIcon } from "@sanity/icons/Package";
import { defineArrayMember, defineField, defineType, type ValidationContext } from "sanity";
import { VariantKeyInput } from "../../components/VariantKeyInput";
import { requiredAltField, shekelsRule, slugField } from "../fields";
import { hebrew, localizedString, localizedText } from "../localized";

/*
  A product of the shop, sold at a fixed price and paid at checkout (the cake builder's cakes are
  requests, priced over WhatsApp: they're the four "category" documents, not products).

  The prices typed here are what the site shows, and what the server charges: the server reads them
  from here at checkout, so a price a visitor's browser sends is never used. A size's internal key
  (`_key`, created by the Studio) is what the cart and the orders keep, so renaming or repricing a
  size never breaks a cart or an old order.
*/

export const ALLERGENS = [
  { value: "gluten", title: "גלוטן" },
  { value: "eggs", title: "ביצים" },
  { value: "dairy", title: "חלב" },
  { value: "nuts", title: "אגוזים" },
  { value: "peanuts", title: "בוטנים" },
  { value: "soy", title: "סויה" },
  { value: "sesame", title: "שומשום" },
] as const;

export const MAX_VARIANTS = 8;
export const MAX_BUNDLE_QUANTITY = 48;

/** A size of a product, with its price */
export const productVariant = defineType({
  name: "productVariant",
  title: "גודל",
  type: "object",
  fields: [
    localizedString({ name: "label", title: "שם הגודל", description: "למשל: קוטר 20 ס״מ, מארז 12, שתי קומות", required: true, max: 40 }),
    defineField({
      name: "servingsMin",
      title: "מנות: מ-",
      type: "number",
      description: "לסינון לפי מספר סועדים. לא חובה (למשל במארז קאפקייקס).",
      validation: (rule) => rule.integer().min(1).max(500),
    }),
    defineField({
      name: "servingsMax",
      title: "מנות: עד",
      type: "number",
      validation: (rule) =>
        rule
          .integer()
          .min(1)
          .max(500)
          .custom((max: number | undefined, { parent }) => {
            const min = (parent as { servingsMin?: number } | undefined)?.servingsMin;
            if (max === undefined) return typeof min === "number" ? "ממלאים את שני המספרים, או אף אחד" : true;
            if (typeof min !== "number") return "ממלאים את שני המספרים, או אף אחד";
            return max >= min ? true : "״עד״ לא יכול להיות פחות מ״מ-״";
          }),
    }),
    defineField({
      name: "price",
      title: "מחיר (₪)",
      type: "number",
      description: "המחיר הסופי ללקוח, כולל מע״מ. משלוח והנחות מחושבים בנפרד.",
      validation: (rule) => shekelsRule(rule, { min: 1 }),
    }),
    defineField({
      name: "available",
      title: "זמין להזמנה",
      type: "boolean",
      description: "לכבות כשהגודל הזה זמנית לא נמכר. הוא יופיע באתר כ״לא זמין כרגע״.",
      initialValue: true,
    }),
  ],
  preview: {
    select: { label: "label", price: "price", min: "servingsMin", max: "servingsMax", available: "available" },
    prepare({ label, price, min, max, available }) {
      const servings = typeof min === "number" && typeof max === "number" ? (min === max ? `${min} מנות` : `${min}–${max} מנות`) : null;
      const subtitle = [typeof price === "number" ? `${price} ₪` : "אין מחיר", servings, available === false ? "לא זמין" : null];
      return { title: hebrew(label) ?? "גודל בלי שם", subtitle: subtitle.filter(Boolean).join(" · ") };
    },
  },
});

const baseId = (id: string | undefined) => (id ?? "").replace(/^drafts\./, "").replace(/^versions\.[^.]+\./, "");

type BundleItemValue = { product?: { _ref?: string }; variantKey?: string };

async function variantExists(value: string | undefined, context: ValidationContext) {
  if (!value) return "בחרו גודל";
  const ref = (context.parent as BundleItemValue | undefined)?.product?._ref;
  if (!ref) return true; // the product field says what's missing
  const keys = await context
    .getClient({ apiVersion: "2025-09-01" })
    .fetch<string[] | null>(`coalesce(*[_id == $id][0], *[_id == "drafts." + $id][0]).variants[]._key`, { id: ref });
  return keys?.includes(value) ? true : "הגודל הזה כבר לא קיים במוצר: בחרו גודל אחר";
}

/** One line of a bundle: a product, its size, how many */
export const bundleItem = defineType({
  name: "bundleItem",
  title: "פריט במארז",
  type: "object",
  fields: [
    defineField({
      name: "product",
      title: "מוצר",
      type: "reference",
      to: [{ type: "product" }],
      options: {
        disableNew: true,
        // a bundle holds single products only, and never itself
        filter: ({ document }) => ({ filter: `kind != "bundle" && _id != $id && _id != "drafts." + $id`, params: { id: baseId(document._id) } }),
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "variantKey",
      title: "גודל",
      type: "string",
      components: { input: VariantKeyInput },
      validation: (rule) => rule.custom(variantExists),
    }),
    defineField({
      name: "quantity",
      title: "כמות",
      type: "number",
      initialValue: 1,
      validation: (rule) => rule.required().integer().min(1).max(MAX_BUNDLE_QUANTITY),
    }),
  ],
  preview: {
    select: { title: "product.title", quantity: "quantity", media: "product.images.0" },
    prepare: ({ title, quantity, media }) => ({ title: `${quantity ?? 1} × ${hebrew(title) ?? "מוצר"}`, media }),
  },
});

type ProductDoc = {
  kind?: "single" | "bundle";
  kosher?: "dairy" | "parve";
  diet?: { glutenFreeRecipe?: boolean; nutFree?: boolean; noAddedSugar?: boolean };
  allergens?: string[];
};

export const product = defineType({
  name: "product",
  title: "מוצר",
  type: "document",
  icon: BasketIcon,
  orderings: [orderRankOrdering],
  groups: [
    { name: "main", title: "פרטים", default: true },
    { name: "sale", title: "גדלים ומחירים" },
    { name: "filters", title: "סינון" },
    { name: "health", title: "כשרות ואלרגנים" },
    { name: "seo", title: "גוגל" },
  ],
  fields: [
    orderRankField({ type: "product", newItemPosition: "before" }),
    defineField({
      name: "kind",
      title: "סוג",
      type: "string",
      group: "main",
      description: "מארז הוא כמה מוצרים יחד במחיר אחד (למשל עוגה ו-12 קאפקייקס). על מארזים לא חלים קופונים.",
      options: {
        list: [
          { title: "מוצר", value: "single" },
          { title: "מארז", value: "bundle" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "single",
      validation: (rule) => rule.required(),
    }),
    localizedString({ name: "title", title: "שם המוצר", required: true, max: 80, group: "main" }),
    slugField("title.he", "main"),
    defineField({
      name: "shopCategory",
      title: "קטגוריה",
      type: "reference",
      group: "main",
      to: [{ type: "shopCategory" }],
      options: { disableNew: true },
      validation: (rule) => rule.required(),
    }),
    localizedText({ name: "summary", title: "שורה בכרטיס", description: "מופיעה מתחת לשם ברשימת המוצרים.", max: 160, rows: 2, group: "main" }),
    localizedText({ name: "description", title: "תיאור מלא", description: "בדף המוצר. טקסט רגיל: שורה ריקה מפרידה בין פסקאות.", max: 1500, rows: 6, group: "main" }),
    defineField({
      name: "images",
      title: "תמונות",
      type: "array",
      group: "main",
      description: "בין 1 ל-8. הראשונה היא התמונה בכרטיס. אפשר לגרור כדי לשנות סדר. בכל גודל: האתר מקטין ודוחס לבד.",
      of: [defineArrayMember({ type: "image", options: { hotspot: true, accept: "image/*" }, fields: [requiredAltField] })],
      validation: (rule) => rule.required().min(1).error("צריך לפחות תמונה אחת").max(8),
    }),
    defineField({
      name: "variants",
      title: "גדלים ומחירים",
      type: "array",
      group: "sale",
      description: `בסדר שבו יופיעו ללקוח. במוצר: 1 עד ${MAX_VARIANTS} גדלים. במארז: גודל אחד בדיוק, שהוא מחיר המארז.`,
      of: [defineArrayMember({ type: "productVariant" })],
      validation: (rule) =>
        rule
          .required()
          .min(1)
          .error("צריך לפחות גודל אחד עם מחיר")
          .max(MAX_VARIANTS)
          .custom((value: unknown[] | undefined, { document }) =>
            (document as ProductDoc | undefined)?.kind === "bundle" && (value?.length ?? 0) !== 1 ? "למארז יש גודל אחד בדיוק: מחיר המארז" : true,
          ),
    }),
    defineField({
      name: "bundleItems",
      title: "מה יש במארז",
      type: "array",
      group: "sale",
      hidden: ({ document }) => (document as ProductDoc | undefined)?.kind !== "bundle",
      of: [defineArrayMember({ type: "bundleItem" })],
      validation: (rule) =>
        rule.custom((value: BundleItemValue[] | undefined, { document }) => {
          if ((document as ProductDoc | undefined)?.kind !== "bundle") return true;
          if (!value?.length) return "מוסיפים את המוצרים שבמארז";
          if (value.length > 12) return "עד 12 שורות במארז";
          const seen = new Set<string>();
          for (const item of value) {
            const id = `${item.product?._ref}:${item.variantKey}`;
            if (seen.has(id)) return "אותו מוצר באותו גודל מופיע פעמיים: מגדילים את הכמות במקום";
            seen.add(id);
          }
          return true;
        }),
    }),
    defineField({
      name: "available",
      title: "מוצג בחנות",
      type: "boolean",
      group: "sale",
      description: "לכבות כדי להסתיר את המוצר מהאתר בלי למחוק אותו.",
      initialValue: true,
    }),
    defineField({
      name: "featured",
      title: "מומלץ בדף הבית",
      type: "boolean",
      group: "sale",
      initialValue: false,
    }),
    defineField({
      name: "occasions",
      title: "אירועים",
      type: "array",
      group: "filters",
      description: "לאילו אירועים המוצר מתאים. אירוע חדש מוסיפים קודם ברשימת ״אירועים״.",
      of: [defineArrayMember({ type: "reference", to: [{ type: "occasion" }], options: { disableNew: true } })],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: "styles",
      title: "צבע / סגנון",
      type: "array",
      group: "filters",
      of: [defineArrayMember({ type: "reference", to: [{ type: "style" }], options: { disableNew: true } })],
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: "kosher",
      title: "כשרות",
      type: "string",
      group: "health",
      options: {
        list: [
          { title: "חלבי", value: "dairy" },
          { title: "פרווה", value: "parve" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "diet",
      title: "התאמות תזונתיות",
      type: "object",
      group: "health",
      description: "מסמנים רק מה שנכון למתכון. באתר מופיע הנוסח הזהיר שליד כל סימון.",
      options: { collapsible: false },
      fields: [
        defineField({
          name: "glutenFreeRecipe",
          title: "מתכון ללא גלוטן",
          type: "boolean",
          description: "באתר: ״מתכון ללא גלוטן, מוכן במטבח שמעבד גלוטן״. לא ״ללא גלוטן״ סתם: המטבח לא נקי מגלוטן.",
          initialValue: false,
        }),
        defineField({
          name: "noAddedSugar",
          title: "ללא תוספת סוכר",
          type: "boolean",
          description: "באתר: ״ללא תוספת סוכר״. לא ״ללא סוכר״: בפירות, בחלב ובקמח יש סוכר משלהם.",
          initialValue: false,
        }),
        defineField({
          name: "nutFree",
          title: "מתכון ללא אגוזים ובוטנים",
          type: "boolean",
          description: "באתר: ״מתכון ללא אגוזים ובוטנים, מוכן במטבח שמעבד אגוזים״.",
          initialValue: false,
        }),
      ],
    }),
    defineField({
      name: "allergens",
      title: "מכיל",
      type: "array",
      group: "health",
      description: "כל האלרגנים שבמוצר. מופיעים בדף המוצר תחת ״מכיל״.",
      of: [defineArrayMember({ type: "string" })],
      options: { list: ALLERGENS.map(({ title, value }) => ({ title, value })), layout: "grid" },
      validation: (rule) =>
        rule.unique().custom((value: string[] | undefined, { document }) => {
          const doc = document as ProductDoc | undefined;
          const has = new Set(value ?? []);
          if (doc?.diet?.glutenFreeRecipe && has.has("gluten")) return "המוצר מסומן ״מתכון ללא גלוטן״ אבל גם ״מכיל גלוטן״: אחד מהם לא נכון";
          if (doc?.diet?.nutFree && (has.has("nuts") || has.has("peanuts"))) return "המוצר מסומן ״ללא אגוזים ובוטנים״ אבל גם מכיל אותם: אחד מהם לא נכון";
          if (doc?.kosher === "parve" && has.has("dairy")) return "מוצר פרווה לא יכול להכיל חלב: משנים לחלבי, או מורידים את החלב";
          return true;
        }),
    }),
    localizedText({ name: "seoDescription", title: "תיאור לגוגל", description: "מה שמופיע מתחת לשם בתוצאות החיפוש. לא חובה: בלעדיו, השורה שבכרטיס.", max: 160, rows: 2, group: "seo" }),
  ],
  preview: {
    select: { title: "title", kind: "kind", category: "shopCategory.title", media: "images.0", price: "variants.0.price", available: "available" },
    prepare({ title, kind, category, media, price, available }) {
      const subtitle = [
        kind === "bundle" ? "מארז" : hebrew(category),
        typeof price === "number" ? `${price} ₪` : "אין מחיר",
        available === false ? "מוסתר" : null,
      ];
      return { title: hebrew(title) ?? "מוצר בלי שם", subtitle: subtitle.filter(Boolean).join(" · "), media: media ?? (kind === "bundle" ? PackageIcon : undefined) };
    },
  },
});
