/*
  The cake builder's model: the built-in catalog, the draft the wizard edits, and the rules that
  turn a draft into an order (servings, starting price, allergen conflicts, the summary text).
  No React here: the wizard (components/CustomCakeWizard.tsx) and the server
  (lib/order/validate.ts) compute exactly the same thing from it.
*/
import { PRICE_FROM, priceText } from "@/lib/price";
import { fill } from "@/lib/text";
import { ADDON_SEEDS, ADDONS } from "@/studio/addons";
import { THEMES, type ThemeId } from "@/studio/themes";

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
    layers: string;
    cream: string;
    filling: string;
    coating: string;
    colors: string;
    idea: string;
    inspiration: string;
    liked: string;
    link: string;
    message: string;
    exclusions: string;
    allergy: string;
    notes: string;
    date: string;
    addons: string;
  };
  /** an add-on's colour: "בצבע {color}" */
  addonColor: string;
  /** an add-on's count: "{n} יחידות" */
  addonQty: string;
  /** what to write on an add-on (a topper, a figure): "כיתוב: {text}" */
  addonText: string;
  /** an add-on whose picture is sent over WhatsApp */
  addonImage: string;
  /** "{n} שכבות ספוג" */
  layersText: string;
  /** one layer's filling, when they differ: "שכבה {n}: {filling}" */
  fillingLayer: string;
  /** a sponge layer, when the layers aren't all the same: "שכבה {n}: {base}" */
  baseLayer: string;
  /** the same filling between all the layers: "{filling}, בכל השכבות" */
  fillingAll: string;
  /** the photo chosen from the gallery: "בדיוק כמו \"{title}\"" */
  exact: string;
  /** what to keep from it: "לשמור: {list}" */
  keep: string;
  keepWords: Record<KeepKey, string>;
  /** what to change in it: "לשנות: {text}" */
  change: string;
  colors: Record<ColorKey, string>;
  exclusions: Record<ExclusionKey, { label: string; note: string }>;
  /** why a cream doesn't suit a removal request */
  clash: { nuts: string; dairy: string; gluten: string };
  /** "הקרם שבחרתם ({cream}) {reason}, וביקשתם {request}." */
  conflict: string;
  conflictFix: string;
  /** the same for the base: "{base}", and for the filling: "{filling}" */
  conflictBase: string;
  conflictBaseFix: string;
  conflictFilling: string;
  conflictFillingFix: string;
  /** the same for the coating: "{coating}" */
  conflictCoating: string;
  conflictCoatingFix: string;
  notices: { gluten: string; eggs: string };
};
export type KeepKey = "all" | "colors" | "decor" | "shape";
export const KEEP_KEYS: KeepKey[] = ["all", "colors", "decor", "shape"];

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
    layers: "שכבות",
    cream: "קרם",
    filling: "מילוי",
    coating: "ציפוי",
    colors: "צבעים",
    idea: "נושא או השראה",
    inspiration: "השראה מהגלריה",
    liked: "אהבו גם",
    link: "קישור להשראה",
    message: "כיתוב על העוגה",
    exclusions: "בקשות הסרה",
    allergy: "אלרגיה",
    notes: "בקשות נוספות",
    date: "תאריך",
    addons: "תוספות",
  },
  addonColor: "בצבע {color}",
  addonQty: "{n} יחידות",
  addonText: "כיתוב: {text}",
  addonImage: "התמונה תישלח בוואטסאפ",
  layersText: "{n} שכבות ספוג",
  fillingLayer: "בין שכבה {n} ל-{next}: {filling}",
  baseLayer: "שכבה {n}: {base}",
  fillingAll: "{filling}, בכל השכבות",
  exact: "בדיוק כמו \"{title}\"",
  keep: "לשמור: {list}",
  keepWords: { all: "הכול", colors: "הצבעים", decor: "הקישוטים", shape: "הצורה והגודל" },
  change: "לשנות: {text}",
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
  conflictBase: "הבסיס שבחרתם ({base}) {reason}, וביקשתם {request}.",
  conflictBaseFix: "בחירת בסיס אחר",
  conflictFilling: "המילוי שבחרתם ({filling}) {reason}, וביקשתם {request}.",
  conflictFillingFix: "בחירת מילוי אחר",
  conflictCoating: "הציפוי שבחרתם ({coating}) {reason}, וביקשתם {request}.",
  conflictCoatingFix: "בחירת ציפוי אחר",
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
/** איך הבונה מקבץ רשימה ארוכה של טעמים, קרמים ומילויים */
export const TASTE_GROUPS = ["classic", "chocolate", "fruity", "nutty", "sweets", "special"] as const;
export type TasteGroup = (typeof TASTE_GROUPS)[number];
export type Flavour = {
  id: string;
  label: string;
  note: string;
  tone: string | [string, string];
  group?: TasteGroup;
  /** אלרגנים שבבסיס עצמו, מעבר לרגילים שבכל ספוג (על גלוטן וביצים יש הערה משלהן) */
  contains?: Allergen[];
};
export type TileImage = { src: string; alt: string; srcSet?: string; position?: string };
export type Category = {
  id: CategoryId;
  title: string;
  blurb: string;
  /** צילום אמיתי של עוגה מהסוג הזה (מה-CMS: בכמה גדלים, ונקודת המיקוד שנבחרה). בלי צילום, הכרטיס מצויר */
  image?: TileImage;
  /** כמה צילומים שמתחלפים לאט בכרטיס, הראשון הוא image */
  gallery?: TileImage[];
  /** עוגת מספרים: הלקוח כותב את הספרה או האות */
  figure?: boolean;
  sizes: Size[];
  bases: Flavour[];
  creams: string[];
  /** המילויים שאפשר להוסיף בין השכבות (לא חובה) */
  fillings?: string[];
  /** סוגי הציפוי מבחוץ, הראשון ברירת המחדל. בלי: אין בחירת ציפוי (עוגת מספרים: נשיקות קרם) */
  coatings?: string[];
};
export type Cream = {
  id: string;
  label: string;
  tone: string | [string, string];
  contains: Allergen[];
  /** אפשר להכין בגרסה פרווה */
  parve?: boolean;
  group?: TasteGroup;
};
/** מילוי בין השכבות: אותו מבנה כמו קרם (גוון, אלרגנים, פרווה) */
export type Filling = Cream;

