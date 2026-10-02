// The builder's catalog and where a cake starts.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILT_IN_CATALOG, categoryOf, EMPTY, fillingsOf, indexed, startOf, TASTE_GROUPS } from "./model";

const cat = indexed(BUILT_IN_CATALOG);
const designer = categoryOf(cat, "designer")!;

describe("startOf", () => {
  it("starts from the type's first size, base and cream, with no filling", () => {
    assert.deepEqual(startOf(cat, designer, EMPTY), { size: "d16", base: "vanilla", cream: "vanilla", filling: null });
  });

  it("keeps what was chosen when the new type offers it", () => {
    const d = { ...EMPTY, size: "d20", base: "lemon", cream: "lotus", filling: "coffee-soak" };
    assert.deepEqual(startOf(cat, designer, d), { size: "d20", base: "lemon", cream: "lotus", filling: "coffee-soak" });
    const kindergarten = categoryOf(cat, "kindergarten")!;
    assert.deepEqual(startOf(cat, kindergarten, d), { size: "tray-s", base: "lemon", cream: "lotus", filling: null });
  });

  it("skips a default that clashes with the removal requests", () => {
    const number = categoryOf(cat, "number")!;
    const noDairy = startOf(cat, number, { ...EMPTY, exclusions: ["no-dairy"] });
    assert.ok(noDairy.cream && cat.cream[noDairy.cream].parve, `${noDairy.cream} can be made parve`);
  });
});

describe("the built-in catalog", () => {
  it("has unique ids, and every cream and filling a type lists exists", () => {
    for (const list of [cat.categories.flatMap((c) => c.bases.map((b) => `${c.id}:${b.id}`)), BUILT_IN_CATALOG.creams.map((c) => c.id), (BUILT_IN_CATALOG.fillings ?? []).map((f) => f.id)])
      assert.equal(new Set(list).size, list.length);
    for (const c of cat.categories) {
      for (const id of c.creams) assert.ok(cat.cream[id], `${c.id}: cream ${id}`);
      assert.equal(fillingsOf(cat, c).length, c.fillings?.length ?? 0, `${c.id}: fillings`);
    }
  });

  it("marks nuts wherever they are, so the no-nuts request can block them", () => {
    const nutty = [...cat.categories.flatMap((c) => c.bases), ...BUILT_IN_CATALOG.creams, ...(BUILT_IN_CATALOG.fillings ?? [])].filter((x) => x.group === "nutty");
    assert.ok(nutty.length > 5);
    for (const x of nutty) assert.ok(x.contains?.includes("nuts"), `${x.id} is in the nuts group`);
  });

  it("puts every taste in a group the builder has a tab for", () => {
    for (const x of [...cat.categories.flatMap((c) => c.bases), ...BUILT_IN_CATALOG.creams, ...(BUILT_IN_CATALOG.fillings ?? [])])
      assert.ok(x.group && (TASTE_GROUPS as readonly string[]).includes(x.group), x.id);
  });
});
