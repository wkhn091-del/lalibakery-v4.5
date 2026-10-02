/*
  The shop's content from the CMS, checked and put in the shapes the site works with: the catalog
  (products and their filters), the shop's settings, the builder's add-ons, the legal pages.

  Every document is checked against its schema (Zod) after the preview's invisible characters are
  taken off a copy (lib/stega.ts): ids, slugs, prices and choices are compared, so they must be
  exact. Texts that are shown keep those characters (from the original), so in the Studio's preview
  a click on a product's name still opens its field.

  A document that doesn't pass isn't shown, and the server log says why (the Studio's own checks
  make that rare). Nothing is guessed: no default price, no default delivery fee.

  Money leaves this file in agorot (whole numbers), the unit every calculation and the database
  use. The Studio has the owner type shekels, so ₪49.90 is 4990 here.
*/
import * as z from "zod/mini";
import type { CmsImage } from "@/sanity/image";
import { clean } from "@/lib/stega";
import { LOCALES, type Localized } from "@/lib/i18n/config";

/* ───────── the fixed lists (they match the Studio's: lib/shop/normalize.test.ts checks) ───────── */

export const ALLERGENS = ["gluten", "eggs", "dairy", "nuts", "peanuts", "soy", "sesame"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const BUILDER_CATEGORIES = ["number", "designer", "birthday", "kindergarten"] as const;
export type BuilderCategory = (typeof BUILDER_CATEGORIES)[number];

export const ADDON_KEYS = ["piping", "flowers", "goldLeaf", "macarons", "fruit", "topper", "sugarFigure", "ediblePrint", "candles", "inscription"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];

export const LEGAL_KEYS = ["terms", "privacy", "shipping", "cancellation", "allergens"] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

/* ───────── what the site works with ───────── */

export type ShopVariant = {
  /** the Studio's `_key` of the size: what carts and orders keep */
  id: string;
  label: Localized;
  servings?: [min: number, max: number];
  priceAgorot: number;
  available: boolean;
};

export type BundleLine = { productId: string; variantId: string; quantity: number };

export type ShopProduct = {
  id: string;
  slug: string;
  kind: "single" | "bundle";
  title: Localized;
  summary: Localized;
  description: Localized;
  seoDescription: Localized;
  categoryId: string;
  images: (CmsImage & { alt: string })[];
  variants: ShopVariant[];
  /** what a bundle holds (empty for a single product) */
  bundle: BundleLine[];
  occasionIds: string[];
  styleIds: string[];
  kosher: "dairy" | "parve";
  diet: { glutenFreeRecipe: boolean; noAddedSugar: boolean; nutFree: boolean };
  allergens: Allergen[];
  featured: boolean;
};

export type ShopTerm = { id: string; slug: string; title: Localized; description?: Localized; image?: CmsImage; swatch?: string };

export type ShopCatalog = {
  products: ShopProduct[];
  categories: ShopTerm[];
  occasions: ShopTerm[];
  styles: ShopTerm[];
};

export type DeliveryWindow = { id: string; days: number[]; from: string; to: string };
export type DeliveryZone = { id: string; name: Localized; feeAgorot: number; freeAboveAgorot?: number; cities: string[] };
export type LaunchPromo = {
  label: Localized;
  type: "percent" | "amount";
  /** whole percent (1–50), or agorot */
  value: number;
  minSubtotalAgorot?: number;
  startsAt: string;
  endsAt: string;
};

export type StoreSettings = {
  /** cakes a day, Sunday (0) to Saturday (6); 0 is a closed day */
  capacityByWeekday: number[];
  leadBusinessDays: number;
  maxAdvanceDays: number;
  blockedDates: { from: string; to: string }[];
  pickupEnabled: boolean;
  pickupNote: Localized;
  deliveryWindows: DeliveryWindow[];
  deliveryZones: DeliveryZone[];
  /** the launch promo when it's switched on and complete (whether it's running now is the pricing's call) */
  launchPromo: LaunchPromo | null;
  catalogCancellationDays: number;
  kosher: { authority?: string; certificate?: CmsImage; validUntil?: string };
  business: { legalName?: string; businessType?: "exempt" | "licensed" | "company"; businessNumber?: string; legalAddress?: string; legalEmail?: string };
};

export type BuilderAddon = {
  key: AddonKey;
  title: Localized;
  description: Localized;
  categories: BuilderCategory[];
  options: { id: string; label: Localized }[];
  colorable: boolean;
  /** 0: no free text */
  textMax: number;
  quantity?: [min: number, max: number];
  imageByWhatsapp: boolean;
};

export type LegalPage = { key: LegalKey; title: Localized; updatedAt: string; body: Localized<unknown[]> };

/* ───────── the checks ───────── */

type Problem = (what: string, reason: string) => void;
const warn: Problem = (what, reason) => console.warn(`[sanity] ${what} isn't shown: ${reason}`);

const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const id = z.string().check(z.minLength(1), z.maxLength(128));
const str = (max: number) => z.string().check(z.maxLength(max));
const int = (min: number, max: number) => z.int().check(z.gte(min), z.lte(max));
const slug = z.string().check(z.maxLength(80), z.regex(SLUG));
const date = z.iso.date();
const time = z.string().check(z.regex(TIME));
/** shekels with at most two decimals, as the Studio allows */
const shekels = (min: number) => z.number().check(z.gte(min), z.lte(100_000), z.refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "more than two decimals"));