/** מה מצפה את העוגה מבחוץ. הצבע הוא של העיצוב; הסוג קובע את המרקם (גם בהדמיה) */
export type CoatingId = "buttercream" | "mascarpone" | "whipped" | "ganache" | "fondant" | "naked";
export type Coating = { id: CoatingId; label: string; note: string; contains: Allergen[]; parve?: boolean };
export const COATINGS: Coating[] = [
  { id: "buttercream", label: "קרם חמאה", note: "חלק ומבריק, מחזיק צורה וצבע", contains: ["dairy"], parve: true },
  { id: "mascarpone", label: "קרם מסקרפונה", note: "עשיר ויציב, מחזיק טוב גם בקיץ", contains: ["dairy"] },
  { id: "whipped", label: "קצפת", note: "קלילה ואוורירית, פחות מתוקה", contains: ["dairy"], parve: true },
  { id: "ganache", label: "גנאש שוקולד", note: "שוקולד חלק ומבריק, לעוגה כהה ואלגנטית", contains: ["dairy"], parve: true },
  { id: "fondant", label: "בצק סוכר", note: "משטח חלק לגמרי, לדמויות ולעיצובים מורכבים", contains: [] },
  { id: "naked", label: "נייקד (חשוף)", note: "שכבה דקה שהספוג מציץ ממנה, בסגנון כפרי", contains: ["dairy"], parve: true },
];
const ALL_COATINGS = COATINGS.map((x) => x.id);

/** כמה שכבות ספוג אפשר לבחור, לפי הצורה: בין כל שתיים יש שכבת מילוי */
export type LayerRange = { min: number; max: number; start: number };
export function layersOf(size: Size | undefined): LayerRange {
  switch (size?.visual.kind) {
    case "figure":
    case "cupcakes":
      return { min: 2, max: 2, start: 2 };
    case "tray":
      return { min: 2, max: 3, start: 2 };
    default:
      return { min: 2, max: 4, start: 3 };
  }
}
export const MAX_LAYERS = 4;

/** הנושאים שהבונה מציע, ואיתם מסננים את הגלריה (studio/themes.ts) */
export { THEMES, type ThemeId };
export const isTheme = (id: string): id is ThemeId => THEMES.some((t) => t.id === id);

/**
 * עוגה שהקונדיטוריה הכינה בפועל, לגלריית ההשראה. רק עוגות שלה ורק צילומים שיש לה זכויות בהם:
 * ב-CMS בעלת העסק מאשרת את זה בכל צילום, ובלי האישור הוא לא מוצג (sanity/queries.ts).
 */
export type PortfolioItem = { id: string; title: string; image: TileImage; themes: ThemeId[] };
// הצילומים שבאתר מההתחלה (proof, content.ts), של עוגות שנאפו אצלה. proof-05 לא כאן: ייתכן שהוא השראה (IMAGES.md)
const shot = (n: string, title: string, alt: string, themes: ThemeId[]): PortfolioItem => ({ id: `proof-${n}`, title, image: { src: `/images/proof-${n}.jpg`, alt }, themes });
export const BUILT_IN_PORTFOLIO: PortfolioItem[] = [
  shot("01", "רחל, 50. וינטג' עם סרטים ופנינים", "עוגת וינטג' גבוהה לבנה עם סרטים שחורים, פנינים והכיתוב רחל 50", ["adult", "vintage", "minimal"]),
  shot("02", "יום הולדת עם כתר זהב", "עוגה עגולה לבנה עם כתר זהב, עלי זהב וכיתוב באותיות זהב", ["princess", "gold", "adult", "kids"]),
  shot("03", "עמית, חוגג 13", "עוגת בר מצווה מלבנית עם הדפס טלית ותפילין, ספר תורה ותפילין מזהב", ["bar-mitzvah"]),
  shot("04", "יום הולדת 38", "עוגה מלבנית עם זילוף קצפת כפול, סרטים שחורים וכיתוב Happy Birthday", ["adult", "vintage"]),
  shot("06", "אדינה, 12. זהב, גיבסנית וסרט סאטן", "עוגה לבנה עם הספרה 12 בזהב, זר גיבסנית וסרט סאטן זהוב", ["bat-mitzvah", "gold", "flowers"]),
  shot("07", "70, לאמא. זהב ופרחים טריים", "עוגה לבנה גבוהה עם הספרה 70, עיטור זהב, חרציות וכיתוב Happy Birthday Mama", ["adult", "gold", "flowers"]),
];
export const MAX_LIKED = 4;

// הדמיות זמניות (IMAGES.md), עד שיגיעו צילומים של עוגות המספרים של הקונדיטוריה
const numberShot = (n: string, alt: string, position?: string): TileImage => ({
  src: `/images/number-${n}.jpg`,
  srcSet: `/images/number-${n}-480.jpg 480w, /images/number-${n}.jpg 768w`,
  alt,
  position,
});
const NUMBER_GALLERY: TileImage[] = [
  numberShot("01", "עוגת מספר 1 משתי שכבות בצק פריך, עם נשיקות קרם לבנות, תותים, פטל ומקרונים", "50% 45%"),
  numberShot("02", "עוגת מספר 5 עם קרם ורוד ולבן, מקרונים ורודים ונשיקות מרנג", "50% 40%"),
  numberShot("03", "עוגת מספר 18 משוקולד, עם גנאש, דובדבנים, אוכמניות ופרלינים מוזהבים", "50% 55%"),
  numberShot("04", "עוגת מספר 6 לבנה עם נשיקות קרם, ורדים, אקליפטוס ופפיונים שחורים", "50% 50%"),
];

/*
  הטעמים, הקרמים והמילויים: מה שמקובל בקונדיטוריות בוטיק בארץ ובעולם (נבדק 2026-10-02: ניצן
  סוויטס, דודו אוטמזגין, lechefs, Frosting by Feroze, Anna Lewis Cakes, The Cake Queen ועוד).
  הראשון בכל רשימה הוא ברירת המחדל שהעוגה מתחילה ממנה. ⚠ לאשר מול הלקוחה מה היא באמת מכינה.
*/
type Tone = string | [string, string];
const flavour = (id: string, label: string, note: string, tone: Tone, group: TasteGroup, contains?: Allergen[]): Flavour => ({
  id,
  label,
  note,
  tone,
  group,
  ...(contains ? { contains } : {}),
});

