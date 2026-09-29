/*
  The cake builder's model: the built-in catalog, the draft the wizard edits, and the rules that
  turn a draft into an order (servings, starting price, allergen conflicts, the summary text).
  No React here: the wizard (components/CustomCakeWizard.tsx) and the server
  (lib/order/validate.ts) compute exactly the same thing from it.
*/
import { PRICE_FROM, priceText } from "@/lib/price";
import { fill } from "@/lib/text";

/* ─────────────────────────── המילים ───────────────────────────
   כל מה שההזמנה אומרת: שורות הסיכום וההודעה בוואטסאפ, המנות והמחיר, ההתנגשויות וההערות, שמות
   הצבעים ובקשות ההסרה. הבונה מקבל אותן מה-CMS ("דף הזמנת עוגה" ב-Studio), והבדיקה בשרת יכולה
   לקבל אותן משם; אלה המובנות (ואותן ה-seed טוען ל-CMS בהתחלה). */

export type ColorKey = "cream" | "blush" | "peach" | "sky" | "sage" | "lilac" | "gold" | "black";
export type ExclusionKey = "noNuts" | "noDairy" | "noGluten" | "noEggs" | "noColors" | "noAlcohol";
export type OrderWords = {
  /** the WhatsApp message's first line */
  greeting: string;
  /** "surprise me", as a colour */
  surprise: string;
  none: string;
  allergyYes: string;
  parve: string;
  /** "{n} מנות", and "כ-{min} עד {max} מנות" */
  servings: string;
  servingsRange: string;
  /** "החל מ-{price}": set from the site settings, one format for the whole site */
  priceFrom: string;
  labels: {
    category: string;
    figure: string;
    size: string;
    price: string;
    base: string;
    cream: string;
    colors: string;
    idea: string;
    message: string;
    exclusions: string;
    allergy: string;
    notes: string;
    date: string;
  };
  colors: Record<ColorKey, string>;
  exclusions: Record<ExclusionKey, { label: string; note: string }>;
  /** why a cream doesn't suit a removal request */
  clash: { nuts: string; dairy: string; gluten: string };
  /** "הקרם שבחרתם ({cream}) {reason}, וביקשתם {request}." */
  conflict: string;
  conflictFix: string;
  notices: { gluten: string; eggs: string };
};

export const ORDER_WORDS: OrderWords = {
  greeting: "שלום! אשמח להזמין עוגה בהתאמה אישית מ-LALIBAKERY.",
  surprise: "תבחרו אתם",
  none: "אין",
  allergyYes: "כן, יש אלרגיה אצל אחד האורחים",
  parve: "בגרסה פרווה",
  servings: "{n} מנות",
  // "8 עד 10", לא "8–10": מקף או × בין מספרים מתהפכים בשורה מימין לשמאל (גם בוואטסאפ)
  servingsRange: "כ-{min} עד {max} מנות",
  priceFrom: PRICE_FROM,
  labels: {
    category: "סוג העוגה",
    figure: "ספרה או אות",
    size: "גודל",
    price: "מחיר",
    base: "בסיס",
    cream: "קרם",
    colors: "צבעים",
    idea: "נושא או השראה",
    message: "כיתוב על העוגה",
    exclusions: "בקשות הסרה",
    allergy: "אלרגיה",
    notes: "בקשות נוספות",
    date: "תאריך",
  },
  colors: {
    cream: "לבן שמנת",
    blush: "ורוד עתיק",
    peach: "אפרסק",
    sky: "תכלת",
    sage: "ירוק מרווה",
    lilac: "לילך",
    gold: "זהב",
    black: "שחור",
  },
  exclusions: {
    noNuts: { label: "ללא אגוזים ובוטנים", note: "כולל שקדים, פיסטוק ואגוזי לוז" },
    noDairy: { label: "ללא מוצרי חלב", note: "עוגה פרווה" },
    noGluten: { label: "ללא גלוטן", note: "דורש התאמה של הבסיס" },
    noEggs: { label: "ללא ביצים", note: "דורש התאמה של הבסיס" },
    noColors: { label: "ללא צבעי מאכל מלאכותיים", note: "רק צבעים טבעיים" },
    noAlcohol: { label: "ללא אלכוהול", note: "גם לא בקרם ובסירופ" },
  },
  clash: { nuts: "מכיל אגוזים", dairy: "חלבי ואין לו גרסה פרווה", gluten: "מכיל גלוטן" },
  conflict: "הקרם שבחרתם ({cream}) {reason}, וביקשתם {request}.",
  conflictFix: "בחירת קרם אחר",
  notices: {
    gluten: "ללא גלוטן: הבסיס דורש התאמה. נבדוק ונאשר איתכם לפני ההזמנה.",
    eggs: "ללא ביצים: הבסיס דורש התאמה. נבדוק ונאשר איתכם לפני ההזמנה.",
  },
};

