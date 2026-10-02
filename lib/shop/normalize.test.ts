// The shop's content from the CMS: what's shown, what isn't, and that money comes out in agorot.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vercelStegaCombine } from "@vercel/stega";
import { ADDONS } from "../../studio/addons";
import { CATEGORIES } from "../../studio/categories";
import { LEGAL_PAGES, legalId as studioLegalId } from "../../studio/legal";
import { LOCALES as STUDIO_LOCALES } from "../../studio/locales";
import { STORE_SETTINGS_ID as STUDIO_SETTINGS_ID } from "../../studio/store";
import { LOCALES } from "../i18n/config";
import { ADDON_KEYS, BUILDER_CATEGORIES, LEGAL_KEYS, normalizeAddons, normalizeCatalog, normalizeLegal, normalizeSettings } from "./normalize";

/** collects the problems instead of logging them */
function problems() {
  const list: string[] = [];
  return { list, problem: (what: string, reason: string) => void list.push(`${what}: ${reason}`) };
}

const img = (n: number) => ({ asset: { _id: `image-${n}-800x800-jpg` }, alt: `עוגה ${n}` });
const category = { _id: "cat-cakes", title: { he: "עוגות" }, slug: "עוגות" };
const occasion = { _id: "occ-birthday", title: { he: "יום הולדת" }, slug: "יום-הולדת" };

function product(over: Record<string, unknown> = {}) {
  return {
    _id: "p-rachel",
    kind: "single",
    title: { he: "עוגת רחל", en: "Rachel cake" },
    slug: "עוגת-רחל",
    categoryId: "cat-cakes",
    images: [img(1)],
    variants: [
      { _key: "v20", label: { he: "קוטר 20" }, servingsMin: 14, servingsMax: 18, price: 249.9, available: true },
      { _key: "v24", label: { he: "קוטר 24" }, price: 320, available: false },
    ],
    occasionIds: ["occ-birthday", null, "occ-unpublished"],
    styleIds: null,
    kosher: "dairy",
    diet: { glutenFreeRecipe: false, noAddedSugar: true, nutFree: false },
    allergens: ["gluten", "eggs", "dairy", "dairy"],
    featured: true,
    ...over,
  };
}

const catalogOf = (products: unknown[]) => ({ products, categories: [category], occasions: [occasion], styles: [] });

