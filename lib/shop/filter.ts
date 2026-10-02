/*
  The catalog's filters, kept in the address so a filtered page can be shared and found:
    /products?occasion=birthday,wedding&diet=parve&servings=10to20&sort=price-asc

  The same code runs on the server (the page's first load) and in the browser (every change after
  it, with no request to the server), so both show the same products.

  The address is typed by anyone, so it's read strictly: each parameter has a length limit, each
  value must look like a slug, and a value the catalog doesn't have is dropped. A bad address never
  fails: it shows the catalog with the filters that make sense.

  Within a group, any of the choices (a birthday or a wedding cake); across groups, all of them.
  Diets and allergens are the exception: every diet chosen, and none of the allergens chosen.
*/
import * as z from "zod/mini";
import { ALLERGENS, type Allergen } from "./normalize";
import { DIET_KEYS, type CatalogCard, type CatalogTerms, type DietKey } from "./catalog";

export const SERVING_BUCKETS = {
  upTo10: [1, 10],
  "10to20": [10, 20],
  "20to40": [20, 40],
  over40: [41, 500],
} as const satisfies Record<string, readonly [number, number]>;
export type ServingBucket = keyof typeof SERVING_BUCKETS;
const BUCKET_KEYS = Object.keys(SERVING_BUCKETS) as ServingBucket[];

export const SORTS = ["featured", "price-asc", "price-desc"] as const;
export type Sort = (typeof SORTS)[number];

/** How a diet appears in the address */
const DIET_SLUG: Record<DietKey, string> = {
  parve: "parve",
  glutenFreeRecipe: "gluten-free-recipe",
  noAddedSugar: "no-added-sugar",
  nutFree: "nut-free-recipe",
};

export type Filters = {
  category: string[];
  occasion: string[];
  style: string[];
  servings: ServingBucket[];
  diet: DietKey[];
  free: Allergen[];
  sort: Sort;
};

export type TermGroup = "category" | "occasion" | "style";
export type ListGroup = Exclude<keyof Filters, "sort">;
export const GROUPS: ListGroup[] = ["category", "occasion", "style", "servings", "diet", "free"];

export const NO_FILTERS: Filters = { category: [], occasion: [], style: [], servings: [], diet: [], free: [], sort: "featured" };

const MAX_PARAM = 400;
const MAX_VALUES = 20;
const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const param = z.string().check(z.maxLength(MAX_PARAM));

export type SearchInput = URLSearchParams | Record<string, string | string[] | undefined>;

function read(input: SearchInput, key: string): string {
  const raw = input instanceof URLSearchParams ? input.get(key) : input[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = z.safeParse(param, value ?? "");
  return parsed.success ? parsed.data : "";
}

/** The values of one parameter that are in `allowed`, in `allowed`'s order (one address per choice) */
function values<T extends string>(input: SearchInput, key: string, allowed: readonly T[], slugOf: (v: T) => string = (v) => v): T[] {
  const given = new Set(
    read(input, key)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length <= 80 && SLUG.test(s))
      .slice(0, MAX_VALUES),
  );
  return allowed.filter((v) => given.has(slugOf(v)));
}

/** The filters in an address; only the catalog's own choices count */
export function parseFilters(input: SearchInput, terms: CatalogTerms): Filters {
  const sort = read(input, "sort");
  return {
    category: values(input, "category", terms.category.map((t) => t.slug)),
    occasion: values(input, "occasion", terms.occasion.map((t) => t.slug)),
    style: values(input, "style", terms.style.map((t) => t.slug)),
    servings: values(input, "servings", BUCKET_KEYS),
    diet: values(input, "diet", DIET_KEYS, (d) => DIET_SLUG[d]),
    free: values(input, "free", ALLERGENS),
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : "featured",
  };
}

/** The filters as an address's query ("" when there are none), always in the same order */
export function filtersQuery(f: Filters): string {
  const q = new URLSearchParams();
  const put = (key: string, list: string[]) => {
    if (list.length) q.set(key, list.join(","));
  };
  put("category", f.category);
  put("occasion", f.occasion);
  put("style", f.style);
  put("servings", f.servings);
  put("diet", f.diet.map((d) => DIET_SLUG[d]));
  put("free", f.free);
  if (f.sort !== "featured") q.set("sort", f.sort);
  const s = q.toString().replace(/%2C/g, ",");
  return s ? `?${s}` : "";
}

export const activeCount = (f: Filters) => GROUPS.reduce((n, g) => n + f[g].length, 0);

const overlaps = (ranges: [number, number][], [lo, hi]: readonly [number, number]) => ranges.some(([a, b]) => a <= hi && b >= lo);

function matches(c: CatalogCard, f: Filters): boolean {
  if (f.category.length && !f.category.includes(c.category)) return false;
  if (f.occasion.length && !f.occasion.some((o) => c.occasions.includes(o))) return false;
  if (f.style.length && !f.style.some((s) => c.styles.includes(s))) return false;
  if (f.servings.length && !f.servings.some((b) => overlaps(c.servings, SERVING_BUCKETS[b]))) return false;
  if (f.diet.some((d) => !c.diet.includes(d))) return false;
  if (f.free.some((a) => c.allergens.includes(a))) return false;
  return true;
}

function compare(sort: Sort) {
  return (a: CatalogCard, b: CatalogCard) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (sort !== "featured" && a.fromAgorot !== null && b.fromAgorot !== null && a.fromAgorot !== b.fromAgorot) {
      return sort === "price-asc" ? a.fromAgorot - b.fromAgorot : b.fromAgorot - a.fromAgorot;
    }
    if (sort === "featured" && a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.rank - b.rank;
  };
}

/** The cards that pass the filters, sorted (what can't be ordered now goes last) */
export function applyFilters(cards: CatalogCard[], f: Filters): CatalogCard[] {
  return cards.filter((c) => matches(c, f)).sort(compare(f.sort));
}

/** The filters with one choice switched on or off (the choice is one of the group's: parseFilters made the options) */
export function toggle(f: Filters, group: ListGroup, value: string): Filters {
  const list = f[group] as string[];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...f, [group]: next };
}

/**
 * How many products a choice would show if it were picked now, with the other filters as they are.
 * In an "any of" group the group's other choices don't narrow it; in an "all of" group they do.
 */
export function countWith(cards: CatalogCard[], f: Filters, group: ListGroup, value: string): number {
  const anyOf = group !== "diet" && group !== "free";
  const list = f[group] as string[];
  const probe: Filters = { ...f, [group]: anyOf ? [value] : list.includes(value) ? list : [...list, value] };
  return cards.reduce((n, c) => (matches(c, probe) ? n + 1 : n), 0);
}

/** The servings ranges, diets and allergens worth offering: the ones that change the result */
export function offered(cards: CatalogCard[]) {
  return {
    servings: BUCKET_KEYS.filter((b) => cards.some((c) => overlaps(c.servings, SERVING_BUCKETS[b]))),
    diet: DIET_KEYS.filter((d) => cards.some((c) => c.diet.includes(d))),
    free: ALLERGENS.filter((a) => cards.some((c) => c.allergens.includes(a)) && cards.some((c) => !c.allergens.includes(a))),
  };
}
