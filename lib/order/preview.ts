/*
  מה שההדמיה התלת־ממדית בבונה מציירת (components/builder3d), מתוך הטיוטה: צורה, צבעים, כיתוב ותוספות.
  טהור ובלי three.js, כדי שאפשר יהיה לבדוק אותו. יחידה אחת = 10 ס״מ.
  איך נראית אפשרות של תוספת נקבע לפי המקום שלה ברשימה (ב-CMS המזהים שלהן אקראיים):
  פירות: תותים, פירות יער, מעורב. פרחים: טריים, מסוכר. נרות: נרות, נר מספר, נצנצים.
*/
import { type Cat, categoryOf, chosenAddons, COLORS, type Draft, figureOf, FIGURE } from "./model";

export type PreviewShape =
  | { kind: "round"; radius: number; height: number }
  | { kind: "tiers"; tiers: { radius: number; height: number }[] }
  | { kind: "tray"; width: number; depth: number; height: number }
  | { kind: "figure"; text: string; size: number; layer: number }
  | { kind: "cupcakes"; count: number };

export type PreviewAddon =
  | { key: "piping"; color: string | null }
  | { key: "flowers"; color: string | null; fresh: boolean }
  | { key: "goldLeaf" }
  | { key: "macarons"; color: string | null; count: number }
  | { key: "fruit"; kind: "strawberries" | "berries" | "mixed" }
  | { key: "topper"; text: string }
  | { key: "sugarFigure"; color: string | null }
  | { key: "ediblePrint" }
  | { key: "candles"; kind: "candles" | "number" | "sparklers"; number: string };

export type CakeSpec = {
  shape: PreviewShape;
  /** the frosting: the first design colour chosen, otherwise the cream's own colour */
  coat: string;
  /** the second colour, for details (piping, letters' shadow side); gold when there's none */
  accent: string;
  /** the base's colour: the sponge in the cut slice, a number cake's layers, the cupcakes */
  sponge: string;
  /** what's inside, in the cut slice: the cream between the layers (its own colour, not the coat's) and the filling */
  cream: string;
  filling: string | null;
  message: string;
  addons: PreviewAddon[];
};

const NEUTRAL_CREAM = "#F6EEDF";
const NEUTRAL_SPONGE = "#E8CB97";
const GOLD = "#C9A55A";
const ROUND_HEIGHT = 1.05;
const TIERS = [
  { radius: 1.2, height: 0.95 },
  { radius: 0.8, height: 0.85 },
];
const CUPCAKES_SHOWN = 7;

const hexOf = (id: string | null | undefined) => (id ? (COLORS.find((c) => c.id === id)?.hex ?? null) : null);
const toneOf = (tone: string | [string, string] | undefined) => (Array.isArray(tone) ? tone[0] : tone);

/** the cake's shape from the size chosen (before a size: the type's first) */
function shapeOf(cat: Cat, d: Draft): PreviewShape | null {
  const c = categoryOf(cat, d.category);
  if (!c) return null;
  const size = c.sizes.find((s) => s.id === d.size) ?? c.sizes[0];
  if (!size) return null;
  const v = size.visual;
  switch (v.kind) {
    case "round":
      return { kind: "round", radius: v.cm / 20, height: ROUND_HEIGHT };
    case "tiers":
      return { kind: "tiers", tiers: TIERS };
    case "tray":
      return { kind: "tray", width: v.w / 10, depth: v.h / 10, height: 0.55 };
    case "figure": {
      const typed = figureOf(d.figure);
      return { kind: "figure", text: FIGURE.test(typed) ? typed : "1", size: 3 * v.scale, layer: 0.22 };
    }
    case "cupcakes":
      return { kind: "cupcakes", count: CUPCAKES_SHOWN };
  }
}

/** an option's place in the add-on's list (0 when there's none or it isn't found) */
const optionIndex = (options: { id: string }[], id: string | null) => Math.max(0, options.findIndex((o) => o.id === id));