const FLAVOURS = {
  vanilla: flavour("vanilla", "וניל", "ספוג וניל רך ואוורירי", "#EFD9A8", "classic"),
  vanillaBean: flavour("vanilla-bean", "וניל בורבון", "עם גרגירי וניל אמיתיים", "#F2DFB4", "classic"),
  marble: flavour("marble", "שיש", "וניל ושוקולד, מעורבלים", ["#EFD9A8", "#5C3B2C"], "classic"),
  redVelvet: flavour("red-velvet", "רד וולווט", "ספוג קטיפתי בגוון אדום עמוק", "#9A2E36", "classic"),
  pinkVelvet: flavour("pink-velvet", "פינק וולווט", "ספוג קטיפתי בגוון ורוד", "#E7A3AE", "classic"),
  honey: flavour("honey", "דבש", "ספוג דבש רך וריחני", "#C99A4E", "classic"),
  chocolate: flavour("chocolate", "שוקולד", "ספוג שוקולד עשיר", "#5C3B2C", "chocolate"),
  fudge: flavour("fudge", "פאדג' שוקולד", "שוקולד דחוס ולח", "#3F2519", "chocolate"),
  mocha: flavour("mocha", "מוקה", "שוקולד וקפה", "#6E4A36", "chocolate"),
  chocolateOrange: flavour("chocolate-orange", "שוקולד ותפוז", "שוקולד מריר עם גרידת תפוז", "#6B3F26", "chocolate"),
  whiteChocolate: flavour("white-chocolate", "שוקולד לבן", "ספוג עם שוקולד לבן מומס", "#F3E3C3", "chocolate"),
  lemon: flavour("lemon", "לימון", "ספוג לימון רענן", "#F0DC86", "fruity"),
  lemonPoppy: flavour("lemon-poppy", "לימון ופרג", "ספוג לימון עם פרג", "#EFD98C", "fruity"),
  strawberry: flavour("strawberry", "תות", "ספוג עם תותים", "#F2B8B5", "fruity"),
  orange: flavour("orange", "תפוז", "ספוג תפוזים עסיסי", "#F2B66D", "fruity"),
  banana: flavour("banana", "בננה", "ספוג בננות רך", "#E8D29A", "fruity"),
  coconut: flavour("coconut", "קוקוס", "ספוג עם קוקוס", "#F4EEDF", "fruity"),
  lychee: flavour("lychee", "וניל וליצ'י", "ספוג וניל עם ליצ'י", "#F3E1DC", "fruity"),
  pistachio: flavour("pistachio", "פיסטוק", "ספוג עם פיסטוק טחון", "#B9C48A", "nutty", ["nuts"]),
  hazelnut: flavour("hazelnut", "אגוזי לוז", "ספוג עם אגוזי לוז קלויים", "#A87A52", "nutty", ["nuts"]),
  almond: flavour("almond", "שקדים", "ספוג שקדים עדין", "#E6CFA2", "nutty", ["nuts"]),
  carrot: flavour("carrot", "גזר ואגוזים", "ספוג גזר מתובל עם אגוזי מלך", "#C77E45", "nutty", ["nuts"]),
  funfetti: flavour("funfetti", "פאנפטי", "וניל עם סוכריות צבעוניות בפנים", ["#F2DFB4", "#E7A3AE"], "sweets"),
  oreo: flavour("oreo", "אוראו", "ספוג וניל עם פירורי אוראו", ["#F2E8D8", "#2D2420"], "sweets"),
  lotus: flavour("lotus", "לוטוס", "ספוג עם ביסקוויט לוטוס", "#C48A57", "sweets"),
  vanillaCardamom: flavour("vanilla-cardamom", "וניל והל", "וניל עם הל טחון", "#E9D6A6", "special"),
  vanillaThyme: flavour("vanilla-thyme", "וניל וטימין", "וניל עם טימין לימוני", "#E2D6A4", "special"),
  chai: flavour("chai", "צ'אי", "קינמון, הל וג'ינג'ר", "#C9A27A", "special"),
  earlGrey: flavour("earl-grey", "ארל גריי", "תה עם ברגמוט", "#CDB79A", "special"),
  matcha: flavour("matcha", "מאצ'ה", "תה ירוק יפני", "#A7B97A", "special"),
  coffee: flavour("coffee", "קפה", "ספוג עם אספרסו", "#8B6447", "special"),
  sableVanilla: flavour("sable-vanilla", "בצק פריך וניל", "שתי שכבות פריכות בצורת הספרה", "#E4C28C", "classic"),
  sableChocolate: flavour("sable-chocolate", "בצק פריך שוקולד", "פריך, עם קקאו", "#6B4533", "chocolate"),
  sableAlmond: flavour("sable-almond", "בצק פריך שקדים", "פריך, עם קמח שקדים", "#E1C493", "nutty", ["nuts"]),
  sableCinnamon: flavour("sable-cinnamon", "בצק פריך קינמון", "פריך, עם קינמון וסוכר חום", "#C99B66", "special"),
  sableLotus: flavour("sable-lotus", "בצק פריך לוטוס", "פריך, עם ביסקוויט לוטוס", "#C48A57", "sweets"),
  sableVanillaBean: flavour("sable-vanilla-bean", "בצק פריך וניל בורבון", "פריך, עם גרגירי וניל", "#E8CB96", "classic"),
  sableBrownButter: flavour("sable-brown-butter", "בצק פריך חמאה חומה", "פריך, בטעם חמאה קלויה", "#C9A06A", "classic"),
  sableRedVelvet: flavour("sable-red-velvet", "בצק פריך רד וולווט", "פריך, בגוון אדום עמוק", "#9A3A3E", "classic"),
  sableDoubleChocolate: flavour("sable-double-chocolate", "בצק פריך שוקולד צ'יפס", "פריך שוקולד עם שבבי שוקולד", "#4A2E22", "chocolate"),
  sableLemon: flavour("sable-lemon", "בצק פריך לימון", "פריך, עם גרידת לימון", "#EBD48C", "fruity"),
  sableCoconut: flavour("sable-coconut", "בצק פריך קוקוס", "פריך, עם קוקוס קלוי", "#EFE3C8", "fruity"),
  sableOrange: flavour("sable-orange", "בצק פריך תפוז", "פריך, עם גרידת תפוז", "#EDB874", "fruity"),
  sablePistachio: flavour("sable-pistachio", "בצק פריך פיסטוק", "פריך, עם פיסטוק טחון", "#B5BE85", "nutty", ["nuts"]),
  sableHazelnut: flavour("sable-hazelnut", "בצק פריך אגוזי לוז", "פריך, עם אגוזי לוז קלויים", "#A8784E", "nutty", ["nuts"]),
  sableOreo: flavour("sable-oreo", "בצק פריך אוראו", "פריך שוקולד בסגנון אוראו", "#2F2420", "sweets"),
  sableFunfetti: flavour("sable-funfetti", "בצק פריך פאנפטי", "פריך וניל עם סוכריות צבעוניות", ["#E8CB96", "#E7A3AE"], "sweets"),
  sableCardamom: flavour("sable-cardamom", "בצק פריך הל", "פריך, עם הל טחון", "#DCC293", "special"),
  sableCoffee: flavour("sable-coffee", "בצק פריך קפה", "פריך, עם אספרסו", "#8A6244", "special"),
  sableMatcha: flavour("sable-matcha", "בצק פריך מאצ'ה", "פריך, עם תה ירוק", "#A9B77E", "special"),
  spongeVanilla: flavour("sponge-vanilla", "ספוג וניל", "גרסה רכה של עוגת המספרים", "#F0DDB0", "classic"),
  spongeChocolate: flavour("sponge-chocolate", "ספוג שוקולד", "גרסה רכה, עם קקאו", "#6B4533", "chocolate"),
} satisfies Record<string, Flavour>;