/* ─────────────────────────── הקטלוג ───────────────────────────
   הקטלוג המובנה: משמש כשה-CMS עוד לא מוגדר (ואותו תוכן נטען ל-CMS בהתחלה, studio/seed).
   ⚠ ברירות מחדל סבירות: לאשר מול הלקוחה את הגדלים, מספרי המנות, הטעמים והקרמים לפני עלייה לאוויר. */

export type CategoryId = "number" | "designer" | "birthday" | "kindergarten";
export type ExclusionId = "no-nuts" | "no-dairy" | "no-gluten" | "no-eggs" | "no-colors" | "no-alcohol";
export type Allergen = "dairy" | "nuts" | "gluten";

export type SizeVisual =
  | { kind: "round"; cm: number }
  | { kind: "tiers" }
  | { kind: "tray"; w: number; h: number }
  | { kind: "figure"; scale: number }
  | { kind: "cupcakes" };
export type Size = {
  id: string;
  label: string;
  detail?: string;
  /** מנות, מ-עד. בעוגת מספרים: לכל ספרה או אות */
  servings: [number, number];
  perFigure?: boolean;
  /** מחיר התחלתי בשקלים (בעוגת מספרים: לכל ספרה או אות). בלי מחיר, לא מוצג מחיר */
  price?: number;
  visual: SizeVisual;
};
export type Flavour = { id: string; label: string; note: string; tone: string | [string, string] };
export type Category = {
  id: CategoryId;
  title: string;
  blurb: string;
  /** צילום אמיתי של עוגה מהסוג הזה (מה-CMS: בכמה גדלים, ונקודת המיקוד שנבחרה). בלי צילום, הכרטיס מצויר */
  image?: { src: string; alt: string; srcSet?: string; position?: string };
  /** עוגת מספרים: הלקוח כותב את הספרה או האות */
  figure?: boolean;
  sizes: Size[];
  bases: Flavour[];
  creams: string[];
};
export type Cream = { id: string; label: string; tone: string | [string, string]; contains: Allergen[]; /** אפשר להכין בגרסה פרווה */ parve?: boolean };

const FLAVOURS = {
  vanilla: { id: "vanilla", label: "וניל", note: "ספוג וניל רך ואוורירי", tone: "#EFD9A8" },
  chocolate: { id: "chocolate", label: "שוקולד", note: "ספוג שוקולד עשיר", tone: "#5C3B2C" },
  redVelvet: { id: "red-velvet", label: "רד וולווט", note: "ספוג קטיפתי בגוון אדום עמוק", tone: "#9A2E36" },
  lemon: { id: "lemon", label: "לימון", note: "ספוג לימון רענן", tone: "#F0DC86" },
  marble: { id: "marble", label: "שיש", note: "וניל ושוקולד, מעורבלים", tone: ["#EFD9A8", "#5C3B2C"] as [string, string] },
  fudge: { id: "fudge", label: "פאדג' שוקולד", note: "שוקולד דחוס ולח", tone: "#3F2519" },
  sableVanilla: { id: "sable-vanilla", label: "בצק פריך וניל", note: "שתי שכבות פריכות בצורת הספרה", tone: "#E4C28C" },
  sableChocolate: { id: "sable-chocolate", label: "בצק פריך שוקולד", note: "פריך, עם קקאו", tone: "#6B4533" },
  spongeVanilla: { id: "sponge-vanilla", label: "ספוג וניל", note: "גרסה רכה של עוגת המספרים", tone: "#F0DDB0" },
} satisfies Record<string, Flavour>;