describe("normalizeCatalog", () => {
  it("shows a complete product, with prices in agorot", () => {
    const { list, problem } = problems();
    const { products } = normalizeCatalog(catalogOf([product()]), problem);
    assert.deepEqual(list, []);
    assert.equal(products.length, 1);
    const p = products[0];
    assert.equal(p.variants[0].priceAgorot, 24990);
    assert.equal(p.variants[1].priceAgorot, 32000);
    assert.equal(p.variants[1].available, false);
    assert.deepEqual(p.variants[0].servings, [14, 18]);
    assert.equal(p.variants[1].servings, undefined);
    assert.deepEqual(p.occasionIds, ["occ-birthday"]);
    assert.deepEqual(p.allergens, ["gluten", "eggs", "dairy"]);
    assert.deepEqual(p.title, { he: "עוגת רחל", en: "Rachel cake" });
    assert.equal(p.images[0].alt, "עוגה 1");
  });

  it("checks the preview's marked values, and keeps the marks on shown text only", () => {
    const mark = (s: string) => vercelStegaCombine(s, { origin: "sanity.io", href: "/studio" });
    const raw = product({ kind: mark("single"), kosher: mark("parve"), slug: mark("עוגת-רחל"), title: { he: mark("עוגת רחל") } });
    raw.allergens = ["gluten"];
    const { list, problem } = problems();
    const { products } = normalizeCatalog(catalogOf([raw]), problem);
    assert.deepEqual(list, []);
    assert.equal(products[0].kind, "single");
    assert.equal(products[0].kosher, "parve");
    assert.equal(products[0].slug, "עוגת-רחל");
    assert.notEqual(products[0].title.he, "עוגת רחל"); // still carries the link to its field
    assert.ok(products[0].title.he!.startsWith("עוגת רחל"));
  });

  it("doesn't show a product with a broken price, no Hebrew name, a photo without alt, or an unpublished category", () => {
    const { list, problem } = problems();
    const { products } = normalizeCatalog(
      catalogOf([
        product({ _id: "a", slug: "a", variants: [{ _key: "x", label: { he: "x" }, price: 10.005 }] }),
        product({ _id: "b", slug: "b", variants: [{ _key: "x", label: { he: "x" }, price: -5 }] }),
        product({ _id: "c", slug: "c", title: { en: "English only" } }),
        product({ _id: "d", slug: "d", images: [{ asset: { _id: "image-1" }, alt: "" }] }),
        product({ _id: "e", slug: "e", categoryId: null }),
        product({ _id: "f", slug: "f", variants: [] }),
        product({ _id: "g", slug: "g", kosher: "meat" }),
      ]),
      problem,
    );
    assert.equal(products.length, 0);
    assert.equal(list.length, 7);
  });

  it("keeps the first of two products with the same address, and refuses duplicate size keys", () => {
    const { list, problem } = problems();
    const dupKeys = product({ _id: "k", slug: "k", variants: [{ _key: "v", label: { he: "1" }, price: 1 }, { _key: "v", label: { he: "2" }, price: 2 }] });
    const { products } = normalizeCatalog(catalogOf([product(), product({ _id: "p-copy" }), dupKeys]), problem);
    assert.deepEqual(products.map((p) => p.id), ["p-rachel"]);
    assert.equal(list.length, 2);
  });

  it("shows a bundle only when every product and size in it is shown", () => {
    const bundle = (items: unknown[], variants = [{ _key: "b", label: { he: "מארז" }, price: 399 }]) =>
      product({ _id: `bundle-${items.length}-${variants.length}`, slug: `bundle-${items.length}-${variants.length}`, kind: "bundle", variants, bundleItems: items });
    const good = bundle([{ product: "p-rachel", variantKey: "v20", quantity: 1 }]);
    const ghost = bundle([
      { product: "p-rachel", variantKey: "v20", quantity: 1 },
      { product: "p-hidden", variantKey: "v1", quantity: 12 },
    ]);
    const twoPrices = bundle([{ product: "p-rachel", variantKey: "v20", quantity: 1 }], [
      { _key: "a", label: { he: "a" }, price: 1 },
      { _key: "b", label: { he: "b" }, price: 2 },
    ]);
    const twice = bundle([
      { product: "p-rachel", variantKey: "v20", quantity: 1 },
      { product: "p-rachel", variantKey: "v20", quantity: 2 },
      { product: "p-rachel", variantKey: "v24", quantity: 1 },
    ]);
    const { list, problem } = problems();
    const { products } = normalizeCatalog(catalogOf([product(), good, ghost, twoPrices, twice]), problem);
    assert.deepEqual(products.map((p) => p.id), ["p-rachel", good._id]);
    assert.deepEqual(products[1].bundle, [{ productId: "p-rachel", variantId: "v20", quantity: 1 }]);
    assert.equal(list.length, 3);
  });

  it("gives a single product no bundle, even if bundle lines were left in it", () => {
    const { products } = normalizeCatalog(catalogOf([product({ bundleItems: [{ product: "x", variantKey: "y", quantity: 1 }] })]), () => {});
    assert.deepEqual(products[0].bundle, []);
  });
});

const settingsDoc = (over: Record<string, unknown> = {}) => ({
  dailyCapacity: 5,
  weekdayCapacity: [
    { day: 5, capacity: 3 },
    { day: 6, capacity: 0 },
  ],
  leadBusinessDays: 3,
  maxAdvanceDays: 90,
  blockedDates: [
    { from: "2026-10-10", to: "2026-10-12" },
    { from: "2026-11-02", to: "2026-11-01" },
  ],
  pickupEnabled: true,
  pickupNote: { he: "האיסוף מתואם בוואטסאפ" },
  deliveryWindows: [
    { _key: "morning", days: [0, 1, 2, 3, 4], from: "09:00", to: "12:00" },
    { _key: "bad", days: [5], from: "14:00", to: "11:00" },
  ],
  deliveryZones: [
    { _key: "netanya", name: { he: "נתניה" }, fee: 20, freeAbove: 100, cities: ["נתניה", " נתניה "] },
    { _key: "area", name: { he: "סביבת נתניה" }, fee: 50, cities: ["אבן יהודה", "קדימה־צורן", "נתניה"] },
  ],
  launchPromo: { enabled: false },
  catalogCancellationDays: 3,
  ...over,
});

