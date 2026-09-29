/*
  The Studio's forms (studio/schemaTypes/site/spec.ts) against the site's texts (content.ts) and
  rules (sanity/rules.ts): every text the site shows has its field, with the same name, and the
  Studio refuses what the site would refuse. And what the seed puts in the CMS comes back out
  exactly as the site's built-in texts.   npm test
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAKE_PAGE, HOME, SETTINGS } from "@/content";
import { CAKE_PAGE_RULES, HOME_RULES, INSCRIPTION, NAV_TARGETS, SETTINGS_RULES } from "@/sanity/rules";
import { CAKE_PAGE_SPEC, dialable, type DocSpec, type Field, HOME_PAGE, NAV_CHOICES, SITE_SETTINGS, stored, INSCRIPTION as STUDIO_INSCRIPTION } from "../../studio/schemaTypes/site/spec";
import { international, ISRAELI } from "./contact";
import { mergeContent, type Rules } from "./merge";

const DOCS: [name: string, spec: DocSpec, texts: unknown, rules: Rules][] = [
  ["הגדרות כלליות", SITE_SETTINGS, SETTINGS, SETTINGS_RULES],
  ["דף הבית", HOME_PAGE, HOME, HOME_RULES],
  ["דף הזמנת עוגה", CAKE_PAGE_SPEC, CAKE_PAGE, CAKE_PAGE_RULES],
];
/** texts with no field of their own, on purpose: the price format is the site's one ("הגדרות כלליות") */
const ELSEWHERE = new Set(["wizard.order.priceFrom"]);
const TEXT_KINDS = new Set(["line", "text", "time", "phone", "email", "url"]);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fieldsOf = (spec: DocSpec): Record<string, Field> => Object.fromEntries(Object.entries(spec.fields).map(([k, { group: _g, ...f }]) => [k, f as Field]));

/** where the site's texts and the Studio's fields don't match, as "path: why" */
function mismatches(fields: Record<string, Field>, value: Record<string, unknown>, path: string, out: string[]) {
  for (const key of new Set([...Object.keys(fields), ...Object.keys(value)])) {
    const at = path ? `${path}.${key}` : key;
    if (ELSEWHERE.has(at)) continue;
    const field = fields[key];
    if (!field) out.push(`${at}: the site has this text, the Studio has no field for it`);
    else if (!(key in value)) out.push(`${at}: the Studio has this field, the site has no such text`);
    else check(field, value[key], at, out);
  }
}
function check(field: Field, v: unknown, at: string, out: string[]) {
  if (TEXT_KINDS.has(field.kind)) {
    if (typeof v !== "string") out.push(`${at}: a ${field.kind} field for a ${typeof v}`);
  } else if (field.kind === "number") {
    if (v !== null && typeof v !== "number") out.push(`${at}: a number field for a ${typeof v}`);
  } else if (field.kind === "days") {
    if (!Array.isArray(v) || !v.every((d) => typeof d === "number")) out.push(`${at}: a days field for something else`);
  } else if (field.kind === "object") {
    if (!isObject(v)) out.push(`${at}: an object field for a ${typeof v}`);
    else mismatches(field.fields, v, at, out);
  } else if (field.kind === "list") {
    if (!Array.isArray(v) || !v.length) out.push(`${at}: a list field for something else`);
    else if (field.of.kind === "object") {
      if (!field.item) out.push(`${at}: list items need a type name`);
      v.forEach((item, i) => (isObject(item) ? mismatches(field.of.kind === "object" ? field.of.fields : {}, item, `${at}[]`, out) : out.push(`${at}[${i}]: not an object`)));
    } else if (!v.every((item) => typeof item === "string")) out.push(`${at}: a list of texts for something else`);
  }
}