const CREAMS: Cream[] = [
  { id: "vanilla", label: "וניל", tone: "#F5E9CF", contains: ["dairy"], parve: true },
  { id: "chocolate", label: "גנאש שוקולד", tone: "#6A4331", contains: ["dairy"], parve: true },
  { id: "cream-cheese", label: "קרם גבינה", tone: "#FBF5EA", contains: ["dairy"] },
  { id: "mascarpone", label: "מסקרפונה", tone: "#F7EDD6", contains: ["dairy"] },
  { id: "white-chocolate", label: "שוקולד לבן", tone: "#F3E7CF", contains: ["dairy"] },
  { id: "salted-caramel", label: "קרמל מלוח", tone: "#C68A4C", contains: ["dairy"] },
  { id: "pistachio", label: "פיסטוק", tone: "#B5BF86", contains: ["dairy", "nuts"] },
  { id: "berries", label: "פירות יער", tone: "#B45872", contains: ["dairy"], parve: true },
  { id: "lotus", label: "לוטוס", tone: "#C48A57", contains: ["dairy", "gluten"] },
];

export const CATEGORIES: Category[] = [
  {
    id: "number",
    title: "עוגות מספרים",
    blurb: "ספרה או אות בשתי קומות, עם קרם ועיטורים",
    figure: true,
    sizes: [
      { id: "regular", label: "גודל רגיל", detail: "כ-30 ס״מ לכל ספרה", servings: [12, 15], perFigure: true, visual: { kind: "figure", scale: 0.8 } },
      { id: "large", label: "גודל גדול", detail: "כ-40 ס״מ לכל ספרה", servings: [20, 25], perFigure: true, visual: { kind: "figure", scale: 1 } },
    ],
    bases: [FLAVOURS.sableVanilla, FLAVOURS.sableChocolate, FLAVOURS.spongeVanilla],
    creams: ["cream-cheese", "mascarpone", "white-chocolate", "chocolate", "pistachio"],
  },
  {
    id: "designer",
    title: "עוגות מעוצבות",
    blurb: "עוגה גבוהה בעיצוב אישי, לכל אירוע",
    image: { src: "/images/closing.jpg", alt: "עוגת וינטג' לבנה עם סרטים שחורים" },
    sizes: [
      { id: "d16", label: "קוטר 16 ס״מ", servings: [8, 10], visual: { kind: "round", cm: 16 } },
      { id: "d20", label: "קוטר 20 ס״מ", servings: [14, 18], visual: { kind: "round", cm: 20 } },
      { id: "d24", label: "קוטר 24 ס״מ", servings: [22, 28], visual: { kind: "round", cm: 24 } },
      { id: "tiers", label: "שתי קומות", detail: "16 ו-24 ס״מ", servings: [35, 45], visual: { kind: "tiers" } },
    ],
    bases: [FLAVOURS.vanilla, FLAVOURS.chocolate, FLAVOURS.redVelvet, FLAVOURS.lemon, FLAVOURS.marble],
    creams: ["vanilla", "chocolate", "salted-caramel", "pistachio", "berries", "cream-cheese", "lotus"],
  },
  {
    id: "birthday",
    title: "עוגות יום הולדת מעוצבות",
    blurb: "השם, הגיל והעיצוב שבחרתם",
    image: { src: "/images/deliverables.jpg", alt: "עוגה לבנה עם גיל ושם בזהב, ופרחים לבנים סביבה" },
    sizes: [
      { id: "d18", label: "קוטר 18 ס״מ", servings: [10, 12], visual: { kind: "round", cm: 18 } },
      { id: "d22", label: "קוטר 22 ס״מ", servings: [16, 20], visual: { kind: "round", cm: 22 } },
      { id: "d26", label: "קוטר 26 ס״מ", servings: [25, 30], visual: { kind: "round", cm: 26 } },
    ],
    bases: [FLAVOURS.vanilla, FLAVOURS.chocolate, FLAVOURS.marble, FLAVOURS.fudge],
    creams: ["vanilla", "chocolate", "salted-caramel", "berries", "lotus", "cream-cheese"],
  },
  {
    id: "kindergarten",
    title: "עוגות גן",
    blurb: "מגש חתוך למנות אישיות, לחגיגה בגן",
    sizes: [
      { id: "tray-s", label: "מגש 20 על 30 ס״מ", servings: [20, 24], visual: { kind: "tray", w: 30, h: 20 } },
      { id: "tray-l", label: "מגש 30 על 40 ס״מ", servings: [35, 40], visual: { kind: "tray", w: 40, h: 30 } },
      { id: "cupcakes", label: "30 קאפקייקס", detail: "לכל ילד אחד משלו", servings: [30, 30], visual: { kind: "cupcakes" } },
    ],
    bases: [FLAVOURS.vanilla, FLAVOURS.chocolate, FLAVOURS.marble],
    creams: ["vanilla", "chocolate", "berries"],
  },
];

