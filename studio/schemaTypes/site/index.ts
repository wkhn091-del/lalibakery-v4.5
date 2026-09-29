import { CogIcon } from "@sanity/icons/Cog";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";
import { HomeIcon } from "@sanity/icons/Home";
import type { ComponentType } from "react";
import { defineType, type FieldDefinition, type Rule } from "sanity";
import { type DocSpec, dialable, type Field, type LineField, type ObjectField, SITE_DOCS } from "./spec";

/*
  The site's texts as Studio forms: ./spec.ts says what each text is; this turns it into Sanity's
  schema (fields, hints, checks). The three documents are singletons, one of each, with fixed ids:
  the sidebar opens them directly (../../structure.ts), and they can't be created, duplicated or
  deleted (../../sanity.config.ts).
*/

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const BLANK = /\{(\w+)\}/g;
const REQUIRED = "חובה למלא: בלי הטקסט הזה, באתר מוצג הטקסט המקורי";

const ICONS: Record<string, ComponentType> = { siteSettings: CogIcon, homePage: HomeIcon, cakePage: DocumentTextIcon };

// Sanity's rule builders chain by kind (string, number, array…); one loose type keeps the builder below readable
type AnyRule = Rule & {
  required: () => AnyRule;
  min: (n: number) => AnyRule;
  max: (n: number) => AnyRule;
  length: (n: number) => AnyRule;
  unique: () => AnyRule;
  email: () => AnyRule;
  uri: (o: { scheme: string[] }) => AnyRule;
  custom: (fn: (value: unknown, context: { parent?: unknown }) => true | string) => AnyRule;
  warning: (message?: string) => AnyRule;
  error: (message?: string) => AnyRule;
};
type Def = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const shown = (names: string[]) => names.map((n) => `{${n}}`).join(", ");

/** a template's blanks: only the ones the site fills in, and none of the ones it needs removed */
function blanks(f: LineField) {
  return (value: unknown): true | string => {
    const used = [...text(value).matchAll(BLANK)].map((m) => m[1]);
    const unknown = used.filter((n) => !f.slots!.includes(n));
    if (unknown.length) return `${shown(unknown)} לא יתמלא. אפשר להשתמש ב: ${shown(f.slots!)}`;
    const missing = (f.needs ?? []).filter((n) => !used.includes(n));
    if (missing.length) return `חסר ${shown(missing)}: בלעדיו הערך לא יופיע`;
    return true;
  };
}

function lineRules(rule: AnyRule, f: LineField): AnyRule[] {
  const out: AnyRule[] = [];
  if (!f.optional) out.push(rule.required().error(REQUIRED));
  if (f.max) out.push(rule.max(f.max).warning(`מעל ${f.max} תווים הטקסט עלול לא להיכנס יפה בעיצוב`));
  if (f.slots) out.push(rule.custom(blanks(f)));
  if (f.pattern) {
    const { regex, message } = f.pattern;
    out.push(rule.custom((v) => !text(v) || regex.test(text(v)) || message));
  }
  if (f.choices) {
    const values = f.choices.map((c) => c.value);
    out.push(rule.custom((v) => !text(v) || values.includes(text(v)) || "בחרו מהרשימה"));
  }
  return out;
}

