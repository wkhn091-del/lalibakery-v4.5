import { orderRankField, orderRankOrdering } from "@sanity/orderable-document-list";
import { ColorWheelIcon } from "@sanity/icons/ColorWheel";
import { FolderIcon } from "@sanity/icons/Folder";
import { StarIcon } from "@sanity/icons/Star";
import { defineField, defineType } from "sanity";
import { altField, slugField } from "../fields";
import { hebrew, localizedString, localizedText } from "../localized";

/*
  The shop's filters, each a list the owner grows on her own: a new occasion or style is a new
  document, and from then on it's a filter on the shop and a checkbox on every product. The order
  in the Studio's list (drag) is the order of the filters on the site.
*/

/** A shelf of the shop: עוגות, קאפקייקס, מארזים... Separate from the cake builder's four fixed types */
export const shopCategory = defineType({
  name: "shopCategory",
  title: "קטגוריה בחנות",
  type: "document",
  icon: FolderIcon,
  orderings: [orderRankOrdering],
  fields: [
    orderRankField({ type: "shopCategory", newItemPosition: "after" }),
    localizedString({ name: "title", title: "שם הקטגוריה", description: "למשל: עוגות, קאפקייקס, מארזים", required: true, max: 40 }),
    slugField(),
    localizedText({ name: "description", title: "תיאור קצר", description: "שורה או שתיים בראש דף הקטגוריה. לא חובה.", max: 200, rows: 2 }),
    defineField({
      name: "image",
      title: "תמונה",
      type: "image",
      description: "לא חובה: מופיעה בכרטיס הקטגוריה.",
      options: { hotspot: true, accept: "image/*" },
      fields: [altField],
    }),
  ],
  preview: {
    select: { title: "title", media: "image" },
    prepare: ({ title, media }) => ({ title: hebrew(title) ?? "קטגוריה בלי שם", media }),
  },
});

/** What the cake is for: יום הולדת, חתונה, בר מצווה, ברית, גן... */
export const occasion = defineType({
  name: "occasion",
  title: "אירוע",
  type: "document",
  icon: StarIcon,
  orderings: [orderRankOrdering],
  fields: [
    orderRankField({ type: "occasion", newItemPosition: "after" }),
    localizedString({ name: "title", title: "שם האירוע", description: "למשל: יום הולדת, חתונה, ברית", required: true, max: 40 }),
    slugField(),
  ],
  preview: {
    select: { title: "title" },
    prepare: ({ title }) => ({ title: hebrew(title) ?? "אירוע בלי שם" }),
  },
});

const HEX = /^#[0-9a-f]{6}$/i;

/** The look of the cake: ורוד פודרה, לבן וזהב, צבעוני, מינימליסטי... */
export const style = defineType({
  name: "style",
  title: "צבע / סגנון",
  type: "document",
  icon: ColorWheelIcon,
  orderings: [orderRankOrdering],
  fields: [
    orderRankField({ type: "style", newItemPosition: "after" }),
    localizedString({ name: "title", title: "שם", description: "למשל: ורוד פודרה, לבן וזהב, צבעוני", required: true, max: 40 }),
    slugField(),
    defineField({
      name: "swatch",
      title: "צבע לדוגמה",
      type: "string",
      description: "לא חובה. עיגול הצבע ליד הסינון באתר, בקוד hex. למשל: #F4C6CF (ורוד פודרה)",
      validation: (rule) => rule.custom((value: string | undefined) => (!value || HEX.test(value) ? true : "קוד צבע בצורה #RRGGBB, למשל #F4C6CF")),
    }),
  ],
  preview: {
    select: { title: "title", swatch: "swatch" },
    prepare: ({ title, swatch }) => ({ title: hebrew(title) ?? "סגנון בלי שם", subtitle: swatch }),
  },
});
