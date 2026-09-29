/*
  The owner's texts from the CMS, laid over the built-in ones (content.ts), field by field, so
  the page always gets every text it needs, in the shape it expects:

    - a field the built-in content doesn't have is ignored; one of the wrong kind is ignored
    - a required text left empty: the built-in one on the live site. In the Studio's preview
      (strict), what the draft really says, even if that's nothing, so the owner sees her edit
    - an optional text (a list of paths): empty means hidden, in both
    - a list: all of the owner's items, or (the wrong number of items) the built-in list. Inside
      a list nothing falls back: an item shows what it has, since items can be reordered; an
      item that can't work without a field (a menu link without a place to go: `drop`) is left out
    - a value the site can't use (a link that isn't one of its pages, a time that isn't HH:MM,
      a letter the 3D font doesn't have) is refused like an empty one, and reported
    - a section (object) the document doesn't have at all: the built-in section, whole

  Checks look at the text without the preview's invisible characters (lib/stega.ts); the text
  that's passed on keeps them, except on the paths listed in `clean`.
  Paths: "hero.sub", "header.nav[].href" ([] = every item of a list).
*/
import { clean } from "@/lib/stega";

export type Rules = {
  /** texts that may be empty (hidden), never replaced by the built-in text */
  optional?: string[];
  /** lists that need a number of items [min, max]; outside it, the built-in list */
  length?: Record<string, [min: number, max: number]>;
  /** values the site can use, checked without the invisible characters */
  valid?: Record<string, (value: unknown) => boolean>;
  /** values passed on without the invisible characters (the 3D letters) */
  clean?: string[];
  /** fields of list items that an item can't do without: an item left without one is dropped */
  drop?: string[];
};

type Ctx = {
  optional: Set<string>;
  length: Record<string, [number, number]>;
  valid: Record<string, (value: unknown) => boolean>;
  clean: Set<string>;
  drop: string[];
  strict: boolean;
  problems: string[];
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function mergeContent<T>(defaults: T, cms: unknown, rules: Rules, options: { strict?: boolean; problems?: string[] } = {}): T {
  if (!isObject(cms)) return defaults;
  const ctx: Ctx = {
    optional: new Set(rules.optional),
    length: rules.length ?? {},
    valid: rules.valid ?? {},
    clean: new Set(rules.clean),
    drop: rules.drop ?? [],
    strict: options.strict ?? false,
    problems: options.problems ?? [],
  };
  return mergeObject(defaults as Record<string, unknown>, cms, "", false, ctx) as T;
}

function merge(def: unknown, cms: unknown, path: string, inList: boolean, ctx: Ctx): unknown {
  if (Array.isArray(def)) return mergeList(def, cms, path, inList, ctx);
  if (typeof def === "string") return mergeText(def, cms, path, inList, ctx);
  if (def === null || typeof def === "number") {
    if (typeof cms === "number" && Number.isFinite(cms)) return cms;
    return inList ? null : def;
  }
  if (isObject(def)) {
    if (isObject(cms)) return mergeObject(def, cms, path, inList, ctx);
    return inList ? emptyOf(def) : def;
  }
  return def;
}

function mergeObject(def: Record<string, unknown>, cms: Record<string, unknown>, path: string, inList: boolean, ctx: Ctx) {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(def)) out[key] = merge(def[key], cms[key], path ? `${path}.${key}` : key, inList, ctx);
  return out;
}

function mergeText(def: string, cms: unknown, path: string, inList: boolean, ctx: Ctx): string {
  // cleared in the Studio (Sanity removes an emptied field) or never filled in
  const empty = inList || ctx.optional.has(path) || ctx.strict ? "" : def;
  if (typeof cms !== "string") return empty;
  const plain = clean(cms);
  if (!plain.trim()) return empty;
  const check = ctx.valid[path];
  if (check && !check(plain)) {
    ctx.problems.push(`${path}: "${plain}" can't be used`);
    return inList || ctx.optional.has(path) ? "" : def;
  }
  return ctx.clean.has(path) ? plain : cms;
}

function mergeList(def: unknown[], cms: unknown, path: string, inList: boolean, ctx: Ctx): unknown[] {
  if (!Array.isArray(cms)) return inList ? [] : def;
  const check = ctx.valid[path];
  if (check) {
    // a list checked as a whole (the days of an hours row): the owner's, or none of it
    const plain = clean(cms);
    if (check(plain)) return plain;
    ctx.problems.push(`${path}: ${JSON.stringify(plain)} can't be used`);
    return inList ? [] : def;
  }
  const template = def[0];
  const items = cms.flatMap((item): unknown[] => {
    if (typeof template === "string") {
      const text = mergeText("", item, `${path}[]`, true, ctx);
      return clean(text).trim() ? [text] : [];
    }
    if (isObject(template) && isObject(item)) {
      const merged = mergeObject(template, item, `${path}[]`, true, ctx);
      const without = ctx.drop.filter((p) => p.startsWith(`${path}[].`) && merged[p.slice(path.length + 3)] === "");
      if (without.length) {
        ctx.problems.push(`${path}: an item without ${without.map((p) => p.slice(path.length + 3)).join(", ")} was left out`);
        return [];
      }
      return [typeof item._key === "string" ? { ...merged, _key: item._key } : merged];
    }
    return [];
  });
  const [min, max] = ctx.length[path] ?? [0, 100];
  if (items.length < min || items.length > max) {
    ctx.problems.push(`${path}: ${items.length} items, the page needs ${min === max ? min : `${min} to ${max}`}`);
    return inList ? items.slice(0, max) : def;
  }
  return items;
}

function emptyOf(def: unknown): unknown {
  if (Array.isArray(def)) return [];
  if (typeof def === "string") return "";
  if (typeof def === "number" || def === null) return null;
  if (isObject(def)) return Object.fromEntries(Object.entries(def).map(([k, v]) => [k, emptyOf(v)]));
  return def;
}