const localized = (max: number) => z.nullish(z.object({ he: z.nullish(str(max)), en: z.nullish(str(max)), ru: z.nullish(str(max)) }));
const requiredLocalized = (max: number) =>
  z.object({ he: z.nullish(str(max)), en: z.nullish(str(max)), ru: z.nullish(str(max)) }).check(z.refine((v) => !!v.he?.trim(), "no Hebrew"));

const image = z.looseObject({ asset: z.looseObject({ _id: id }), alt: z.nullish(str(160)) });

const toAgorot = (shekel: number) => Math.round(shekel * 100);

/** The shown text of a localized field, from the original document (the preview keeps its links) */
function texts(raw: unknown): Localized {
  const out: Localized = {};
  if (!raw || typeof raw !== "object") return out;
  for (const l of LOCALES) {
    const v = (raw as Record<string, unknown>)[l];
    if (typeof v === "string" && v.trim()) out[l] = v;
  }
  return out;
}

function issues(error: z.core.$ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "document"}: ${i.message}`)
    .join("; ");
}

/** Check a document: the cleaned copy against the schema, or null (logged) */
function check<S extends z.ZodMiniType>(schema: S, raw: unknown, what: string, problem: Problem): z.infer<S> | null {
  const result = z.safeParse(schema, clean(raw));
  if (result.success) return result.data;
  problem(what, issues(result.error));
  return null;
}

const at = (raw: unknown, ...path: (string | number)[]) =>
  path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string | number, unknown>)[k] : undefined), raw);

/* ───────── the catalog ───────── */

const TermDoc = z.object({
  _id: id,
  title: requiredLocalized(40),
  slug,
  description: localized(200),
  image: z.nullish(image),
  swatch: z.nullish(z.string().check(z.regex(HEX))),
});

const VariantDoc = z.object({
  _key: id,
  label: requiredLocalized(40),
  servingsMin: z.nullish(int(1, 500)),
  servingsMax: z.nullish(int(1, 500)),
  price: shekels(1),
  available: z.nullish(z.boolean()),
});

const ProductDoc = z.object({
  _id: id,
  kind: z.enum(["single", "bundle"]),
  title: requiredLocalized(80),
  slug,
  summary: localized(160),
  description: localized(1500),
  seoDescription: localized(160),
  categoryId: id,
  images: z.array(image.check(z.refine((img) => !!img.alt?.trim(), "a photo has no alt text"))).check(z.minLength(1), z.maxLength(8)),
  variants: z.array(VariantDoc).check(z.minLength(1), z.maxLength(8)),
  bundleItems: z.nullish(z.array(z.object({ product: z.nullish(id), variantKey: z.nullish(id), quantity: int(1, 48) })).check(z.maxLength(12))),
  occasionIds: z.nullish(z.array(z.nullish(id))),
  styleIds: z.nullish(z.array(z.nullish(id))),
  kosher: z.enum(["dairy", "parve"]),
  diet: z.nullish(z.object({ glutenFreeRecipe: z.nullish(z.boolean()), noAddedSugar: z.nullish(z.boolean()), nutFree: z.nullish(z.boolean()) })),
  allergens: z.nullish(z.array(z.enum(ALLERGENS))),
  featured: z.nullish(z.boolean()),
});

function terms(raws: unknown[] | null | undefined, kind: string, problem: Problem): ShopTerm[] {
  const out: ShopTerm[] = [];
  const slugs = new Set<string>();
  for (const raw of raws ?? []) {
    const doc = check(TermDoc, raw, `${kind} ${String(at(raw, "_id"))}`, problem);
    if (!doc) continue;
    if (slugs.has(doc.slug)) {
      problem(`${kind} ${doc._id}`, `its address "${doc.slug}" is already used by another ${kind}`);
      continue;
    }
    slugs.add(doc.slug);
    out.push({
      id: doc._id,
      slug: doc.slug,
      title: texts(at(raw, "title")),
      ...(doc.description ? { description: texts(at(raw, "description")) } : {}),
      ...(doc.image ? { image: doc.image as CmsImage } : {}),
      ...(doc.swatch ? { swatch: doc.swatch } : {}),
    });
  }
  return out;
}

function variantOf(doc: z.infer<typeof VariantDoc>, raw: unknown): ShopVariant {
  const servings: [number, number] | undefined =
    doc.servingsMin != null && doc.servingsMax != null && doc.servingsMax >= doc.servingsMin ? [doc.servingsMin, doc.servingsMax] : undefined;
  return { id: doc._key, label: texts(at(raw, "label")), ...(servings ? { servings } : {}), priceAgorot: toAgorot(doc.price), available: doc.available !== false };
}

export type RawCatalog = { products?: unknown[] | null; categories?: unknown[] | null; occasions?: unknown[] | null; styles?: unknown[] | null };

/**
 * The shop's catalog, checked. A product is shown only when it's complete and everything it points
 * to is published: its category, and for a bundle every product and size inside it.
 */
export function normalizeCatalog(raw: RawCatalog, problem: Problem = warn): ShopCatalog {
  const categories = terms(raw.categories, "shop category", problem);
  const occasions = terms(raw.occasions, "occasion", problem);
  const styles = terms(raw.styles, "style", problem);
  const categoryIds = new Set(categories.map((c) => c.id));
  const occasionIds = new Set(occasions.map((o) => o.id));
  const styleIds = new Set(styles.map((s) => s.id));

  const checked: ShopProduct[] = [];
  const slugs = new Set<string>();
  for (const rawProduct of raw.products ?? []) {
    const what = `product ${String(at(rawProduct, "_id"))}`;
    const doc = check(ProductDoc, rawProduct, what, problem);
    if (!doc) continue;
    if (!categoryIds.has(doc.categoryId)) {
      problem(what, "its category isn't published");
      continue;
    }
    if (slugs.has(doc.slug)) {
      problem(what, `its address "${doc.slug}" is already used by another product`);
      continue;
    }
    const keys = doc.variants.map((v) => v._key);
    if (new Set(keys).size !== keys.length) {
      problem(what, "two of its sizes have the same key");
      continue;
    }
    if (doc.kind === "bundle" && (doc.variants.length !== 1 || !doc.bundleItems?.length)) {
      problem(what, "a bundle needs exactly one size (its price) and at least one item");
      continue;
    }
    slugs.add(doc.slug);
    checked.push({
      id: doc._id,
      slug: doc.slug,
      kind: doc.kind,
      title: texts(at(rawProduct, "title")),
      summary: texts(at(rawProduct, "summary")),
      description: texts(at(rawProduct, "description")),
      seoDescription: texts(at(rawProduct, "seoDescription")),
      categoryId: doc.categoryId,
      images: doc.images.map((img, i) => ({ ...(img as CmsImage), alt: String(at(rawProduct, "images", i, "alt") ?? img.alt ?? "") })),
      variants: doc.variants.map((v, i) => variantOf(v, at(rawProduct, "variants", i))),
      bundle:
        doc.kind === "bundle"
          ? (doc.bundleItems ?? []).map((item) => ({ productId: item.product ?? "", variantId: item.variantKey ?? "", quantity: item.quantity }))
          : [],
      occasionIds: [...new Set((doc.occasionIds ?? []).filter((o): o is string => !!o && occasionIds.has(o)))],
      styleIds: [...new Set((doc.styleIds ?? []).filter((s): s is string => !!s && styleIds.has(s)))],
      kosher: doc.kosher,
      diet: { glutenFreeRecipe: !!doc.diet?.glutenFreeRecipe, noAddedSugar: !!doc.diet?.noAddedSugar, nutFree: !!doc.diet?.nutFree },
      allergens: [...new Set(doc.allergens ?? [])],
      featured: !!doc.featured,
    });
  }

  // a bundle holds single products that are shown, in sizes they still have
  const singles = new Map(checked.filter((p) => p.kind === "single").map((p) => [p.id, p]));
  const products = checked.filter((p) => {
    if (p.kind !== "bundle") return true;
    const seen = new Set<string>();
    for (const line of p.bundle) {
      const item = singles.get(line.productId);
      const variant = item?.variants.find((v) => v.id === line.variantId);
      if (!item || !variant) {
        problem(`product ${p.id}`, `the bundle holds a product or size that isn't shown (${line.productId || "?"} / ${line.variantId || "?"})`);
        return false;
      }
      const key = `${line.productId}:${line.variantId}`;
      if (seen.has(key)) {
        problem(`product ${p.id}`, "the bundle lists the same product and size twice");
        return false;
      }
      seen.add(key);
    }
    return true;
  });

  return { products, categories, occasions, styles };
}