/** the design colours, in the wizard's order (their names: ORDER_WORDS.colors) */
export const COLORS: { id: ColorKey; hex: string }[] = [
  { id: "cream", hex: "#F6F0E6" },
  { id: "blush", hex: "#E4B4B2" },
  { id: "peach", hex: "#F1C5A4" },
  { id: "sky", hex: "#BCD3E5" },
  { id: "sage", hex: "#B6C4A3" },
  { id: "lilac", hex: "#C9B9DA" },
  { id: "gold", hex: "#C5A15C" },
  { id: "black", hex: "#2B2421" },
];
export const SURPRISE = "surprise";
export const MAX_COLORS = 3;

/** the removal requests, in the wizard's order (their words: ORDER_WORDS.exclusions) */
export const EXCLUSIONS: { id: ExclusionId; key: ExclusionKey }[] = [
  { id: "no-nuts", key: "noNuts" },
  { id: "no-dairy", key: "noDairy" },
  { id: "no-gluten", key: "noGluten" },
  { id: "no-eggs", key: "noEggs" },
  { id: "no-colors", key: "noColors" },
  { id: "no-alcohol", key: "noAlcohol" },
];

/** a colour's name ("תבחרו אתם" for the surprise); an id that isn't a colour, as it is */
export const colorName = (id: string, w: OrderWords = ORDER_WORDS) =>
  id === SURPRISE ? w.surprise : COLORS.some((x) => x.id === id) ? w.colors[id as ColorKey] : id;
/** a removal request's words */
export const exclusionWords = (id: ExclusionId, w: OrderWords = ORDER_WORDS) => w.exclusions[EXCLUSIONS.find((x) => x.id === id)!.key];

/** מה שהבונה מציג: הקטגוריות (עם הגדלים, הבסיסים והקרמים שלהן) והקרמים עצמם */
export type WizardCatalog = { categories: Category[]; creams: Cream[] };
export const BUILT_IN_CATALOG: WizardCatalog = { categories: CATEGORIES, creams: CREAMS };

export type Cat = { categories: Category[]; cream: Record<string, Cream> };
// כרטיס שמעוצב סביב צילום (מעוצבות, יום הולדת) שומר על הצילום המובנה שלו כל עוד ב-CMS אין לו צילום
const BUILT_IN_IMAGE = new Map(CATEGORIES.map((c) => [c.id, c.image]));
export const indexed = (c: WizardCatalog): Cat => ({
  categories: c.categories.map((x) => (x.image ? x : { ...x, image: BUILT_IN_IMAGE.get(x.id) })),
  cream: Object.fromEntries(c.creams.map((x) => [x.id, x])),
});

export type Step = 0 | 1 | 2 | 3 | 4;
export const LAST: Step = 4;

export type Draft = {
  category: CategoryId | null;
  figure: string;
  size: string | null;
  base: string | null;
  cream: string | null;
  colors: string[];
  theme: string;
  message: string;
  exclusions: ExclusionId[];
  allergy: boolean;
  notes: string;
  date: string;
};

