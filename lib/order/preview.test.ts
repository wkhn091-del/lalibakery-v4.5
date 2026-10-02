// What the builder's 3D preview draws for a draft.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILT_IN_CATALOG, type Draft, EMPTY, indexed } from "./model";
import { drawable, extentOf, previewOf, visualOrder } from "./preview";

const cat = indexed(BUILT_IN_CATALOG);
const designer: Draft = { ...EMPTY, category: "designer", size: "d20", base: "chocolate", cream: "vanilla" };

describe("previewOf", () => {
  it("draws nothing before a cake type is chosen", () => {
    assert.equal(previewOf(cat, EMPTY), null);
  });

  it("starts from the type's first size, then follows the size chosen", () => {
    assert.deepEqual(previewOf(cat, { ...designer, size: null })?.shape, { kind: "round", radius: 0.8, height: 1.05 });
    assert.deepEqual(previewOf(cat, designer)?.shape, { kind: "round", radius: 1, height: 1.05 });
    assert.equal(previewOf(cat, { ...designer, size: "tiers" })?.shape.kind, "tiers");
    assert.deepEqual(previewOf(cat, { ...EMPTY, category: "kindergarten", size: "tray-s" })?.shape, { kind: "tray", width: 3, depth: 2, height: 0.55 });
    assert.equal(previewOf(cat, { ...EMPTY, category: "kindergarten", size: "cupcakes" })?.shape.kind, "cupcakes");
  });

  it("frosts the cake in the first colour chosen, otherwise in the cream's colour", () => {
    assert.equal(previewOf(cat, designer)?.coat, "#F5E9CF");
    const coloured = previewOf(cat, { ...designer, colors: ["surprise", "sky", "black"] });
    assert.equal(coloured?.coat, "#BCD3E5");
    assert.equal(coloured?.accent, "#2B2421");
    assert.equal(previewOf(cat, designer)?.sponge, "#5C3B2C");
  });

  it("draws the number typed, and a placeholder until it's valid", () => {
    const number: Draft = { ...EMPTY, category: "number", size: "large", figure: " 3 0 " };
    assert.deepEqual(previewOf(cat, number)?.shape, { kind: "figure", text: "30", size: 3, layer: 0.22 });
    assert.deepEqual(previewOf(cat, { ...number, figure: "1234" })?.shape, { kind: "figure", text: "1", size: 3, layer: 0.22 });
  });

  it("turns each add-on picked into its piece, with its option, colour and quantity", () => {
    const spec = previewOf(cat, {
      ...designer,
      message: "מזל טוב 40",
      addons: [
        { key: "macarons", option: null, color: "lilac", text: "", qty: 9 },
        { key: "fruit", option: "o2", color: null, text: "", qty: null },
        { key: "flowers", option: "o2", color: "blush", text: "", qty: null },
        { key: "candles", option: "o2", color: null, text: "", qty: null },
        { key: "topper", option: null, color: null, text: "נועה", qty: null },
      ],
    });
    assert.deepEqual(spec?.addons, [
      { key: "flowers", color: "#E4B4B2", fresh: false },
      { key: "macarons", color: "#C9B9DA", count: 9 },
      { key: "fruit", kind: "berries" },
      { key: "topper", text: "נועה" },
      { key: "candles", kind: "number", number: "40" },
    ]);
  });

  it("leaves out add-ons this cake type doesn't offer", () => {
    const spec = previewOf(cat, { ...EMPTY, category: "kindergarten", size: "tray-s", addons: [{ key: "goldLeaf", option: null, color: null, text: "", qty: null }] });
    assert.deepEqual(spec?.addons, []);
  });

  it("falls back to plain candles for a number candle with no number to show", () => {
    const spec = previewOf(cat, { ...designer, addons: [{ key: "candles", option: "o2", color: null, text: "", qty: null }] });
    assert.deepEqual(spec?.addons, [{ key: "candles", kind: "candles", number: "" }]);
  });
});

describe("extentOf", () => {
  it("frames the two tiers by the wider one and their height together", () => {
    assert.deepEqual(extentOf({ kind: "tiers", tiers: [{ radius: 1.2, height: 0.9 }, { radius: 0.8, height: 0.8 }] }), { radius: 1.2, height: 1.7000000000000002 });
  });
});

describe("visualOrder", () => {
  it("reverses Hebrew, keeping numbers and Latin words in their own order", () => {
    assert.equal(visualOrder("מזל טוב 30").join(""), "30 בוט לזמ");
    assert.equal(visualOrder("Happy 5").join(""), "Happy 5");
    assert.equal(visualOrder("יום הולדת Noa").join(""), "Noa תדלוה םוי");
    assert.equal(visualOrder("לנועה 3.5").join(""), "3.5 העונל");
  });
});

describe("drawable", () => {
  it("keeps only what the font has, with single spaces", () => {
    const has = (ch: string) => /[א-ת0-9]/.test(ch);
    assert.equal(drawable(" מזל  טוב 🎉 3 ", has), "מזל טוב 3");
  });
});
