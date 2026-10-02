import { defineArrayMember, defineField, type FieldDefinition, type ObjectRule, type StringRule } from "sanity";
import { DEFAULT_LOCALE, ENABLED_LOCALES, LOCALES } from "../locales";

/*
  Fields in every language of the site (../locales.ts), stored as { he, en, ru }. The site reads
  the visitor's language and falls back to Hebrew (lib/i18n on the site), so a language that's
  switched on but not filled in yet never shows an empty space.
*/

type Common = {
  name: string;
  title: string;
  description?: string;
  /** Hebrew must be filled in (the other languages never are, until they're switched on) */
  required?: boolean;
  group?: string;
  fieldset?: string;
  hidden?: FieldDefinition["hidden"];
};

type Value = Partial<Record<string, unknown>> | undefined;

// tabs, zero-width characters and direction marks: invisible in the Studio, but they break
// searches, line wrapping and the site's right-to-left text
const HIDDEN_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

const REQUIRED_HE = "חובה למלא בעברית";

function requiredHebrew(required: boolean | undefined) {
  return (rule: ObjectRule) =>
    rule.custom((value: Value) => {
      if (!required) return true;
      const he = value?.[DEFAULT_LOCALE];
      if (typeof he === "string") return he.trim() ? true : REQUIRED_HE;
      if (Array.isArray(he)) return he.length ? true : REQUIRED_HE;
      return REQUIRED_HE;
    });
}

const cleanText = (max: number) => (rule: StringRule) =>
  rule.custom((value: string | undefined) => {
    if (typeof value !== "string" || !value) return true;
    if (value.length > max) return `עד ${max} תווים (עכשיו ${value.length})`;
    if (HIDDEN_CHARACTERS.test(value)) return "יש בטקסט תו נסתר (למשל מהעתקה מוואטסאפ או מוורד). מחקו והקלידו מחדש את המילה האחרונה שהודבקה";
    return true;
  });

function wrapper(opts: Common, fields: FieldDefinition[]) {
  return defineField({
    name: opts.name,
    title: opts.title,
    type: "object",
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.group ? { group: opts.group } : {}),
    ...(opts.fieldset ? { fieldset: opts.fieldset } : {}),
    ...(opts.hidden ? { hidden: opts.hidden } : {}),
    options: { collapsible: false },
    fields,
    validation: requiredHebrew(opts.required),
  });
}

/** One line in every language (a name, a label, a button) */
export function localizedString(opts: Common & { max: number }) {
  return wrapper(
    opts,
    LOCALES.map((l) =>
      defineField({
        name: l.id,
        title: l.title,
        type: "string",
        hidden: !ENABLED_LOCALES.has(l.id),
        validation: cleanText(opts.max),
      }),
    ),
  );
}

/** A paragraph of plain text in every language (a description, a short note) */
export function localizedText(opts: Common & { max: number; rows?: number }) {
  return wrapper(
    opts,
    LOCALES.map((l) =>
      defineField({
        name: l.id,
        title: l.title,
        type: "text",
        rows: opts.rows ?? 3,
        hidden: !ENABLED_LOCALES.has(l.id),
        validation: cleanText(opts.max),
      }),
    ),
  );
}

/**
 * Formatted text in every language, for the legal pages: paragraphs, two heading levels, lists,
 * bold, and links (https, mail and phone only). Rendered by the site as React elements, never as
 * HTML, so nothing typed here can run as code on the site.
 */
export function localizedBlocks(opts: Common) {
  return wrapper(
    opts,
    LOCALES.map((l) =>
      defineField({
        name: l.id,
        title: l.title,
        type: "array",
        hidden: !ENABLED_LOCALES.has(l.id),
        of: [
          defineArrayMember({
            type: "block",
            styles: [
              { title: "פסקה", value: "normal" },
              { title: "כותרת", value: "h2" },
              { title: "כותרת משנה", value: "h3" },
            ],
            lists: [
              { title: "תבליטים", value: "bullet" },
              { title: "מספור", value: "number" },
            ],
            marks: {
              decorators: [{ title: "מודגש", value: "strong" }],
              annotations: [
                {
                  name: "link",
                  title: "קישור",
                  type: "object",
                  fields: [
                    defineField({
                      name: "href",
                      title: "כתובת",
                      type: "url",
                      description: "https://..., mailto:... או tel:...",
                      validation: (rule) => rule.required().uri({ scheme: ["https", "mailto", "tel"] }),
                    }),
                  ],
                },
              ],
            },
          }),
        ],
      }),
    ),
  );
}

/** The Hebrew text of a localized value, for previews in the Studio's lists */
export function hebrew(value: unknown): string | undefined {
  const he = (value as Value)?.[DEFAULT_LOCALE];
  return typeof he === "string" && he.trim() ? he : undefined;
}
