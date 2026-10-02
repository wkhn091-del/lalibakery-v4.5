// The server's order check against tampered and broken payloads.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILT_IN_CATALOG, type Draft, EMPTY, indexed, type WizardCatalog } from "./model";
import { DraftSchema } from "./schema";
import { israelToday, validateOrder } from "./validate";

// the built-in catalog has no prices (they come from the CMS): give two sizes one
const priced: WizardCatalog = {
  ...BUILT_IN_CATALOG,
  categories: BUILT_IN_CATALOG.categories.map((c) => ({
    ...c,
    sizes: c.sizes.map((s) => (s.id === "d20" ? { ...s, price: 420 } : s.id === "regular" ? { ...s, price: 250 } : s)),
  })),
};
const cat = indexed(priced);
const TODAY = "2026-10-01";
const good: Draft = { ...EMPTY, category: "designer", size: "d20", base: "vanilla", cream: "vanilla", colors: ["blush"], message: "מזל טוב נועם", date: "2026-10-12" };

describe("validateOrder", () => {
  it("accepts a real order and rebuilds it from the catalog", () => {
    const r = validateOrder(good, cat, TODAY);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.order.price, 420);
    assert.equal(r.order.size.label, "קוטר 20 ס״מ");
    assert.deepEqual(r.order.size.servings, [14, 18]);
    assert.match(r.order.summary, /^שלום!/);
  });

  it("ignores a price, labels and a summary sent by the browser", () => {
    const r = validateOrder({ ...good, price: 1, summary: "חינם", size: "d20", cream: "vanilla", category: "designer", label: "x" }, cat, TODAY);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.order.price, 420);
      assert.doesNotMatch(r.order.summary, /חינם/);
      assert.equal("label" in r.draft, false);
    }
  });

  it("refuses an unknown cream, and one the category doesn't offer", () => {
    const unknown = validateOrder({ ...good, cream: "gold-leaf-deluxe" }, cat, TODAY);
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.ok(unknown.fields.cream);
    const notOffered = validateOrder({ ...good, category: "number", figure: "5", size: "regular", base: "sable-vanilla", cream: "whipped" }, cat, TODAY);
    assert.equal(notOffered.ok, false);
    if (!notOffered.ok) assert.ok(notOffered.fields.cream);
  });

  it("takes an optional filling, only one the cake offers", () => {
    const none = validateOrder(good, cat, TODAY);
    assert.ok(none.ok && !none.order.filling);
    const jam = validateOrder({ ...good, filling: "strawberry-jam" }, cat, TODAY);
    assert.ok(jam.ok);
    if (jam.ok) {
      assert.equal(jam.order.filling?.label, "ריבת תות");
      assert.match(jam.order.summary, /מילוי: ריבת תות/);
    }
    const notOffered = validateOrder({ ...good, category: "kindergarten", size: "tray-s", filling: "coffee-soak" }, cat, TODAY);
    assert.ok(!notOffered.ok && notOffered.fields.filling);
    const unknown = validateOrder({ ...good, filling: "x".repeat(81) }, cat, TODAY);
    assert.ok(!unknown.ok && unknown.fields.filling);
  });

  it("blocks a base or a filling with nuts when nuts were excluded", () => {
    const base = validateOrder({ ...good, base: "pistachio", exclusions: ["no-nuts"] }, cat, TODAY);
    assert.ok(!base.ok && base.fields.base && !base.fields.cream);
    const filling = validateOrder({ ...good, filling: "dubai", exclusions: ["no-nuts"] }, cat, TODAY);
    assert.ok(!filling.ok && filling.fields.filling && !filling.fields.cream);
  });

  it("refuses a 5 KB inscription before doing any work on it", () => {
    const r = validateOrder({ ...good, message: "א".repeat(5000) }, cat, TODAY);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.fields.message);
  });

  it("strips bidi overrides and zero-width characters from text", () => {
    const r = validateOrder({ ...good, message: "‮מזל​ טוב⁦", notes: " שורה\nשנייה\u0007 " }, cat, TODAY);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.draft.message, "מזל טוב");
      assert.equal(r.draft.notes, "שורה\nשנייה");
    }
  });

  it("prices a number cake per digit, and checks the digits", () => {
    const base = { ...EMPTY, category: "number" as const, size: "regular", base: "sable-vanilla", cream: "cream-cheese" };
    const two = validateOrder({ ...base, figure: "30" }, cat, TODAY);
    assert.equal(two.ok, true);
    if (two.ok) assert.equal(two.order.price, 500);
    assert.equal(validateOrder({ ...base, figure: "" }, cat, TODAY).ok, false);
    assert.equal(validateOrder({ ...base, figure: "3!" }, cat, TODAY).ok, false);
  });

  it("refuses a date that has passed, and allows no date", () => {
    const past = validateOrder({ ...good, date: "2026-09-30" }, cat, TODAY);
    assert.equal(past.ok, false);
    if (!past.ok) assert.ok(past.fields.date);
    assert.equal(validateOrder({ ...good, date: "" }, cat, TODAY).ok, true);
    assert.equal(validateOrder({ ...good, date: "12/10/2026" }, cat, TODAY).ok, false);
  });

  it("checks the colours", () => {
    assert.equal(validateOrder({ ...good, colors: ["neon-green"] }, cat, TODAY).ok, false);
    assert.equal(validateOrder({ ...good, colors: ["surprise", "gold"] }, cat, TODAY).ok, false);
    assert.equal(validateOrder({ ...good, colors: ["surprise"] }, cat, TODAY).ok, true);
    assert.equal(validateOrder({ ...good, colors: ["gold", "sky", "sage", "black"] }, cat, TODAY).ok, false);
  });

  it("blocks the allergy conflicts the wizard blocks", () => {
    const r = validateOrder({ ...good, category: "designer", cream: "pistachio", exclusions: ["no-nuts"] }, cat, TODAY);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.fields.cream);
    // a parve-able cream stays allowed without dairy
    assert.equal(validateOrder({ ...good, cream: "vanilla", exclusions: ["no-dairy", "no-dairy"] }, cat, TODAY).ok, true);
  });

  it("refuses anything that isn't an order", () => {
    for (const bad of [null, "order", 42, [], { ...good, category: "wedding" }, { ...good, size: null }, { ...good, allergy: "yes" }])
      assert.equal(validateOrder(bad, cat, TODAY).ok, false);
  });

  it("takes add-ons that fit, and writes them into the summary", () => {
    const flowers = { key: "flowers", option: "o2", color: "blush", text: "", qty: null };
    const macarons = { key: "macarons", option: null, color: null, text: "", qty: 6 };
    const r = validateOrder({ ...good, addons: [flowers, macarons] }, cat, TODAY);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.order.addons, [
      { key: "flowers", title: "פרחים", option: "פרחי סוכר", color: "ורוד עתיק" },
      { key: "macarons", title: "מקרונים", qty: 6 },
    ]);
    assert.match(r.order.summary, /תוספות: פרחים: פרחי סוכר, בצבע ורוד עתיק; מקרונים: 6 יחידות/);
  });

  it("refuses add-ons that don't fit the add-on or the cake", () => {
    const pick = { option: null, color: null, text: "", qty: null };
    const bad = [
      { ...pick, key: "jetpack" },
      { ...pick, key: "flowers" }, // an option is required
      { ...pick, key: "flowers", option: "o9" },
      { ...pick, key: "goldLeaf", color: "gold" }, // not colourable
      { ...pick, key: "piping", color: "neon" },
      { ...pick, key: "macarons", qty: 50 },
      { ...pick, key: "macarons" }, // a count is required
      { ...pick, key: "goldLeaf", qty: 2 },
      { ...pick, key: "topper", text: "א".repeat(31) },
      { ...pick, key: "goldLeaf", text: "x" },
      { ...pick, key: "inscription", text: "x" }, // the message field, not an add-on
    ];
    for (const a of bad) assert.equal(validateOrder({ ...good, addons: [a] }, cat, TODAY).ok, false, JSON.stringify(a));
    // macarons aren't offered on a kindergarten cake
    const kinder = { ...good, category: "kindergarten", size: "tray-s", base: "vanilla", cream: "vanilla" };
    assert.equal(validateOrder({ ...kinder, addons: [{ ...pick, key: "macarons", qty: 6 }] }, cat, TODAY).ok, false);
    // the same add-on twice
    const gold = { ...pick, key: "goldLeaf" };
    assert.equal(validateOrder({ ...good, addons: [gold, gold] }, cat, TODAY).ok, false);
  });

  it("notes that an edible print's picture comes over WhatsApp", () => {
    const r = validateOrder({ ...good, category: "birthday", size: "d22", addons: [{ key: "ediblePrint", option: null, color: null, text: "", qty: null }] }, cat, TODAY);
    assert.equal(r.ok, true);
    if (r.ok) assert.match(r.order.summary, /הדפס תמונה אכילה: התמונה תישלח בוואטסאפ/);
  });

  it("knows today's date in Israel", () => {
    // 23:30 UTC on 30 Sep is already 1 Oct in Israel (UTC+3)
    assert.equal(israelToday(new Date("2026-09-30T23:30:00Z")), "2026-10-01");
  });
});

describe("DraftSchema", () => {
  it("accepts the wizard's empty draft and a half-finished one", () => {
    assert.equal(DraftSchema.safeParse(EMPTY).success, true);
    assert.equal(DraftSchema.safeParse({ ...EMPTY, category: "birthday", size: "d22" }).success, true);
  });
  it("refuses a draft that isn't one", () => {
    assert.equal(DraftSchema.safeParse({ ...EMPTY, colors: "gold" }).success, false);
    assert.equal(DraftSchema.safeParse({ step: 3 }).success, false);
  });
});
