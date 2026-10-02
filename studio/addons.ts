import type { CategoryKey } from "./categories";

/**
 * The cake builder's add-ons. Fixed, like the four cake types: each is drawn by its own piece of
 * the 3D cake, so a new kind can't come from the Studio. The owner edits everything inside them
 * (names, descriptions, options, which cake types offer them) and can switch any off.
 * Tiers aren't here: they're a size of a cake type (category.ts), as before.
 *
 * No prices: a builder cake is a request, priced by the owner over WhatsApp.
 * Each is one document with a fixed id, "addon-<key>". The site reads them by that id.
 */
export const ADDONS = [
  { key: "piping", title: "זילוף" },
  { key: "flowers", title: "פרחים" },
  { key: "goldLeaf", title: "עלי זהב" },
  { key: "macarons", title: "מקרונים" },
  { key: "fruit", title: "תותים ופירות" },
  { key: "topper", title: "טופר" },
  { key: "sugarFigure", title: "דמות מבצק סוכר" },
  { key: "ediblePrint", title: "הדפס תמונה אכילה" },
  { key: "candles", title: "נרות ונצנצים" },
  { key: "inscription", title: "כיתוב" },
] as const;

export type AddonKey = (typeof ADDONS)[number]["key"];

export const addonId = (key: AddonKey) => `addon-${key}`;

/** The key of an add-on document from its id, whether published, a draft or in a release */
export function addonKeyOf(id: string | undefined): string | undefined {
  return id?.split(".").pop()?.replace(/^addon-/, "");
}

/** What each add-on starts with (the seed); from then on the Studio is where it lives */
export const ADDON_SEEDS: Record<
  AddonKey,
  {
    description: string;
    categories: CategoryKey[];
    options?: string[];
    colorable?: boolean;
    text?: number;
    quantity?: [min: number, max: number];
    imageByWhatsapp?: boolean;
  }
> = {
  piping: { description: "עיטור קרם מזולף סביב העוגה", categories: ["designer", "birthday", "number"], colorable: true },
  flowers: { description: "זר פרחים על העוגה", categories: ["designer", "birthday", "number"], options: ["פרחים טריים", "פרחי סוכר"], colorable: true },
  goldLeaf: { description: "עלי זהב אכילים", categories: ["designer", "birthday", "number"] },
  macarons: { description: "מקרונים על העוגה", categories: ["designer", "birthday", "number"], colorable: true, quantity: [3, 12] },
  fruit: { description: "פירות טריים על העוגה", categories: ["designer", "birthday", "number", "kindergarten"], options: ["תותים", "פירות יער", "פירות העונה"] },
  topper: { description: "שלט קישוט מעל העוגה", categories: ["designer", "birthday", "number", "kindergarten"], text: 30 },
  sugarFigure: { description: "דמות בעבודת יד מבצק סוכר", categories: ["designer", "birthday", "kindergarten"], text: 120 },
  ediblePrint: {
    description: "תמונה שלכם מודפסת על דף אכיל. את התמונה שולחים בוואטסאפ אחרי ההזמנה",
    categories: ["birthday", "kindergarten", "number"],
    imageByWhatsapp: true,
  },
  candles: { description: "נרות ונצנצים לעוגה", categories: ["designer", "birthday", "number", "kindergarten"], options: ["נרות", "נר מספר", "נצנצים"] },
  inscription: { description: "כיתוב על העוגה", categories: ["designer", "birthday", "number", "kindergarten"], text: 40, colorable: true },
};