const taste = (id: string, label: string, tone: Tone, group: TasteGroup, contains: Allergen[], parve?: boolean): Cream => ({
  id,
  label,
  tone,
  contains,
  group,
  ...(parve ? { parve } : {}),
});

const CREAMS: Cream[] = [
  taste("vanilla", "וניל", "#F5E9CF", "classic", ["dairy"], true),
  taste("cream-cheese", "קרם גבינה", "#FBF5EA", "classic", ["dairy"]),
  taste("mascarpone", "מסקרפונה", "#F7EDD6", "classic", ["dairy"]),
  taste("whipped", "קצפת", "#FCF7EE", "classic", ["dairy"], true),
  taste("buttercream", "קרם חמאה", "#F6E6C2", "classic", ["dairy"], true),
  taste("diplomat", "קרם דיפלומט", "#F4E2B8", "classic", ["dairy"]),
  taste("chocolate", "גנאש שוקולד", "#6A4331", "chocolate", ["dairy"], true),
  taste("dark-chocolate", "שוקולד מריר", "#3F2519", "chocolate", ["dairy"], true),
  taste("milk-chocolate", "שוקולד חלב", "#8A5A3C", "chocolate", ["dairy"]),
  taste("white-chocolate", "שוקולד לבן", "#F3E7CF", "chocolate", ["dairy"]),
  taste("mocha", "מוקה", "#7A5440", "chocolate", ["dairy"], true),
  taste("berries", "פירות יער", "#B45872", "fruity", ["dairy"], true),
  taste("strawberry", "תות", "#F0B4B8", "fruity", ["dairy"]),
  taste("raspberry", "פטל", "#D9667A", "fruity", ["dairy"]),
  taste("lemon", "לימון", "#F3E08E", "fruity", ["dairy"]),
  taste("passionfruit", "פסיפלורה", "#F2C14E", "fruity", ["dairy"]),
  taste("mango", "מנגו", "#F5B94F", "fruity", ["dairy"]),
  taste("lychee", "ליצ'י", "#F5E3E0", "fruity", ["dairy"]),
  taste("coconut", "קוקוס", "#F7F1E4", "fruity", ["dairy"], true),
  taste("pina-colada", "פינה קולדה", "#F5E7B5", "fruity", ["dairy"]),
  taste("pistachio", "פיסטוק", "#B5BF86", "nutty", ["dairy", "nuts"]),
  taste("nutella", "נוטלה", "#7B4E33", "nutty", ["dairy", "nuts"]),
  taste("praline", "פרלינה אגוזי לוז", "#B0835A", "nutty", ["dairy", "nuts"]),
  taste("peanut-butter", "חמאת בוטנים", "#C69256", "nutty", ["dairy", "nuts"]),
  taste("salted-caramel", "קרמל מלוח", "#C68A4C", "sweets", ["dairy"]),
  taste("caramel", "קרמל", "#D39A5C", "sweets", ["dairy"]),
  taste("dulce", "דולסה דה לצ'ה", "#C9925A", "sweets", ["dairy"]),
  taste("lotus", "לוטוס", "#C48A57", "sweets", ["dairy", "gluten"]),
  taste("oreo", "אוראו", ["#F2E8D8", "#2D2420"], "sweets", ["dairy", "gluten"]),
  taste("tiramisu", "טירמיסו", "#C7A27E", "special", ["dairy"]),
  taste("coffee", "קפה", "#A57A5A", "special", ["dairy"], true),
  taste("honey", "דבש", "#E2B866", "special", ["dairy"]),
  taste("matcha", "מאצ'ה", "#B4C48C", "special", ["dairy"]),
  taste("rose", "ורדים", "#F1C6CC", "special", ["dairy"]),
  taste("violet", "סיגליות", "#CDB6DD", "special", ["dairy"]),
  taste("orange-blossom", "פריחת הדרים", "#F6E8C8", "special", ["dairy"]),
  taste("aztec", "שוקולד אצטקי", "#5A3626", "special", ["dairy"]),
];

const FILLINGS: Filling[] = [
  taste("patissiere", "קרם פטיסייר וניל", "#F3DE9E", "classic", ["dairy"]),
  taste("creme-brulee", "קרם ברולה", "#E9C07A", "classic", ["dairy"]),
  taste("ganache", "גנאש מריר", "#3F2519", "chocolate", ["dairy"], true),
  taste("mekupelet", "פירורי מקופלת", "#6E4630", "chocolate", ["dairy"]),
  taste("crunch-pearls", "פניני קראנץ' שוקולד", "#5C3B2C", "chocolate", ["dairy", "gluten"]),
  taste("fresh-strawberries", "תותים טריים", "#E0505E", "fruity", []),
  taste("strawberry-jam", "ריבת תות", "#B8323F", "fruity", []),
  taste("raspberry-jam", "ריבת פטל", "#A82A48", "fruity", []),
  taste("berry-compote", "קומפוט פירות יער", "#7E2F4F", "fruity", []),
  taste("amarena", "דובדבני אמרנה", "#6E1A2A", "fruity", []),
  taste("mango-coulis", "קולי מנגו", "#F2A93B", "fruity", []),
  taste("lemon-curd", "לימון קרד", "#F2D65C", "fruity", ["dairy"]),
  taste("passionfruit-curd", "קרד פסיפלורה", "#F0B83A", "fruity", ["dairy"]),
  taste("pistachio-spread", "ממרח פיסטוק", "#9DAE5E", "nutty", ["dairy", "nuts"]),
  taste("dubai", "קראנץ' דובאי", "#8FA055", "nutty", ["dairy", "nuts", "gluten"]),
  taste("nutella-filling", "נוטלה", "#6B4027", "nutty", ["dairy", "nuts"]),
  taste("praline-crunch", "פרלינה ופיאנטין", "#A9784C", "nutty", ["dairy", "nuts", "gluten"]),
  taste("peanut-spread", "ממרח חמאת בוטנים", "#C08A4E", "nutty", ["nuts"]),
  taste("dulce-filling", "דולסה דה לצ'ה", "#B9814A", "sweets", ["dairy"]),
  taste("salted-caramel-sauce", "רוטב קרמל מלוח", "#B87533", "sweets", ["dairy"]),
  taste("lotus-spread", "ממרח לוטוס", "#B97A45", "sweets", ["gluten"]),
  taste("lotus-crumbs", "פירורי לוטוס", "#C48A57", "sweets", ["gluten"]),
  taste("oreo-crumbs", "פירורי אוראו", "#2D2420", "sweets", ["gluten"]),
  taste("pretzel", "ממרח בייגלה מלוח", "#B88A55", "sweets", ["dairy", "gluten"]),
  taste("feuilletine", "פיאנטין פריך", "#D2A86C", "sweets", ["dairy", "gluten"]),
  taste("cornflakes", "קראנץ' קורנפלקס", "#D9AE5F", "sweets", ["dairy", "gluten"]),
  taste("sprinkles", "סוכריות צבעוניות", ["#F2B8C6", "#9CC9E8"], "sweets", []),
  taste("meringue", "מרנג פריך", "#FBF6EC", "special", []),
  taste("coffee-soak", "השריית אספרסו", "#5E3F2C", "special", []),
];