describe("normalizeSettings", () => {
  it("turns the settings into a calendar and delivery fees in agorot", () => {
    const { list, problem } = problems();
    const s = normalizeSettings(settingsDoc(), problem);
    assert.deepEqual(list, []);
    assert.ok(s);
    assert.deepEqual(s.capacityByWeekday, [5, 5, 5, 5, 5, 3, 0]);
    assert.deepEqual(s.blockedDates, [{ from: "2026-10-10", to: "2026-10-12" }]);
    assert.deepEqual(s.deliveryWindows, [{ id: "morning", days: [0, 1, 2, 3, 4], from: "09:00", to: "12:00" }]);
    assert.equal(s.deliveryZones[0].feeAgorot, 2000);
    assert.equal(s.deliveryZones[0].freeAboveAgorot, 10000);
    assert.equal(s.deliveryZones[1].freeAboveAgorot, undefined);
    // one form of every city, and a city in two zones stays in the first
    assert.deepEqual(s.deliveryZones[0].cities, ["נתניה"]);
    assert.deepEqual(s.deliveryZones[1].cities, ["אבן יהודה", "קדימה-צורן"]);
    assert.equal(s.launchPromo, null);
  });

  it("takes no orders without settings, rather than guessing them", () => {
    const { list, problem } = problems();
    assert.equal(normalizeSettings(null, problem), null);
    assert.equal(normalizeSettings(settingsDoc({ dailyCapacity: 0 }), problem), null);
    assert.equal(normalizeSettings(settingsDoc({ deliveryZones: [{ _key: "z", name: { he: "z" }, fee: -1, cities: ["x1"] }] }), problem), null);
    assert.equal(list.length, 3);
  });

  it("uses a launch promo only when it's switched on and complete", () => {
    const promo = { enabled: true, label: { he: "מבצע השקה" }, type: "amount", value: 25.5, minSubtotal: 150, startsAt: "2026-10-01T06:00:00.000Z", endsAt: "2026-10-31T21:00:00.000Z" };
    const on = normalizeSettings(settingsDoc({ launchPromo: promo }), () => {});
    assert.deepEqual(on?.launchPromo, { label: { he: "מבצע השקה" }, type: "amount", value: 2550, minSubtotalAgorot: 15000, startsAt: promo.startsAt, endsAt: promo.endsAt });

    const { list, problem } = problems();
    for (const broken of [
      { ...promo, endsAt: undefined },
      { ...promo, endsAt: "2026-09-01T00:00:00.000Z" },
      { ...promo, type: "percent", value: 80 },
      { ...promo, type: "percent", value: 12.5 },
      { ...promo, label: { en: "Launch" } },
    ]) {
      assert.equal(normalizeSettings(settingsDoc({ launchPromo: broken }), problem)?.launchPromo, null);
    }
    assert.equal(list.length, 5);
  });

  it("never passes on the reason of a blocked date", () => {
    const s = normalizeSettings(settingsDoc({ blockedDates: [{ from: "2026-12-01", to: "2026-12-01", reason: "חופשה" }] }), () => {});
    assert.deepEqual(s?.blockedDates, [{ from: "2026-12-01", to: "2026-12-01" }]);
  });
});

describe("normalizeAddons", () => {
  it("shows the add-ons that are on, in the builder's order", () => {
    const { list, problem } = problems();
    const addons = normalizeAddons(
      [
        { _id: "addon-inscription", title: { he: "כיתוב" }, categories: ["designer"], textMax: 40, colorable: true },
        { _id: "addon-flowers", title: { he: "פרחים" }, categories: ["designer", "birthday"], options: [{ _key: "o1", label: { he: "טריים" } }], quantity: { min: 3, max: 1 } },
        { _id: "addon-goldLeaf", title: { he: "עלי זהב" }, categories: ["designer"], available: false },
        { _id: "addon-unknown", title: { he: "?" }, categories: ["designer"] },
        { _id: "addon-macarons", title: { he: "מקרונים" }, categories: [] },
      ],
      problem,
    );
    assert.deepEqual(addons.map((a) => a.key), ["flowers", "inscription"]);
    assert.equal(addons[0].quantity, undefined);
    assert.deepEqual(addons[0].options, [{ id: "o1", label: { he: "טריים" } }]);
    assert.equal(addons[1].textMax, 40);
    assert.equal(list.length, 1); // the macarons without a cake type
  });
});

describe("normalizeLegal", () => {
  const block = { _type: "block", _key: "a", children: [{ _type: "span", text: "שלום" }] };
  it("shows a written page, and nothing until it's written", () => {
    assert.deepEqual(normalizeLegal("terms", { _id: "legal-terms", title: { he: "תקנון" }, updatedAt: "2026-10-01", body: { he: [block] } }, () => {}), {
      key: "terms",
      title: { he: "תקנון" },
      updatedAt: "2026-10-01",
      body: { he: [block] },
    });
    const { list, problem } = problems();
    assert.equal(normalizeLegal("terms", { _id: "legal-terms", title: { he: "תקנון" }, updatedAt: "2026-10-01", body: { en: [block] } }, problem), null);
    assert.equal(normalizeLegal("privacy", null, problem), null);
    assert.equal(list.length, 2);
  });
});

describe("the site and the Studio agree", () => {
  it("on the fixed lists and ids", () => {
    assert.deepEqual([...ADDON_KEYS], ADDONS.map((a) => a.key));
    assert.deepEqual([...BUILDER_CATEGORIES], CATEGORIES.map((c) => c.key));
    assert.deepEqual([...LEGAL_KEYS], LEGAL_PAGES.map((p) => p.key));
    assert.deepEqual([...LOCALES], STUDIO_LOCALES.map((l) => l.id));
    assert.equal(STUDIO_SETTINGS_ID, "storeSettings");
    assert.equal(studioLegalId("terms"), "legal-terms");
  });
});
