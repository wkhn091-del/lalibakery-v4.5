/**
 * The event themes the cake builder asks about, and the gallery of the bakery's own cakes is
 * filtered by. Fixed: the site keeps them in the order (by id), so a theme can't come from the
 * Studio. A cake in the Studio is tagged with any of them (schemaTypes/cake.ts).
 */
export const THEMES = [
  { id: "bat-mitzvah", label: "בת מצווה" },
  { id: "bar-mitzvah", label: "בר מצווה" },
  { id: "kids", label: "יום הולדת לילדים" },
  { id: "adult", label: "יום הולדת למבוגרים" },
  { id: "football", label: "כדורגל" },
  { id: "princess", label: "נסיכות ומלכות" },
  { id: "unicorn", label: "יוניקורן" },
  { id: "animals", label: "חיות וספארי" },
  { id: "vintage", label: "וינטג'" },
  { id: "gold", label: "זהב ואלגנטי" },
  { id: "flowers", label: "פרחים" },
  { id: "minimal", label: "מינימליסטי" },
  { id: "wedding", label: "חתונה ואירוסין" },
  { id: "baby", label: "לידה וברית" },
  { id: "holiday", label: "חגים" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