export const EMPTY: Draft = {
  category: null,
  figure: "",
  size: null,
  base: null,
  cream: null,
  colors: [],
  theme: "",
  message: "",
  exclusions: [],
  allergy: false,
  notes: "",
  date: "",
};

export const categoryOf = (cat: Cat, id: CategoryId | null) => cat.categories.find((c) => c.id === id);
export const figureOf = (s: string) => s.replace(/\s/g, "");
export const FIGURE = /^[0-9A-Za-zא-ת]{1,3}$/;

export function servingsOf(size: Size, figure: string): [number, number] {
  const n = size.perFigure ? Math.max(1, figureOf(figure).length) : 1;
  return [size.servings[0] * n, size.servings[1] * n];
}
export const servingsText = ([a, b]: [number, number], w: OrderWords = ORDER_WORDS) =>
  a === b ? fill(w.servings, { n: a }) : fill(w.servingsRange, { min: a, max: b });

/** מחיר התחלתי לגודל הזה (בעוגת מספרים: כפול מספר הספרות), אם הוגדר */
export function priceOf(size: Size, figure: string): number | undefined {
  if (size.price == null) return undefined;
  return size.perFigure ? size.price * Math.max(1, figureOf(figure).length) : size.price;
}

export function formatDate(iso: string) {
  const [y, m, day] = iso.split("-");
  return day && m && y ? `${day}.${m}.${y}` : iso;
}

/** אם הקרם לא מתאים לבקשות ההסרה: למה, ולאיזו בקשה */
export function creamClash(cream: Cream, exclusions: ExclusionId[], w: OrderWords = ORDER_WORDS): { reason: string; request: string } | null {
  const request = (id: ExclusionId) => exclusionWords(id, w).label;
  if (exclusions.includes("no-nuts") && cream.contains.includes("nuts")) return { reason: w.clash.nuts, request: request("no-nuts") };
  if (exclusions.includes("no-dairy") && cream.contains.includes("dairy") && !cream.parve) return { reason: w.clash.dairy, request: request("no-dairy") };
  if (exclusions.includes("no-gluten") && cream.contains.includes("gluten")) return { reason: w.clash.gluten, request: request("no-gluten") };
  return null;
}

export type Issue = { id: "conflict" | "gluten" | "eggs"; kind: "conflict" | "notice"; text: string; fix?: { label: string; step: Step } };

/** התנגשויות (חוסמות שליחה, כי אלה אלרגנים) והערות (לא חוסמות) */
export function issuesOf(cat: Cat, d: Draft, w: OrderWords = ORDER_WORDS): Issue[] {
  const out: Issue[] = [];
  const cream = d.cream ? cat.cream[d.cream] : undefined;
  const clash = cream && creamClash(cream, d.exclusions, w);
  if (cream && clash) out.push({ id: "conflict", kind: "conflict", text: fill(w.conflict, { cream: cream.label, ...clash }), fix: { label: w.conflictFix, step: 2 } });
  if (d.exclusions.includes("no-gluten")) out.push({ id: "gluten", kind: "notice", text: w.notices.gluten });
  if (d.exclusions.includes("no-eggs")) out.push({ id: "eggs", kind: "notice", text: w.notices.eggs });
  return out;
}

export type Row = { key: string; label: string; text: string; step: Step };