function toField(name: string, f: Field, extra: Def = {}): Def {
  const common: Def = { name, title: f.title, ...(f.description ? { description: f.description } : {}), ...(f.fieldset ? { fieldset: f.fieldset } : {}), ...extra };
  switch (f.kind) {
    case "line":
    case "text":
      return {
        ...common,
        type: f.kind === "text" ? "text" : "string",
        ...(f.kind === "text" ? { rows: f.rows ?? 3 } : {}),
        ...(f.choices ? { options: { list: f.choices, layout: "dropdown" } } : {}),
        validation: (rule: AnyRule) => lineRules(rule, f),
      };
    case "number":
      return {
        ...common,
        type: "number",
        validation: (rule: AnyRule) => [
          ...(f.optional ? [] : [rule.required().error(REQUIRED)]),
          ...(f.min != null ? [rule.min(f.min)] : []),
          ...(f.max != null ? [rule.max(f.max)] : []),
        ],
      };
    case "days":
      return {
        ...common,
        type: "array",
        of: [{ type: "number" }],
        options: { list: DAYS.map((title, value) => ({ title, value })), layout: "grid" },
        validation: (rule: AnyRule) => rule.required().min(1).unique().error("סמנו לפחות יום אחד"),
      };
    case "time":
      return {
        ...common,
        type: "string",
        placeholder: "08:00",
        validation: (rule: AnyRule) => [
          ...(f.optional ? [] : [rule.required().error(REQUIRED)]),
          rule.custom((v) => !text(v) || TIME.test(text(v)) || "שעה בפורמט 08:00"),
        ],
      };
    case "phone":
      return {
        ...common,
        type: "string",
        placeholder: "050-000-0000",
        validation: (rule: AnyRule) => [
          ...(f.optional ? [] : [rule.required().error(REQUIRED)]),
          rule.custom((v) => !text(v) || dialable(text(v)) || "מספר טלפון ישראלי מלא, למשל 050-873-9090"),
        ],
      };
    case "email":
      return { ...common, type: "string", validation: (rule: AnyRule) => rule.required().email().error("כתובת מייל מלאה") };
    case "url":
      return {
        ...common,
        type: "url",
        validation: (rule: AnyRule) => [
          ...(f.optional ? [] : [rule.required().error(REQUIRED)]),
          rule.uri({ scheme: ["https"] }).error("קישור מלא שמתחיל ב-https://"),
        ],
      };
    case "object":
      return {
        ...common,
        type: "object",
        ...objectParts(f),
        options: { collapsible: true, collapsed: !!f.collapsed },
      };
    case "list": {
      const of = f.of;
      const member =
        of.kind === "object"
          ? {
              type: "object",
              name: f.item,
              title: of.title,
              ...objectParts(of),
              preview: { select: { title: f.label ?? Object.keys(of.fields)[0] } },
            }
          : { type: of.kind === "text" ? "text" : "string", ...(of.kind === "text" ? { rows: of.rows ?? 3 } : {}), validation: (rule: AnyRule) => lineRules(rule, of) };
      const count = f.min === f.max ? `בדיוק ${f.min}` : `${f.min} עד ${f.max}`;
      return {
        ...common,
        type: "array",
        of: [member],
        ...(f.fixed ? { options: { sortable: false, disableActions: ["add", "addBefore", "addAfter", "remove", "duplicate", "copy"] } } : {}),
        validation: (rule: AnyRule) => [
          ...(f.min > 0 ? [rule.required().error(REQUIRED)] : []),
          rule.custom((v) => {
            const n = Array.isArray(v) ? v.length : 0;
            return (n === 0 && f.min === 0) || (n >= f.min && n <= f.max) || `צריך ${count} (עכשיו ${n}); אחרת באתר מוצגת הרשימה המקורית`;
          }),
        ],
      };
    }
  }
}

function objectParts(f: ObjectField): Def {
  const parts: Def = { fields: Object.entries(f.fields).map(([name, field]) => toField(name, field)) };
  if (f.fieldsets) parts.fieldsets = f.fieldsets.map((s) => ({ ...s, options: { collapsible: true, collapsed: true } }));
  if (f.together) {
    const [a, b] = f.together;
    parts.validation = (rule: AnyRule) =>
      rule.custom((v) => {
        const value = (v ?? {}) as Record<string, unknown>;
        return !!text(value[a]) === !!text(value[b]) || "ממלאים את שתי השעות, או משאירים את שתיהן ריקות (יום סגור)";
      });
  }
  return parts;
}

function toDocument(spec: DocSpec) {
  return defineType({
    name: spec.name,
    title: spec.title,
    type: "document",
    icon: ICONS[spec.name],
    groups: spec.groups.map((g, i) => ({ ...g, default: i === 0 })),
    fields: Object.entries(spec.fields).map(([name, { group, ...field }]) => toField(name, field as Field, { group })) as unknown as FieldDefinition[],
    preview: { prepare: () => ({ title: spec.title }) },
  });
}

export const siteTypes = SITE_DOCS.map(toDocument);

/** the three documents: one of each, with a fixed id */
export const SINGLETONS = SITE_DOCS.map(({ name, title, id, pages }) => ({ type: name, title, id, pages }));
export const SINGLETON_TYPES = new Set(SINGLETONS.map((s) => s.type));