const ids = (list: { id: string }[]) => list.map((x) => x.id);
const ROUND_BASES = [
  FLAVOURS.vanilla,
  FLAVOURS.vanillaBean,
  FLAVOURS.marble,
  FLAVOURS.redVelvet,
  FLAVOURS.pinkVelvet,
  FLAVOURS.honey,
  FLAVOURS.chocolate,
  FLAVOURS.fudge,
  FLAVOURS.mocha,
  FLAVOURS.chocolateOrange,
  FLAVOURS.whiteChocolate,
  FLAVOURS.lemon,
  FLAVOURS.lemonPoppy,
  FLAVOURS.strawberry,
  FLAVOURS.orange,
  FLAVOURS.banana,
  FLAVOURS.coconut,
  FLAVOURS.lychee,
  FLAVOURS.pistachio,
  FLAVOURS.hazelnut,
  FLAVOURS.almond,
  FLAVOURS.carrot,
  FLAVOURS.funfetti,
  FLAVOURS.oreo,
  FLAVOURS.lotus,
  FLAVOURS.vanillaCardamom,
  FLAVOURS.vanillaThyme,
  FLAVOURS.chai,
  FLAVOURS.earlGrey,
  FLAVOURS.matcha,
  FLAVOURS.coffee,
];

export const CATEGORIES: Category[] = [
  {
    id: "number",
    title: "עוגות מספרים",
    blurb: "ספרה או אות בשתי קומות, עם קרם ועיטורים",
    image: NUMBER_GALLERY[0],
    gallery: NUMBER_GALLERY,
    figure: true,
    sizes: [
      { id: "regular", label: "גודל רגיל", detail: "כ-30 ס״מ לכל ספרה", servings: [12, 15], perFigure: true, visual: { kind: "figure", scale: 0.8 } },
      { id: "large", label: "גודל גדול", detail: "כ-40 ס״מ לכל ספרה", servings: [20, 25], perFigure: true, visual: { kind: "figure", scale: 1 } },
    ],
    // the shortbread first (the classic number cake), then every sponge the round cakes have
    bases: [
      FLAVOURS.sableVanilla,
      FLAVOURS.sableVanillaBean,
      FLAVOURS.sableBrownButter,
      FLAVOURS.sableRedVelvet,
      FLAVOURS.sableChocolate,
      FLAVOURS.sableDoubleChocolate,
      FLAVOURS.sableLemon,
      FLAVOURS.sableCoconut,
      FLAVOURS.sableOrange,
      FLAVOURS.sableAlmond,
      FLAVOURS.sablePistachio,
      FLAVOURS.sableHazelnut,
      FLAVOURS.sableLotus,
      FLAVOURS.sableOreo,
      FLAVOURS.sableFunfetti,
      FLAVOURS.sableCinnamon,
      FLAVOURS.sableCardamom,
      FLAVOURS.sableCoffee,
      FLAVOURS.sableMatcha,
      FLAVOURS.spongeVanilla,
      FLAVOURS.spongeChocolate,
      ...ROUND_BASES.filter((b) => b !== FLAVOURS.vanilla && b !== FLAVOURS.chocolate),
    ],
    creams: ["mascarpone", ...ids(CREAMS).filter((id) => !["mascarpone", "whipped", "diplomat"].includes(id))],
    fillings: ids(FILLINGS).filter((id) => id !== "coffee-soak"),
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
    bases: ROUND_BASES,
    creams: ids(CREAMS),
    fillings: ids(FILLINGS),
    coatings: ALL_COATINGS,
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
    bases: ROUND_BASES,
    creams: ids(CREAMS),
    fillings: ids(FILLINGS),
    coatings: ALL_COATINGS,
  },
  {
    id: "kindergarten",
    title: "עוגות גן",
    blurb: "מגש חתוך למנות אישיות, לחגיגה בגן",
    image: { src: "/images/mechanism-03.jpg", alt: "עוגת מגש מלבנית עם שולי קצפת מזולפים, סרטים שחורים וכיתוב יום הולדת" },
    sizes: [
      { id: "tray-s", label: "מגש 20 על 30 ס״מ", servings: [20, 24], visual: { kind: "tray", w: 30, h: 20 } },
      { id: "tray-l", label: "מגש 30 על 40 ס״מ", servings: [35, 40], visual: { kind: "tray", w: 40, h: 30 } },
      { id: "cupcakes", label: "30 קאפקייקס", detail: "לכל ילד אחד משלו", servings: [30, 30], visual: { kind: "cupcakes" } },
    ],
    bases: ROUND_BASES,
    creams: ids(CREAMS),
    fillings: ids(FILLINGS).filter((id) => id !== "coffee-soak"),
    coatings: ["buttercream", "whipped", "ganache", "fondant"],
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

/* ─────────────────────────── התוספות ───────────────────────────
   זילוף, פרחים, עלי זהב, טופר וכו'. בלי מחיר: עוגה מהבונה היא בקשה, והמחיר נסגר מול בעלת העסק.
   מה-CMS ("תוספות לבונה" ב-Studio, sanity/shop.ts), בעברית; בלעדיו, אלה שה-seed טוען (studio/addons.ts).
   הכיתוב על העוגה הוא שדה משלו בשלב 3, ולכן "כיתוב" לא מוצג כתוספת. */

export type Addon = {
  key: string;
  title: string;
  description: string;
  categories: CategoryId[];
  /** אחת מהן חובה כשיש */
  options: { id: string; label: string }[];
  colorable: boolean;
  /** 0: בלי טקסט */
  textMax: number;
  quantity?: [min: number, max: number];
  imageByWhatsapp: boolean;
};
export type AddonPick = { key: string; option: string | null; color: string | null; text: string; qty: number | null };

export const MAX_ADDONS = 10;
const SHOWN_AS_FIELD = "inscription";

export const BUILT_IN_ADDONS: Addon[] = ADDONS.filter((a) => a.key !== SHOWN_AS_FIELD).map(({ key, title }) => {
  const seed = ADDON_SEEDS[key];
  return {
    key,
    title,
    description: seed.description,
    categories: seed.categories,
    options: (seed.options ?? []).map((label, i) => ({ id: `o${i + 1}`, label })),
    colorable: !!seed.colorable,
    textMax: seed.text ?? 0,
    ...(seed.quantity ? { quantity: seed.quantity } : {}),
    imageByWhatsapp: !!seed.imageByWhatsapp,
  };
});

/** מה שהבונה מציג: הקטגוריות (עם הגדלים, הבסיסים והקרמים שלהן), הקרמים עצמם והתוספות */
export type WizardCatalog = { categories: Category[]; creams: Cream[]; fillings?: Filling[]; addons?: Addon[]; portfolio?: PortfolioItem[] };
export const BUILT_IN_CATALOG: WizardCatalog = { categories: CATEGORIES, creams: CREAMS, fillings: FILLINGS, addons: BUILT_IN_ADDONS, portfolio: BUILT_IN_PORTFOLIO };

export type Cat = { categories: Category[]; cream: Record<string, Cream>; filling: Record<string, Filling>; addons: Addon[]; portfolio: PortfolioItem[] };
// כרטיס שמעוצב סביב צילום (מעוצבות, יום הולדת) שומר על הצילום המובנה שלו כל עוד ב-CMS אין לו צילום
const BUILT_IN = new Map(CATEGORIES.map((c) => [c.id, c]));
export const indexed = (c: WizardCatalog): Cat => ({
  categories: c.categories.map((x) => {
    const own = BUILT_IN.get(x.id);
    const withImage = x.image ? x : { ...x, image: own?.image, gallery: own?.gallery };
    return withImage.coatings ? withImage : { ...withImage, coatings: own?.coatings };
  }),
  cream: Object.fromEntries(c.creams.map((x) => [x.id, x])),
  filling: Object.fromEntries((c.fillings ?? []).map((x) => [x.id, x])),
  addons: (c.addons ?? []).filter((a) => a.key !== SHOWN_AS_FIELD),
  portfolio: c.portfolio?.length ? c.portfolio : BUILT_IN_PORTFOLIO,
});

export const coatingsOf = (c: Category | undefined) => (c?.coatings ?? []).flatMap((id) => COATINGS.filter((x) => x.id === id));
export const sizeOf = (c: Category | undefined, d: { size: string | null }) => c?.sizes.find((s) => s.id === d.size);
/** how many layers the cake has: the one chosen, within what its shape allows, or the shape's usual */
export function layerCount(c: Category | undefined, d: { size: string | null; layers: number | null }): number {
  const r = layersOf(sizeOf(c, d));
  return Math.min(r.max, Math.max(r.min, d.layers ?? r.start));
}
/** the filling between each two layers (null: cream only), as many as the cake has gaps */
export function fillingSlots(cat: Cat, c: Category | undefined, d: Pick<Draft, "size" | "layers" | "fillings">): (Filling | null)[] {
  return Array.from({ length: layerCount(c, d) - 1 }, (_, i) => {
    const id = d.fillings[i];
    return id && c?.fillings?.includes(id) ? (cat.filling[id] ?? null) : null;
  });
}

/** the sponge of each layer, from the bottom: its own flavour where one was chosen, otherwise the main base */
export function baseSlots(c: Category | undefined, d: Pick<Draft, "size" | "layers" | "base" | "layerBases">): (Flavour | undefined)[] {
  const main = c?.bases.find((b) => b.id === d.base);
  return Array.from({ length: layerCount(c, d) }, (_, i) => c?.bases.find((b) => b.id === d.layerBases[i]) ?? main);
}

/** the fillings this cake offers, as they are in the catalog */
export const fillingsOf = (cat: Cat, c: Category | undefined) => (c?.fillings ?? []).flatMap((id) => (cat.filling[id] ? [cat.filling[id]] : []));

/**
 * Where a cake starts: the type's first size, base and cream, and no filling (the owner orders
 * each list with the classic first). A choice already made stays when the new type offers it; a
 * default that clashes with the removal requests is skipped for the next one that doesn't.
 */
export function startOf(cat: Cat, c: Category, d: Draft): Pick<Draft, "size" | "base" | "cream" | "layerBases" | "fillings" | "coating"> {
  const fits = (item: { contains?: Allergen[]; parve?: boolean }) => !clashOf(item, d.exclusions);
  const creams = c.creams.flatMap((id) => (cat.cream[id] ? [cat.cream[id]] : []));
  const coatings = coatingsOf(c);
  return {
    size: c.sizes.some((s) => s.id === d.size) ? d.size : (c.sizes[0]?.id ?? null),
    base: c.bases.some((b) => b.id === d.base) ? d.base : ((c.bases.find(fits) ?? c.bases[0])?.id ?? null),
    cream: d.cream && c.creams.includes(d.cream) && cat.cream[d.cream] ? d.cream : ((creams.find(fits) ?? creams[0])?.id ?? null),
    layerBases: d.layerBases.map((id) => (id && c.bases.some((b) => b.id === id) ? id : null)),
    fillings: d.fillings.map((id) => (id && c.fillings?.includes(id) && cat.filling[id] ? id : null)),
    coating: coatings.some((x) => x.id === d.coating) ? d.coating : ((coatings.find(fits) ?? coatings[0])?.id ?? null),
  };
}

/** התוספות שמוצעות לסוג העוגה הזה */
export const addonsFor = (cat: Cat, category: CategoryId | null) => (category ? cat.addons.filter((a) => a.categories.includes(category)) : []);

/** מה שנבחר לתוספת, כשהוא לא מתאים לה (או לסוג העוגה); null כשהכול תקין */
export function addonProblem(cat: Cat, category: CategoryId | null, p: AddonPick): string | null {
  const a = addonsFor(cat, category).find((x) => x.key === p.key);
  if (!a) return "Not offered for this cake";
  if (a.options.length ? !a.options.some((o) => o.id === p.option) : p.option !== null) return "Unknown option";
  if (p.color !== null && (!a.colorable || !COLORS.some((c) => c.id === p.color))) return "Not in the palette";
  if (p.text.length > a.textMax) return "Text too long";
  if (a.quantity ? p.qty === null || p.qty < a.quantity[0] || p.qty > a.quantity[1] : p.qty !== null) return "Quantity out of range";
  return null;
}

/** תוספת חדשה, עם ברירות המחדל שלה (האפשרות הראשונה, הכמות המינימלית) */
export const pickOf = (a: Addon): AddonPick => ({ key: a.key, option: a.options[0]?.id ?? null, color: null, text: "", qty: a.quantity ? a.quantity[0] : null });

/** התוספת כטקסט: "פרחים: פרחי סוכר, בצבע ורוד עתיק" */
export function addonLine(a: Addon, p: AddonPick, w: OrderWords = ORDER_WORDS): string {
  const parts = [a.options.find((o) => o.id === p.option)?.label, p.color && fill(w.addonColor, { color: colorName(p.color, w) }), p.qty != null && fill(w.addonQty, { n: p.qty }), p.text.trim() && fill(w.addonText, { text: p.text.trim() }), a.imageByWhatsapp && w.addonImage].filter(Boolean);
  return parts.length ? `${a.title}: ${parts.join(", ")}` : a.title;
}

export type Step = 0 | 1 | 2 | 3 | 4;
export const LAST: Step = 4;

export type Draft = {
  category: CategoryId | null;
  figure: string;
  size: string | null;
  base: string | null;
  cream: string | null;
  /** sponge layers; null: the shape's usual (layersOf) */
  layers: number | null;
  /** the sponge of each layer, from the bottom; null: the main base (`base`) */
  layerBases: (string | null)[];
  /** the filling between layer i and i+1; null: cream only */
  fillings: (string | null)[];
  /** what covers the outside (COATINGS); null where the cake has none to choose */
  coating: string | null;
  colors: string[];
  /** one of THEMES, or null; the words under it are `theme` */
  themeId: string | null;
  theme: string;
  /** photos from the gallery the customer liked, and the one they want exactly */
  liked: string[];
  exact: string | null;
  keep: KeepKey[];
  change: string;
  /** a link to an inspiration picture of their own (shown to the owner as text, never fetched) */
  link: string;
  message: string;
  addons: AddonPick[];
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
  layers: null,
  layerBases: [],
  fillings: [],
  coating: null,
  colors: [],
  themeId: null,
  theme: "",
  liked: [],
  exact: null,
  keep: [],
  change: "",
  link: "",
  message: "",
  addons: [],
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

/** אם בסיס, קרם או מילוי לא מתאימים לבקשות ההסרה: למה, ולאיזו בקשה */
export function clashOf(item: { contains?: Allergen[]; parve?: boolean }, exclusions: ExclusionId[], w: OrderWords = ORDER_WORDS): { reason: string; request: string } | null {
  const request = (id: ExclusionId) => exclusionWords(id, w).label;
  const contains = item.contains ?? [];
  if (exclusions.includes("no-nuts") && contains.includes("nuts")) return { reason: w.clash.nuts, request: request("no-nuts") };
  if (exclusions.includes("no-dairy") && contains.includes("dairy") && !item.parve) return { reason: w.clash.dairy, request: request("no-dairy") };
  if (exclusions.includes("no-gluten") && contains.includes("gluten")) return { reason: w.clash.gluten, request: request("no-gluten") };
  return null;
}
export const creamClash = clashOf;

export type Issue = {
  id: "conflict" | "conflict-base" | "conflict-filling" | "conflict-coating" | "gluten" | "eggs";
  kind: "conflict" | "notice";
  text: string;
  fix?: { label: string; step: Step };
};

/** התנגשויות (חוסמות שליחה, כי אלה אלרגנים) והערות (לא חוסמות) */
export function issuesOf(cat: Cat, d: Draft, w: OrderWords = ORDER_WORDS): Issue[] {
  const out: Issue[] = [];
  const c = categoryOf(cat, d.category);
  const bases = [...new Set(baseSlots(c, d).filter((b) => b != null))];
  const baseClash = bases.flatMap((b) => {
    const why = clashOf(b, d.exclusions, w);
    return why ? [{ b, why }] : [];
  })[0];
  // the main base is picked in step 2; a layer of its own, with the layers in step 3
  if (baseClash) out.push({ id: "conflict-base", kind: "conflict", text: fill(w.conflictBase, { base: baseClash.b.label, ...baseClash.why }), fix: { label: w.conflictBaseFix, step: baseClash.b.id === d.base ? 1 : 2 } });
  const cream = d.cream ? cat.cream[d.cream] : undefined;
  const clash = cream && clashOf(cream, d.exclusions, w);
  if (cream && clash) out.push({ id: "conflict", kind: "conflict", text: fill(w.conflict, { cream: cream.label, ...clash }), fix: { label: w.conflictFix, step: 2 } });
  const fillings = [...new Set(fillingSlots(cat, c, d).filter((f) => f != null))];
  const fillingClash = fillings.flatMap((f) => {
    const why = clashOf(f, d.exclusions, w);
    return why ? [{ f, why }] : [];
  })[0];
  if (fillingClash) out.push({ id: "conflict-filling", kind: "conflict", text: fill(w.conflictFilling, { filling: fillingClash.f.label, ...fillingClash.why }), fix: { label: w.conflictFillingFix, step: 2 } });
  const coating = coatingsOf(c).find((x) => x.id === d.coating);
  const coatingClash = coating && clashOf(coating, d.exclusions, w);
  if (coating && coatingClash) out.push({ id: "conflict-coating", kind: "conflict", text: fill(w.conflictCoating, { coating: coating.label, ...coatingClash }), fix: { label: w.conflictCoatingFix, step: 2 } });
  if (d.exclusions.includes("no-gluten")) out.push({ id: "gluten", kind: "notice", text: w.notices.gluten });
  if (d.exclusions.includes("no-eggs")) out.push({ id: "eggs", kind: "notice", text: w.notices.eggs });
  return out;
}

export type Row = { key: string; label: string; text: string; step: Step };

/** the add-ons chosen that this cake offers, each with its catalog entry, in the catalog's order */
export function chosenAddons(cat: Cat, d: Draft): [Addon, AddonPick][] {
  const offered = addonsFor(cat, d.category);
  return offered.flatMap((a) => {
    const p = d.addons.find((x) => x.key === a.key);
    return p ? [[a, p] as [Addon, AddonPick]] : [];
  });
}

/** "ריבת תות" (שכבה אחת), "ריבת תות, בכל השכבות", או "שכבה 1: ריבת תות; שכבה 2: גנאש" */
function fillingsText(slots: (Filling | null)[], suffix: (f: Filling) => string, w: OrderWords): string {
  const used = slots.flatMap((f, i) => (f ? [{ f, n: i + 1 }] : []));
  if (!used.length) return "";
  if (slots.length === 1) return used[0].f.label + suffix(used[0].f);
  if (used.length === slots.length && used.every((x) => x.f.id === used[0].f.id)) return fill(w.fillingAll, { filling: used[0].f.label + suffix(used[0].f) });
  return used.map(({ f, n }) => fill(w.fillingLayer, { n, next: n + 1, filling: f.label + suffix(f) })).join("; ");
}

/** the gallery photos the customer picked, only ones the catalog still has */
export function inspirationOf(cat: Cat, d: Pick<Draft, "exact" | "liked" | "keep" | "change" | "link">, w: OrderWords = ORDER_WORDS) {
  const byId = (id: string) => cat.portfolio.find((p) => p.id === id);
  const exact = d.exact ? byId(d.exact) : undefined;
  return {
    exact,
    keep: exact ? KEEP_KEYS.filter((k) => d.keep.includes(k)).map((k) => w.keepWords[k]) : [],
    change: exact ? d.change.trim() : "",
    liked: d.liked.filter((id) => id !== d.exact).flatMap((id) => byId(id) ?? []),
    link: d.link.trim(),
  };
}

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
  const slots = baseSlots(c, d);
  const mixed = slots.some((b) => b && b.id !== base?.id);
  if (base)
    rows.push({ key: "base", label: l.base, text: mixed ? slots.flatMap((b, i) => (b ? [fill(w.baseLayer, { n: i + 1, base: b.label })] : [])).join("; ") : base.label, step: mixed ? 2 : 1 });
  const cream = d.cream ? cat.cream[d.cream] : undefined;
  if (cream) rows.push({ key: "cream", label: l.cream, text: cream.label + (d.exclusions.includes("no-dairy") && cream.parve ? `, ${w.parve}` : ""), step: 2 });
  const parve = (x: { parve?: boolean }) => (d.exclusions.includes("no-dairy") && x.parve ? `, ${w.parve}` : "");
  const range = layersOf(size);
  if (range.max > range.min) rows.push({ key: "layers", label: l.layers, text: fill(w.layersText, { n: layerCount(c, d) }), step: 2 });
  const fillingText = fillingsText(fillingSlots(cat, c, d), parve, w);
  if (fillingText) rows.push({ key: "filling", label: l.filling, text: fillingText, step: 2 });
  const coating = coatingsOf(c).find((x) => x.id === d.coating);
  if (coating) rows.push({ key: "coating", label: l.coating, text: coating.label + parve(coating), step: 2 });
  if (d.colors.length) rows.push({ key: "colors", label: l.colors, text: d.colors.map((id) => colorName(id, w)).join(", "), step: 2 });
  const idea = [THEMES.find((t) => t.id === d.themeId)?.label, d.theme.trim()].filter(Boolean).join(", ");
  if (idea) rows.push({ key: "theme", label: l.idea, text: idea, step: 2 });
  const insp = inspirationOf(cat, d, w);
  if (insp.exact) rows.push({ key: "inspiration", label: l.inspiration, text: [fill(w.exact, { title: insp.exact.title }), insp.keep.length ? fill(w.keep, { list: insp.keep.join(", ") }) : "", insp.change ? fill(w.change, { text: insp.change }) : ""].filter(Boolean).join("; "), step: 2 });
  if (insp.liked.length) rows.push({ key: "liked", label: l.liked, text: insp.liked.map((x) => x.title).join(", "), step: 2 });
  if (insp.link) rows.push({ key: "link", label: l.link, text: insp.link, step: 2 });
  if (d.message.trim()) rows.push({ key: "message", label: l.message, text: d.message.trim(), step: 2 });
  const addons = chosenAddons(cat, d);
  if (addons.length) rows.push({ key: "addons", label: l.addons, text: addons.map(([a, p]) => addonLine(a, p, w)).join("; "), step: 2 });
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
  layers: number;
  /** כשהשכבות לא כולן מאותו בסיס: הספוג של כל שכבה, מלמטה */
  layerBases?: { layer: number; id: string; label: string }[];
  /** רק השכבות שיש בהן מילוי (layer: 1 בין הספוג הראשון לשני) */
  fillings: { layer: number; id: string; label: string; parve: boolean }[];
  coating?: { id: string; label: string; parve: boolean };
  /** שמות הצבעים ("תבחרו אתם" כשהבחירה אצלכם) */
  colors: string[];
  themeId?: { id: string; label: string };
  theme?: string;
  inspiration?: { exact?: { id: string; title: string; keep: string[]; change?: string }; liked: { id: string; title: string }[]; link?: string };
  message?: string;
  addons: { key: string; title: string; option?: string; color?: string; qty?: number; text?: string; imageByWhatsapp?: true }[];
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
  const parve = d.exclusions.includes("no-dairy");
  const coating = coatingsOf(c).find((x) => x.id === d.coating);
  const theme = THEMES.find((t) => t.id === d.themeId);
  const insp = inspirationOf(cat, d, w);
  const sponges = baseSlots(c, d);
  return {
    category: { id: c.id, title: c.title },
    figure: c.figure ? figureOf(d.figure) : undefined,
    size: { id: size.id, label: size.label, servings: servingsOf(size, d.figure) },
    price: priceOf(size, d.figure),
    base: { id: base.id, label: base.label },
    cream: { id: cream.id, label: cream.label, parve: d.exclusions.includes("no-dairy") },
    layers: layerCount(c, d),
    ...(sponges.some((b) => b && b.id !== base.id) ? { layerBases: sponges.flatMap((b, i) => (b ? [{ layer: i + 1, id: b.id, label: b.label }] : [])) } : {}),
    fillings: fillingSlots(cat, c, d).flatMap((f, i) => (f ? [{ layer: i + 1, id: f.id, label: f.label, parve }] : [])),
    ...(coating ? { coating: { id: coating.id, label: coating.label, parve } } : {}),
    colors: d.colors.map((id) => colorName(id, w)),
    ...(theme ? { themeId: { id: theme.id, label: theme.label } } : {}),
    theme: text(d.theme),
    ...(insp.exact || insp.liked.length || insp.link
      ? {
          inspiration: {
            ...(insp.exact ? { exact: { id: insp.exact.id, title: insp.exact.title, keep: insp.keep, ...(insp.change ? { change: insp.change } : {}) } } : {}),
            liked: insp.liked.map((x) => ({ id: x.id, title: x.title })),
            ...(insp.link ? { link: insp.link } : {}),
          },
        }
      : {}),
    message: text(d.message),
    addons: chosenAddons(cat, d).map(([a, p]) => ({
      key: a.key,
      title: a.title,
      ...(p.option ? { option: a.options.find((o) => o.id === p.option)?.label } : {}),
      ...(p.color ? { color: colorName(p.color, w) } : {}),
      ...(p.qty != null ? { qty: p.qty } : {}),
      ...(p.text.trim() ? { text: p.text.trim() } : {}),
      ...(a.imageByWhatsapp ? { imageByWhatsapp: true as const } : {}),
    })),
    exclusions: EXCLUSIONS.filter((x) => d.exclusions.includes(x.id)).map(({ id, key }) => ({ id, label: w.exclusions[key].label })),
    allergy: d.allergy,
    notes: text(d.notes),
    date: d.date || undefined,
    summary: orderText(cat, d, w),
  };
}