/* ───────── the shop's settings ───────── */

const SettingsDoc = z.object({
  dailyCapacity: int(1, 50),
  weekdayCapacity: z.nullish(z.array(z.object({ day: int(0, 6), capacity: int(0, 50) })).check(z.maxLength(7))),
  leadBusinessDays: int(0, 30),
  maxAdvanceDays: int(7, 365),
  blockedDates: z.nullish(z.array(z.object({ from: date, to: date })).check(z.maxLength(200))),
  pickupEnabled: z.nullish(z.boolean()),
  pickupNote: localized(200),
  deliveryWindows: z.nullish(z.array(z.object({ _key: id, days: z.array(int(0, 6)).check(z.minLength(1), z.maxLength(7)), from: time, to: time })).check(z.maxLength(40))),
  deliveryZones: z.nullish(
    z
      .array(
        z.object({
          _key: id,
          name: requiredLocalized(40),
          fee: shekels(0),
          freeAbove: z.nullish(shekels(1)),
          cities: z.array(z.string().check(z.minLength(2), z.maxLength(40))).check(z.minLength(1), z.maxLength(100)),
        }),
      )
      .check(z.maxLength(10)),
  ),
  launchPromo: z.nullish(
    z.object({
      enabled: z.nullish(z.boolean()),
      label: localized(60),
      type: z.nullish(z.enum(["percent", "amount"])),
      value: z.nullish(z.number()),
      minSubtotal: z.nullish(shekels(1)),
      startsAt: z.nullish(z.iso.datetime({ offset: true })),
      endsAt: z.nullish(z.iso.datetime({ offset: true })),
    }),
  ),
  catalogCancellationDays: int(0, 30),
  kosherAuthority: z.nullish(str(80)),
  kosherCertificate: z.nullish(image),
  kosherValidUntil: z.nullish(date),
  legalName: z.nullish(str(100)),
  businessType: z.nullish(z.enum(["exempt", "licensed", "company"])),
  businessNumber: z.nullish(z.string().check(z.regex(/^\d{9}$/))),
  legalAddress: z.nullish(str(120)),
  legalEmail: z.nullish(z.email()),
});

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
/** A city as it's compared: no extra spaces, one form of every letter, the same dashes */
export const cityKey = (city: string) => city.normalize("NFC").trim().replace(/\s+/g, " ").replace(/[\u05BE\u2010-\u2015]/g, "-");

