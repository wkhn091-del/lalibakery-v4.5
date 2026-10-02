/*
  Everything the server needs before it trusts an order from the browser:
    1. the shape and sizes (OrderSchema): unknown fields dropped, text cleaned and capped
    2. the catalog: the category, size, base, cream, colours and add-ons exist, and belong together
    3. the allergy conflicts the wizard itself blocks on
    4. a date that hasn't passed (Israel time, as the database checks it)
  The order that comes back is rebuilt from the catalog by the same code the wizard uses
  (model.ts): whatever price, label or summary text the browser sent is never read. Its words
  (the summary's labels, the colour names…) are the built-in ones unless the caller passes the
  owner's: getCakePage(false).wizard.order (sanity/content.ts), as the wizard itself shows them.
*/
import * as z from "zod/mini";
import { addonProblem, type CakeOrder, type Cat, categoryOf, coatingsOf, COLORS, type Draft, FIGURE, figureOf, isTheme, issuesOf, layerCount, layersOf, ORDER_WORDS, orderOf, type OrderWords, sizeOf, SURPRISE } from "./model";
import { OrderSchema } from "./schema";

export type FieldErrors = Partial<Record<keyof Draft | "catalog", string[]>>;
export type Validation = { ok: true; order: CakeOrder; draft: Draft } | { ok: false; fields: FieldErrors };

/** Today's date in Israel, YYYY-MM-DD */
export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function validateOrder(input: unknown, cat: Cat, today = israelToday(), words: OrderWords = ORDER_WORDS): Validation {
  const parsed = OrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fields: z.flattenError(parsed.error).fieldErrors };

  const d: Draft = {
    ...parsed.data,
    exclusions: [...new Set(parsed.data.exclusions)],
    colors: [...new Set(parsed.data.colors)],
    liked: [...new Set(parsed.data.liked)],
    keep: [...new Set(parsed.data.keep)],
  };
  const fields: FieldErrors = {};
  const fail = (key: keyof FieldErrors, message: string) => (fields[key] ??= []).push(message);

  const c = categoryOf(cat, d.category);
  if (!c) fail("category", "Not in the catalog");
  else {
    if (c.figure && !FIGURE.test(figureOf(d.figure))) fail("figure", "Up to 3 digits or letters");
    if (!c.sizes.some((s) => s.id === d.size)) fail("size", "Not offered for this cake");
    if (!c.bases.some((b) => b.id === d.base)) fail("base", "Not offered for this cake");
    if (!d.cream || !c.creams.includes(d.cream) || !cat.cream[d.cream]) fail("cream", "Not offered for this cake");
    const range = layersOf(sizeOf(c, d));
    if (d.layers != null && (d.layers < range.min || d.layers > range.max)) fail("layers", "Not offered for this size");
    if (d.layerBases.length > layerCount(c, d)) fail("layerBases", "More bases than layers");
    if (d.layerBases.some((id) => id != null && !c.bases.some((b) => b.id === id))) fail("layerBases", "Not offered for this cake");
    if (d.fillings.length > layerCount(c, d) - 1) fail("fillings", "More fillings than layers");
    if (d.fillings.some((id) => id != null && (!c.fillings?.includes(id) || !cat.filling[id]))) fail("fillings", "Not offered for this cake");
    if (d.coating != null && !coatingsOf(c).some((x) => x.id === d.coating)) fail("coating", "Not offered for this cake");
  }
  if (d.themeId != null && !isTheme(d.themeId)) fail("themeId", "Not a theme");
  const inPortfolio = (id: string) => cat.portfolio.some((p) => p.id === id);
  if (d.liked.some((id) => !inPortfolio(id))) fail("liked", "Not in the gallery");
  if (d.exact != null && !inPortfolio(d.exact)) fail("exact", "Not in the gallery");
  if (d.colors.some((id) => id !== SURPRISE && !COLORS.some((x) => x.id === id))) fail("colors", "Not in the palette");
  if (d.colors.includes(SURPRISE) && d.colors.length > 1) fail("colors", "\"Surprise me\" goes alone");
  if (new Set(d.addons.map((a) => a.key)).size !== d.addons.length) fail("addons", "Each add-on once");
  for (const p of d.addons) {
    const problem = addonProblem(cat, d.category, p);
    if (problem) fail("addons", problem);
  }
  if (d.date && d.date < today) fail("date", "The date has passed");
  const FIELD_OF = { "conflict-base": "base", conflict: "cream", "conflict-filling": "fillings", "conflict-coating": "coating" } as const;
  for (const issue of issuesOf(cat, d, words)) {
    const key = issue.kind === "conflict" ? FIELD_OF[issue.id as keyof typeof FIELD_OF] : undefined;
    if (key && !fields[key]) fail(key, "Conflicts with the exclusions");
  }
  if (Object.keys(fields).length) return { ok: false, fields };

  const order = orderOf(cat, d, words);
  return order ? { ok: true, order, draft: d } : { ok: false, fields: { catalog: ["Incomplete order"] } };
}