/** every field of a kind, with its path in the rules' notation ("business.hours[].open") */
function walk(fields: Record<string, Field>, path: string, visit: (field: Field, at: string) => void) {
  for (const [key, field] of Object.entries(fields)) {
    const at = path ? `${path}.${key}` : key;
    visit(field, at);
    if (field.kind === "object") walk(field.fields, at, visit);
    if (field.kind === "list" && field.of.kind === "object") walk(field.of.fields, `${at}[]`, visit);
  }
}
/** the site's text at a path in the same notation (the first item of a list) */
function textAt(value: unknown, at: string): unknown {
  return at.split(".").reduce<unknown>((v, part) => {
    const list = part.endsWith("[]");
    const next = isObject(v) ? v[list ? part.slice(0, -2) : part] : undefined;
    return list && Array.isArray(next) ? next[0] : next;
  }, value);
}
const withoutKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(withoutKeys) : isObject(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "_key").map(([k, x]) => [k, withoutKeys(x)])) : v;

for (const [name, spec, texts, rules] of DOCS) {
  describe(`"${name}": the Studio's form and the site`, () => {
    const fields = fieldsOf(spec);

    it("has a field for every text on the site, with the same name, and no others", () => {
      const out: string[] = [];
      mismatches(fields, texts as Record<string, unknown>, "", out);
      assert.deepEqual(out, []);
    });

    it("lets exactly the texts the site may hide stay empty", () => {
      const optional: string[] = [];
      walk(fields, "", (f, at) => TEXT_KINDS.has(f.kind) && "optional" in f && f.optional && optional.push(at));
      assert.deepEqual(optional.sort(), [...(rules.optional ?? [])].sort());
    });

    it("asks for as many list items as the page takes", () => {
      const lengths: Record<string, [number, number]> = {};
      walk(fields, "", (f, at) => f.kind === "list" && (lengths[at] = [f.min, f.max]));
      assert.deepEqual(lengths, rules.length ?? {});
    });

    it("keeps the blanks the site fills in, in the built-in texts too", () => {
      const out: string[] = [];
      walk(fields, "", (f, at) => {
        if (f.kind !== "line" && f.kind !== "text") return;
        const value = textAt(texts, at);
        if (typeof value !== "string") return;
        const used = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const slots = f.slots ?? [];
        for (const blank of used) if (!slots.includes(blank)) out.push(`${at}: {${blank}} isn't one of its blanks`);
        for (const blank of f.needs ?? []) if (!used.includes(blank)) out.push(`${at}: {${blank}} is missing`);
      });
      assert.deepEqual(out, []);
    });

    it("gets the site's built-in texts back from what the seed stores, with nothing refused", () => {
      const problems: string[] = [];
      const live = mergeContent(texts, stored(spec, texts), rules, { problems });
      assert.deepEqual(withoutKeys(live), texts);
      const preview = mergeContent(texts, stored(spec, texts), rules, { strict: true, problems }) as Record<string, unknown>;
      // in the preview, a text the Studio doesn't have is empty (the price format comes from "הגדרות כלליות" there too)
      const expected = structuredClone(texts) as Record<string, unknown>;
      for (const at of ELSEWHERE) {
        const parts = at.split(".");
        const parent = parts.slice(0, -1).reduce<unknown>((v, p) => (isObject(v) ? v[p] : undefined), expected);
        if (isObject(parent) && parts.at(-1)! in parent) parent[parts.at(-1)!] = "";
      }
      assert.deepEqual(withoutKeys(preview), expected);
      assert.deepEqual(problems, []);
    });
  });
}

describe("the Studio's choices and the site's checks", () => {
  it("offers exactly the menu targets the site accepts", () => {
    assert.deepEqual(NAV_CHOICES.map((c) => c.value), NAV_TARGETS);
  });

  it("accepts exactly the phone numbers the site can dial", () => {
    const typed = ["050-873-9090", "0508739090", "+972 50 873 9090", "+972-050-873-9090", "00972-50-873-9090", "03-555-1234", "12345678", "050-873", "+1 212 555 0100", "972-0-123", ""];
    for (const t of typed) assert.equal(dialable(t), ISRAELI.test(international(t)), t);
  });

  it("checks the 3D inscription the way the site does", () => {
    assert.equal(STUDIO_INSCRIPTION.source, INSCRIPTION.source);
    for (const ok of ["מזל טוב", "נועם", "יום הולדת"]) assert.ok(INSCRIPTION.test(ok), ok);
    for (const bad of ["Happy", "מזל טוב!", "יום הולדת שמח לך", "נועם 5"]) assert.ok(!INSCRIPTION.test(bad), bad);
  });
});