function promoOf(p: z.infer<typeof SettingsDoc>["launchPromo"], raw: unknown, problem: Problem): LaunchPromo | null {
  if (!p?.enabled) return null;
  const label = texts(at(raw, "label"));
  const valid =
    !!label.he &&
    p.startsAt &&
    p.endsAt &&
    Date.parse(p.endsAt) > Date.parse(p.startsAt) &&
    typeof p.value === "number" &&
    ((p.type === "percent" && Number.isInteger(p.value) && p.value >= 1 && p.value <= 50) || (p.type === "amount" && p.value >= 1 && p.value <= 1000));
  if (!valid) {
    problem("the launch promo", "it's switched on but incomplete (name, kind, amount, start and end)");
    return null;
  }
  return {
    label,
    type: p.type!,
    value: p.type === "amount" ? toAgorot(p.value!) : p.value!,
    ...(p.minSubtotal != null ? { minSubtotalAgorot: toAgorot(p.minSubtotal) } : {}),
    startsAt: p.startsAt!,
    endsAt: p.endsAt!,
  };
}

/**
 * The shop's settings, checked; null when they're missing or broken. Then the shop doesn't take
 * orders (the checkout says so) rather than guessing a capacity or a delivery fee.
 */
export function normalizeSettings(raw: unknown, problem: Problem = warn): StoreSettings | null {
  if (!raw) {
    problem("the shop", "its settings (הגדרות החנות) aren't published yet");
    return null;
  }
  const doc = check(SettingsDoc, raw, "the shop's settings", problem);
  if (!doc) return null;

  const capacityByWeekday = Array.from({ length: 7 }, () => doc.dailyCapacity);
  for (const { day, capacity } of doc.weekdayCapacity ?? []) capacityByWeekday[day] = capacity;

  // the Studio refuses a city in two zones; if one slips through, the first zone keeps it
  const taken = new Set<string>();
  const deliveryZones = (doc.deliveryZones ?? []).map((zone, i): DeliveryZone => {
    const cities = [...new Set(zone.cities.map(cityKey))].filter((c) => !taken.has(c));
    cities.forEach((c) => taken.add(c));
    return {
      id: zone._key,
      name: texts(at(raw, "deliveryZones", i, "name")),
      feeAgorot: toAgorot(zone.fee),
      ...(zone.freeAbove != null ? { freeAboveAgorot: toAgorot(zone.freeAbove) } : {}),
      cities,
    };
  });

  return {
    capacityByWeekday,
    leadBusinessDays: doc.leadBusinessDays,
    maxAdvanceDays: doc.maxAdvanceDays,
    blockedDates: (doc.blockedDates ?? []).filter((b) => b.to >= b.from).map(({ from, to }) => ({ from, to })),
    pickupEnabled: doc.pickupEnabled !== false,
    pickupNote: texts(at(raw, "pickupNote")),
    deliveryWindows: (doc.deliveryWindows ?? [])
      .filter((w) => minutes(w.to) > minutes(w.from))
      .map((w) => ({ id: w._key, days: [...new Set(w.days)].sort(), from: w.from, to: w.to })),
    deliveryZones,
    launchPromo: promoOf(doc.launchPromo, at(raw, "launchPromo"), problem),
    catalogCancellationDays: doc.catalogCancellationDays,
    kosher: {
      ...(doc.kosherAuthority ? { authority: String(at(raw, "kosherAuthority")) } : {}),
      ...(doc.kosherCertificate ? { certificate: doc.kosherCertificate as CmsImage } : {}),
      ...(doc.kosherValidUntil ? { validUntil: doc.kosherValidUntil } : {}),
    },
    business: {
      ...(doc.legalName ? { legalName: doc.legalName } : {}),
      ...(doc.businessType ? { businessType: doc.businessType } : {}),
      ...(doc.businessNumber ? { businessNumber: doc.businessNumber } : {}),
      ...(doc.legalAddress ? { legalAddress: doc.legalAddress } : {}),
      ...(doc.legalEmail ? { legalEmail: doc.legalEmail } : {}),
    },
  };
}

