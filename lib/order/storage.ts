/*
  The cake builder, saved in this browser: a customer who leaves halfway finds the wizard where
  they left it. Only the draft and the step are kept (never a phone number), in localStorage, for
  a week; sending the order or starting over removes it.

  What comes back is checked like anything else from outside: the envelope, the Draft schema, then
  today's catalog (a size or cream the owner has since removed is dropped) and today's date (a
  date that has passed is cleared). A field that fails the schema starts over on its own (a
  year typed with five digits shouldn't cost the whole cake). Storage that throws (private
  browsing, blocked, full) just means nothing is saved.
*/
import { addonProblem, type Cat, type Category, categoryOf, coatingsOf, COLORS, type Draft, EMPTY, isTheme, LAST, layerCount, layersOf, type Step, SURPRISE } from "./model";
import { asDraft, DraftSchema } from "./schema";

const KEY = "lali:wizard:v1";
const WEEK = 7 * 24 * 60 * 60 * 1000;

export type SavedWizard = { step: Step; reached: Step; draft: Draft };

const isStep = (n: unknown): n is Step => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= LAST;

/** Today in this browser, YYYY-MM-DD (the same date the wizard's date field starts from) */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** the layers within what the size allows, a filling for each gap the catalog still offers, an offered coating */
function fitInside(cat: Cat, c: Category, d: Draft): Pick<Draft, "layers" | "layerBases" | "fillings" | "coating"> {
  const range = layersOf(c.sizes.find((s) => s.id === d.size));
  const layers = d.layers != null && d.layers >= range.min && d.layers <= range.max ? d.layers : null;
  const gaps = layerCount(c, { size: d.size, layers }) - 1;
  return {
    layers,
    layerBases: d.layerBases.slice(0, gaps + 1).map((id) => (id && c.bases.some((b) => b.id === id) ? id : null)),
    fillings: d.fillings.slice(0, gaps).map((id) => (id && c.fillings?.includes(id) && cat.filling[id] ? id : null)),
    coating: d.coating && coatingsOf(c).some((x) => x.id === d.coating) ? d.coating : null,
  };
}

/** Keeps only what the catalog still offers, and clears a date that has passed */
export function fitToCatalog(cat: Cat, d: Draft, today: string): Draft {
  const c = categoryOf(cat, d.category);
  if (!c) return { ...EMPTY };
  const offered = (id: string | null, list: { id: string }[]) => (id && list.some((o) => o.id === id) ? id : null);
  return {
    ...d,
    figure: c.figure ? d.figure : "",
    size: offered(d.size, c.sizes),
    base: offered(d.base, c.bases),
    cream: d.cream && c.creams.includes(d.cream) && cat.cream[d.cream] ? d.cream : null,
    ...fitInside(cat, c, d),
    themeId: d.themeId && isTheme(d.themeId) ? d.themeId : null,
    liked: d.liked.filter((id, i, all) => all.indexOf(id) === i && cat.portfolio.some((p) => p.id === id)),
    exact: d.exact && cat.portfolio.some((p) => p.id === d.exact) ? d.exact : null,
    colors: d.colors.filter((id) => id === SURPRISE || COLORS.some((x) => x.id === id)),
    addons: d.addons.filter((p, i, all) => all.findIndex((x) => x.key === p.key) === i && !addonProblem(cat, c.id, p)),
    date: d.date && d.date >= today ? d.date : "",
  };
}

/** What this browser saved, checked and fitted to today's catalog; null when there's nothing to restore */
export function loadWizard(cat: Cat, today: string, now = Date.now()): SavedWizard | null {
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
  if (!saved || typeof saved !== "object") return null;
  const { v, savedAt, step, reached, draft } = saved as Record<string, unknown>;
  if (v !== 1 || typeof savedAt !== "number" || now - savedAt > WEEK || savedAt > now + 60_000) return null;
  if (!isStep(step) || !isStep(reached)) return null;
  const parsed = parseDraft(draft);
  if (!parsed) return null;
  const fitted = fitToCatalog(cat, parsed, today);
  if (!fitted.category) return null;
  return { step, reached: Math.max(step, reached) as Step, draft: fitted };
}

/** The saved draft through the schema; a field that fails it goes back to empty */
function parseDraft(value: unknown): Draft | null {
  let parsed = DraftSchema.safeParse(value);
  if (!parsed.success && value && typeof value === "object" && !Array.isArray(value)) {
    const repaired: Record<string, unknown> = { ...value };
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && key in EMPTY) repaired[key] = EMPTY[key as keyof Draft];
    }
    parsed = DraftSchema.safeParse(repaired);
  }
  return parsed.success ? asDraft(parsed.data) : null;
}

export function saveWizard(saved: SavedWizard, now = Date.now()): void {
  try {
    if (!saved.draft.category) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ v: 1, savedAt: now, ...saved }));
  } catch {
    // private browsing, blocked or full storage: the wizard just isn't saved
  }
}

export function clearWizard(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing was saved
  }
}