/** כל הפרטים, בסדר הקריאה. משמש לסיכום, לעוגה שבצד ולהודעה */
export function rowsOf(cat: Cat, d: Draft, w: OrderWords = ORDER_WORDS): Row[] {
  const c = categoryOf(cat, d.category);
  if (!c) return [];
  const l = w.labels;
  const rows: Row[] = [{ key: "category", label: l.category, text: c.title, step: 0 }];
  if (c.figure && figureOf(d.figure)) rows.push({ key: "figure", label: l.figure, text: figureOf(d.figure), step: 1 });
  const size = c.sizes.find((s) => s.id === d.size);
  if (size) rows.push({ key: "size", label: l.size, text: `${size.label}${size.detail ? ` (${size.detail})` : ""}, ${servingsText(servingsOf(size, d.figure), w)}`, step: 1 });
  const price = size && priceOf(size, d.figure);
  if (price != null) rows.push({ key: "price", label: l.price, text: priceText(price, w.priceFrom), step: 1 });
  const base = c.bases.find((b) => b.id === d.base);
  if (base) rows.push({ key: "base", label: l.base, text: base.label, step: 1 });
  const cream = d.cream ? cat.cream[d.cream] : undefined;
  if (cream) rows.push({ key: "cream", label: l.cream, text: cream.label + (d.exclusions.includes("no-dairy") && cream.parve ? `, ${w.parve}` : ""), step: 2 });
  if (d.colors.length) rows.push({ key: "colors", label: l.colors, text: d.colors.map((id) => colorName(id, w)).join(", "), step: 2 });
  if (d.theme.trim()) rows.push({ key: "theme", label: l.idea, text: d.theme.trim(), step: 2 });
  if (d.message.trim()) rows.push({ key: "message", label: l.message, text: d.message.trim(), step: 2 });
  const excluded = EXCLUSIONS.filter((x) => d.exclusions.includes(x.id)).map((x) => w.exclusions[x.key].label);
  rows.push({ key: "exclusions", label: l.exclusions, text: excluded.length ? excluded.join(", ") : w.none, step: 3 });
  if (d.allergy) rows.push({ key: "allergy", label: l.allergy, text: w.allergyYes, step: 3 });
  if (d.notes.trim()) rows.push({ key: "notes", label: l.notes, text: d.notes.trim(), step: 3 });
  if (d.date) rows.push({ key: "date", label: l.date, text: formatDate(d.date), step: 4 });
  return rows;
}

export const orderText = (cat: Cat, d: Draft, w: OrderWords = ORDER_WORDS) =>
  [w.greeting, "", ...rowsOf(cat, d, w).map((r) => `${r.label}: ${r.text}`)].join("\n");

/** ההזמנה כפי שהיא עוברת לסל */
export type CakeOrder = {
  category: { id: CategoryId; title: string };
  figure?: string;
  size: { id: string; label: string; servings: [number, number] };
  /** מחיר התחלתי בשקלים, כשהוגדר לגודל */
  price?: number;
  base: { id: string; label: string };
  cream: { id: string; label: string; parve: boolean };
  /** שמות הצבעים ("תבחרו אתם" כשהבחירה אצלכם) */
  colors: string[];
  theme?: string;
  message?: string;
  exclusions: { id: ExclusionId; label: string }[];
  allergy: boolean;
  notes?: string;
  /** YYYY-MM-DD */
  date?: string;
  /** אותם פרטים כטקסט קריא */
  summary: string;
};

export function orderOf(cat: Cat, d: Draft, w: OrderWords = ORDER_WORDS): CakeOrder | null {
  const c = categoryOf(cat, d.category);
  const size = c?.sizes.find((s) => s.id === d.size);
  const base = c?.bases.find((b) => b.id === d.base);
  const cream = d.cream ? cat.cream[d.cream] : undefined;
  if (!c || !size || !base || !cream) return null;
  const text = (s: string) => s.trim() || undefined;
  return {
    category: { id: c.id, title: c.title },
    figure: c.figure ? figureOf(d.figure) : undefined,
    size: { id: size.id, label: size.label, servings: servingsOf(size, d.figure) },
    price: priceOf(size, d.figure),
    base: { id: base.id, label: base.label },
    cream: { id: cream.id, label: cream.label, parve: d.exclusions.includes("no-dairy") },
    colors: d.colors.map((id) => colorName(id, w)),
    theme: text(d.theme),
    message: text(d.message),
    exclusions: EXCLUSIONS.filter((x) => d.exclusions.includes(x.id)).map(({ id, key }) => ({ id, label: w.exclusions[key].label })),
    allergy: d.allergy,
    notes: text(d.notes),
    date: d.date || undefined,
    summary: orderText(cat, d, w),
  };
}