/* ───────── the builder's add-ons ───────── */

const AddonDoc = z.object({
  _id: id,
  title: requiredLocalized(40),
  description: localized(160),
  available: z.nullish(z.boolean()),
  categories: z.array(z.enum(BUILDER_CATEGORIES)).check(z.minLength(1)),
  options: z.nullish(z.array(z.object({ _key: id, label: requiredLocalized(40) })).check(z.maxLength(12))),
  colorable: z.nullish(z.boolean()),
  textMax: z.nullish(int(0, 200)),
  quantity: z.nullish(z.object({ min: z.nullish(int(1, 100)), max: z.nullish(int(1, 100)) })),
  imageByWhatsapp: z.nullish(z.boolean()),
});

const isAddonKey = (value: string): value is AddonKey => (ADDON_KEYS as readonly string[]).includes(value);

/** The builder's add-ons that are switched on, in the builder's own order */
export function normalizeAddons(raws: unknown[] | null | undefined, problem: Problem = warn): BuilderAddon[] {
  const byKey = new Map<AddonKey, BuilderAddon>();
  for (const raw of raws ?? []) {
    const doc = check(AddonDoc, raw, `add-on ${String(at(raw, "_id"))}`, problem);
    if (!doc || doc.available === false) continue;
    const key = doc._id.replace(/^addon-/, "");
    if (!isAddonKey(key)) continue;
    const q = doc.quantity;
    byKey.set(key, {
      key,
      title: texts(at(raw, "title")),
      description: texts(at(raw, "description")),
      categories: [...new Set(doc.categories)],
      options: (doc.options ?? []).map((o, i) => ({ id: o._key, label: texts(at(raw, "options", i, "label")) })),
      colorable: !!doc.colorable,
      textMax: doc.textMax ?? 0,
      ...(q?.min != null && q.max != null && q.max >= q.min ? { quantity: [q.min, q.max] as [number, number] } : {}),
      imageByWhatsapp: !!doc.imageByWhatsapp,
    });
  }
  return ADDON_KEYS.flatMap((key) => byKey.get(key) ?? []);
}

/* ───────── the legal pages ───────── */

const block = z.looseObject({ _type: z.string().check(z.maxLength(40)), _key: z.optional(z.string()) });
const blocks = z.nullish(z.array(block).check(z.maxLength(1000)));

const LegalDoc = z.object({
  _id: id,
  title: requiredLocalized(60),
  updatedAt: date,
  body: z.object({ he: blocks, en: blocks, ru: blocks }).check(z.refine((b) => !!b.he?.length, "no Hebrew text")),
});

/** A legal page, or null (logged) while it isn't written and published yet */
export function normalizeLegal(key: LegalKey, raw: unknown, problem: Problem = warn): LegalPage | null {
  if (!raw) {
    problem(`legal page ${key}`, "it isn't published yet");
    return null;
  }
  const doc = check(LegalDoc, raw, `legal page ${key}`, problem);
  if (!doc) return null;
  const body: Localized<unknown[]> = {};
  for (const l of LOCALES) {
    const own = at(raw, "body", l);
    if (Array.isArray(own) && own.length) body[l] = own;
  }
  return { key, title: texts(at(raw, "title")), updatedAt: doc.updatedAt, body };
}
