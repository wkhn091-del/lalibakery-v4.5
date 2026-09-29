// How the owner's texts from the CMS are laid over the built-in ones (merge.ts).   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vercelStegaCombine } from "@vercel/stega";
import { clean, splitStega } from "@/lib/stega";
import { mergeContent, type Rules } from "./merge";

const DEFAULTS = {
  title: "כותרת",
  trust: "שורת אמון",
  lines: ["שורה ראשונה", "שורה שנייה"],
  steps: [{ title: "שלב", note: "הערה" }],
  count: null as number | null,
  inscription: "מזל טוב",
  contact: { phone: "050-873-9090", label: "טלפון" },
};
const RULES: Rules = {
  optional: ["trust", "steps[].note"],
  length: { lines: [1, 3], steps: [1, 4] },
  valid: {
    "contact.phone": (v) => typeof v === "string" && v.replace(/\D/g, "").length >= 9,
    inscription: (v) => typeof v === "string" && /^[א-ת ]{1,12}$/.test(v),
  },
  clean: ["inscription"],
};
/** a text as the Studio's preview sends it: with the invisible link to its field */
const marked = (text: string, path: string) => vercelStegaCombine(text, { origin: "sanity.io", href: `/intent/edit/id=homePage;path=${path}` });

describe("mergeContent", () => {
  it("shows the built-in texts when there's no document", () => {
    assert.deepEqual(mergeContent(DEFAULTS, null, RULES), DEFAULTS);
    assert.deepEqual(mergeContent(DEFAULTS, "nonsense", RULES), DEFAULTS);
  });

  it("takes the owner's texts field by field, and the built-in ones for the rest", () => {
    const r = mergeContent(DEFAULTS, { title: "כותרת חדשה", contact: { label: "התקשרו" }, extra: "ignored" }, RULES);
    assert.equal(r.title, "כותרת חדשה");
    assert.equal(r.contact.label, "התקשרו");
    assert.equal(r.contact.phone, DEFAULTS.contact.phone);
    assert.equal("extra" in r, false);
  });

  it("an emptied required text: the built-in one on the live site, nothing in the preview", () => {
    assert.equal(mergeContent(DEFAULTS, { title: "   " }, RULES).title, DEFAULTS.title);
    assert.equal(mergeContent(DEFAULTS, {}, RULES).title, DEFAULTS.title);
    assert.equal(mergeContent(DEFAULTS, { title: "   " }, RULES, { strict: true }).title, "");
  });

  it("an optional text left empty is hidden, on the live site and in the preview", () => {
    assert.equal(mergeContent(DEFAULTS, { trust: "" }, RULES).trust, "");
    assert.equal(mergeContent(DEFAULTS, { title: "x" }, RULES).trust, "");
    assert.equal(mergeContent(DEFAULTS, { trust: "" }, RULES, { strict: true }).trust, "");
  });

  it("ignores values of the wrong kind", () => {
    const r = mergeContent(DEFAULTS, { title: 5, lines: "a line", contact: "a phone", count: "12" }, RULES);
    assert.deepEqual(r, { ...DEFAULTS, trust: "" });
  });

  it("takes all of the owner's list items, or the built-in list when the page can't take that many", () => {
    assert.deepEqual(mergeContent(DEFAULTS, { lines: ["אחת"] }, RULES).lines, ["אחת"]);
    const problems: string[] = [];
    assert.deepEqual(mergeContent(DEFAULTS, { lines: ["1", "2", "3", "4"] }, RULES, { problems }).lines, DEFAULTS.lines);
    assert.deepEqual(mergeContent(DEFAULTS, { lines: [] }, RULES, { problems }).lines, DEFAULTS.lines);
    assert.equal(problems.length, 2);
    // empty items don't count
    assert.deepEqual(mergeContent(DEFAULTS, { lines: ["", "אחת", 7] }, RULES).lines, ["אחת"]);
  });

  it("inside a list nothing falls back, and each item keeps its key", () => {
    const r = mergeContent(DEFAULTS, { steps: [{ _key: "a1", _type: "step", title: "שלב חדש" }] }, RULES);
    assert.deepEqual(r.steps, [{ title: "שלב חדש", note: "", _key: "a1" }]);
  });

  it("leaves out a list item that can't do without a field it's missing", () => {
    const rules: Rules = { valid: { "nav[].href": (v) => v === "#faq" || v === "/" }, drop: ["nav[].href"] };
    const defaults = { nav: [{ label: "שאלות", href: "#faq" }] };
    const problems: string[] = [];
    const r = mergeContent(defaults, { nav: [{ label: "בית", href: "/" }, { label: "רע", href: "https://example.com" }, { label: "ריק" }] }, rules, { problems });
    assert.deepEqual(r.nav, [{ label: "בית", href: "/" }]);
    assert.equal(problems.length, 3); // the refused link, and the two items left out
  });

  it("refuses a value the site can't use, and says so", () => {
    const problems: string[] = [];
    const r = mergeContent(DEFAULTS, { contact: { phone: "12" }, inscription: "Happy" }, RULES, { problems });
    assert.equal(r.contact.phone, DEFAULTS.contact.phone);
    assert.equal(r.inscription, DEFAULTS.inscription);
    assert.equal(problems.length, 2);
  });

  it("keeps the preview's invisible links, except where the site needs the bare text", () => {
    const title = marked("כותרת בטיוטה", "title");
    const r = mergeContent(DEFAULTS, { title, inscription: marked("שלום", "inscription"), contact: { phone: marked("050-111-2222", "contact.phone") } }, RULES, {
      strict: true,
    });
    assert.equal(r.title, title);
    assert.notEqual(clean(r.title), r.title);
    assert.equal(r.inscription, "שלום");
    // checked without the invisible characters, passed on with them
    assert.equal(clean(r.contact.phone), "050-111-2222");
    assert.notEqual(r.contact.phone, "050-111-2222");
    assert.equal(splitStega(r.title).cleaned, "כותרת בטיוטה");
  });

  it("takes numbers, and nothing else, where the site expects a number", () => {
    assert.equal(mergeContent(DEFAULTS, { count: 120 }, RULES).count, 120);
    assert.equal(mergeContent(DEFAULTS, { count: Number.NaN }, RULES).count, null);
  });
});
