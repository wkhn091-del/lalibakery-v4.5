/**
 * The four cake types of the cake builder on the site. They're fixed: the builder's layout (its
 * tile grid) and its logic (a number to write on number cakes, the nut-free suggestion for
 * kindergarten cakes) are built around exactly these four. The owner edits everything inside them
 * (names, photos, sizes, prices, bases, creams) but can't add, delete or reorder them.
 *
 * Each is one document with a fixed id, "category-<key>". The site reads them by that id.
 */
export const CATEGORIES = [
  { key: "number", title: "עוגות מספרים" },
  { key: "designer", title: "עוגות מעוצבות" },
  { key: "birthday", title: "עוגות יום הולדת מעוצבות" },
  { key: "kindergarten", title: "עוגות גן" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const categoryId = (key: CategoryKey) => `category-${key}`;

/** The key of a category document from its id, whether published, a draft or in a release */
export function categoryKeyOf(id: string | undefined): string | undefined {
  return id?.split(".").pop()?.replace(/^category-/, "");
}
