// The wizard saved in the browser: what comes back, and what doesn't.   npm test
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { BUILT_IN_CATALOG, type Draft, EMPTY, indexed } from "./model";
import { clearWizard, fitToCatalog, loadWizard, localToday, saveWizard } from "./storage";

// a localStorage for Node, and a switch that makes it throw like a blocked one
const store = new Map<string, string>();
let blocked = false;
const guard = () => {
  if (blocked) throw new DOMException("The operation is insecure.", "SecurityError");
};
globalThis.localStorage = {
  getItem: (k: string) => (guard(), store.get(k) ?? null),
  setItem: (k: string, v: string) => (guard(), void store.set(k, String(v))),
  removeItem: (k: string) => (guard(), void store.delete(k)),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const KEY = "lali:wizard:v1";
const cat = indexed(BUILT_IN_CATALOG);
const TODAY = "2026-10-01";
const NOW = Date.parse("2026-10-01T09:00:00Z");
const HOUR = 60 * 60 * 1000;
const draft: Draft = { ...EMPTY, category: "designer", size: "d20", base: "vanilla", cream: "vanilla", colors: ["blush"], message: "מזל טוב", date: "2026-10-12" };
const put = (value: unknown) => store.set(KEY, JSON.stringify(value));

beforeEach(() => {
  store.clear();
  blocked = false;
});

describe("saveWizard and loadWizard", () => {
  it("brings the wizard back where it was left", () => {
    saveWizard({ step: 3, reached: 3, draft }, NOW);
    assert.deepEqual(loadWizard(cat, TODAY, NOW + 2 * HOUR), { step: 3, reached: 3, draft });
  });

  it("keeps nothing before a cake type is chosen", () => {
    saveWizard({ step: 2, reached: 2, draft }, NOW);
    saveWizard({ step: 0, reached: 2, draft: EMPTY }, NOW);
    assert.equal(store.has(KEY), false);
    assert.equal(loadWizard(cat, TODAY, NOW), null);
  });

  it("forgets a wizard after a week", () => {
    saveWizard({ step: 1, reached: 1, draft }, NOW);
    assert.notEqual(loadWizard(cat, TODAY, NOW + 6 * 24 * HOUR), null);
    assert.equal(loadWizard(cat, TODAY, NOW + 8 * 24 * HOUR), null);
  });

  it("refuses what it didn't write", () => {
    const ok = { v: 1, savedAt: NOW, step: 1, reached: 1, draft };
    for (const bad of [
      "{not json",
      null,
      42,
      { ...ok, v: 2 },
      { ...ok, savedAt: "yesterday" },
      { ...ok, savedAt: NOW + 24 * HOUR }, // from the future
      { ...ok, step: 9 },
      { ...ok, step: 1.5 },
      { ...ok, draft: "designer" },
      { ...ok, draft: { ...draft, category: "wedding" } },
    ]) {
      if (typeof bad === "string") store.set(KEY, bad);
      else put(bad);
      assert.equal(loadWizard(cat, TODAY, NOW), null, JSON.stringify(bad));
    }
  });

  it("starts over only the field that's broken, and keeps the rest of the cake", () => {
    const back = (over: Partial<Record<keyof Draft, unknown>>) => {
      put({ v: 1, savedAt: NOW, step: 3, reached: 3, draft: { ...draft, ...over } });
      return loadWizard(cat, TODAY, NOW)?.draft;
    };
    assert.deepEqual(back({ date: "20266-10-12" }), { ...draft, date: "" }, "a year typed with five digits");
    assert.deepEqual(back({ colors: "gold" }), { ...draft, colors: [] });
    assert.deepEqual(back({ message: "א".repeat(500) }), { ...draft, message: "" });
    assert.deepEqual(back({ message: "\uFB2A".repeat(40) }), { ...draft, message: "" }, "40 characters that NFC makes 80");
    const { notes: _, ...withoutNotes } = draft;
    put({ v: 1, savedAt: NOW, step: 3, reached: 3, draft: withoutNotes });
    assert.deepEqual(loadWizard(cat, TODAY, NOW)?.draft, draft, "a field missing from an older save");
  });

  it("never opens a step beyond the furthest one reached", () => {
    put({ v: 1, savedAt: NOW, step: 3, reached: 1, draft });
    assert.equal(loadWizard(cat, TODAY, NOW)?.reached, 3);
  });

  it("cleans text the way the server does", () => {
    put({ v: 1, savedAt: NOW, step: 2, reached: 2, draft: { ...draft, message: " ‮מזל טוב​ " } });
    assert.equal(loadWizard(cat, TODAY, NOW)?.draft.message, "מזל טוב");
  });

  it("survives storage that throws", () => {
    saveWizard({ step: 1, reached: 1, draft }, NOW);
    blocked = true;
    assert.equal(loadWizard(cat, TODAY, NOW), null);
    assert.doesNotThrow(() => saveWizard({ step: 2, reached: 2, draft }, NOW));
    assert.doesNotThrow(() => clearWizard());
  });

  it("is removed by clearWizard", () => {
    saveWizard({ step: 1, reached: 1, draft }, NOW);
    clearWizard();
    assert.equal(loadWizard(cat, TODAY, NOW), null);
  });
});

describe("fitToCatalog", () => {
  it("drops a size and cream the owner has since removed", () => {
    const changed = indexed({
      ...BUILT_IN_CATALOG,
      categories: BUILT_IN_CATALOG.categories.map((c) =>
        c.id === "designer" ? { ...c, sizes: c.sizes.filter((s) => s.id !== "d20"), creams: c.creams.filter((x) => x !== "vanilla") } : c,
      ),
    });
    const fitted = fitToCatalog(changed, draft, TODAY);
    assert.equal(fitted.size, null);
    assert.equal(fitted.cream, null);
    assert.equal(fitted.base, "vanilla");
    assert.equal(fitted.message, "מזל טוב");
  });

  it("clears a date that has passed, and a figure the category doesn't take", () => {
    const fitted = fitToCatalog(cat, { ...draft, figure: "30", date: "2026-09-30" }, TODAY);
    assert.equal(fitted.date, "");
    assert.equal(fitted.figure, "");
    assert.equal(fitToCatalog(cat, draft, TODAY).date, "2026-10-12");
  });

  it("drops colours that left the palette", () => {
    assert.deepEqual(fitToCatalog(cat, { ...draft, colors: ["blush", "neon"] }, TODAY).colors, ["blush"]);
  });

  it("starts over when the cake type itself is gone", () => {
    const gone = indexed({ ...BUILT_IN_CATALOG, categories: BUILT_IN_CATALOG.categories.filter((c) => c.id !== "designer") });
    assert.deepEqual(fitToCatalog(gone, draft, TODAY), EMPTY);
  });
});

describe("localToday", () => {
  it("is the browser's own date, YYYY-MM-DD", () => {
    assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  });
});