export function previewOf(cat: Cat, d: Draft): CakeSpec | null {
  const shape = shapeOf(cat, d);
  if (!shape) return null;
  const c = categoryOf(cat, d.category)!;
  const cream = d.cream ? cat.cream[d.cream] : undefined;
  const palette = d.colors.map(hexOf).filter((x): x is string => !!x);
  const base = c.bases.find((b) => b.id === d.base);
  const filling = d.filling && c.fillings?.includes(d.filling) ? cat.filling[d.filling] : undefined;

  const digits = (shape.kind === "figure" ? shape.text : d.message).replace(/\D/g, "").slice(0, 3);
  const addons = chosenAddons(cat, d).map(([a, p]): PreviewAddon | null => {
    const color = hexOf(p.color);
    const at = optionIndex(a.options, p.option);
    switch (a.key) {
      case "piping":
        return { key: "piping", color };
      case "flowers":
        return { key: "flowers", color, fresh: at === 0 };
      case "goldLeaf":
        return { key: "goldLeaf" };
      case "macarons":
        return { key: "macarons", color, count: Math.min(12, Math.max(1, p.qty ?? 6)) };
      case "fruit":
        return { key: "fruit", kind: at === 0 ? "strawberries" : at === 1 ? "berries" : "mixed" };
      case "topper":
        return { key: "topper", text: p.text.trim() };
      case "sugarFigure":
        return { key: "sugarFigure", color };
      case "ediblePrint":
        return { key: "ediblePrint" };
      case "candles":
        return { key: "candles", kind: at === 1 && digits ? "number" : at === 2 ? "sparklers" : "candles", number: digits };
      default:
        return null; // an add-on this version doesn't draw yet: the summary still lists it
    }
  });

  return {
    shape,
    coat: palette[0] ?? toneOf(cream?.tone) ?? NEUTRAL_CREAM,
    accent: palette[1] ?? GOLD,
    sponge: toneOf(base?.tone) ?? NEUTRAL_SPONGE,
    cream: toneOf(cream?.tone) ?? NEUTRAL_CREAM,
    filling: toneOf(filling?.tone) ?? null,
    message: d.message.trim(),
    addons: addons.filter((x): x is PreviewAddon => !!x),
  };
}

/** how far the cake reaches (scene units), for framing it: the radius round its axis and its height */
export function extentOf(shape: PreviewShape): { radius: number; height: number } {
  switch (shape.kind) {
    case "round":
      return { radius: shape.radius, height: shape.height };
    case "tiers":
      return { radius: Math.max(...shape.tiers.map((t) => t.radius)), height: shape.tiers.reduce((h, t) => h + t.height, 0) };
    case "tray":
      return { radius: Math.hypot(shape.width, shape.depth) / 2, height: shape.height };
    case "figure": {
      const n = Math.max(1, shape.text.length);
      return { radius: Math.hypot(shape.size * 0.6 * n, shape.size) / 2, height: shape.layer * 3 };
    }
    case "cupcakes":
      return { radius: 1.25, height: 0.9 };
  }
}

const HEBREW = /[\u0590-\u05FF]/;
const STRONG_LTR = /[0-9A-Za-z\u0400-\u04FF]/;

/**
 * The characters in the order they're drawn, left to right. A line with Hebrew in it reads right
 * to left, but numbers and Latin or Cyrillic words inside it keep their own order ("מזל טוב 30" is
 * drawn "30 בוט לזמ"). Neutral characters between two left-to-right runs stay with them.
 */
export function visualOrder(text: string): string[] {
  const chars = [...text];
  if (!chars.some((ch) => HEBREW.test(ch))) return chars;
  const runs: { ltr: boolean; chars: string[] }[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    let ltr = STRONG_LTR.test(ch);
    if (!ltr && !HEBREW.test(ch)) {
      const prev = chars.slice(0, i).reverse().find((x) => STRONG_LTR.test(x) || HEBREW.test(x));
      const next = chars.slice(i + 1).find((x) => STRONG_LTR.test(x) || HEBREW.test(x));
      ltr = !!prev && !!next && STRONG_LTR.test(prev) && STRONG_LTR.test(next);
    }
    const last = runs.at(-1);
    if (last && last.ltr === ltr) last.chars.push(ch);
    else runs.push({ ltr, chars: [ch] });
  }
  return runs.reverse().flatMap((r) => (r.ltr ? r.chars : r.chars.reverse()));
}

/** what of the text the 3D font can draw (anything else, an emoji say, is left out) */
export const drawable = (text: string, has: (ch: string) => boolean) =>
  [...text]
    .filter((ch) => ch === " " || has(ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
