/*
  The shape of what the cake builder sends, one Zod schema for the browser and the server:
    DraftSchema  the wizard's draft as it stands (anything may still be empty): what the browser
                 restores from localStorage and what the server accepts as a saved draft
    OrderSchema  a draft ready to send: category, size, base and cream chosen
  The limits match the wizard's own inputs. Whether the ids exist in the catalog, and belong
  together, is checked on the server against the live catalog (validate.ts).

  Written with zod/mini, the tree-shakable build of the same library: the browser loads this file
  (restoring a saved wizard), and the classic build would add about 27 kB to the cake page.
*/
import * as z from "zod/mini";
import { type Draft, KEEP_KEYS, MAX_ADDONS, MAX_LAYERS, MAX_LIKED } from "./model";

// Hebrew-safe text: NFC; no control, bidi-override or zero-width characters (they can reorder or
// hide what the owner reads in WhatsApp); trimmed; capped. Line breaks stay (the notes field).
const INVISIBLE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​‪-‮⁦-⁩﻿]/g;
const text = (max: number) =>
  z.string().check(
    z.maxLength(max * 4, { abort: true }), // a first bound, before any work is done on it
    z.normalize("NFC"),
    z.overwrite((s) => s.replace(INVISIBLE, "").trim()),
    z.maxLength(max),
  );

/** an https address with a host and no user:password, written by the customer; shown to the owner as text, never fetched */
export function isInspirationLink(s: string): boolean {
  if (!/^https:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !!u.hostname.includes(".") && !u.username && !u.password;
  } catch {
    return false;
  }
}
const Link = text(300).check(z.refine((s) => s === "" || isInspirationLink(s), "An https link"));

/** a catalog id (size, base, cream, colour); whether it exists is checked against the catalog */
const ref = z.string().check(z.minLength(1), z.maxLength(80));
const Category = z.enum(["number", "designer", "birthday", "kindergarten"]);
const Exclusion = z.enum(["no-nuts", "no-dairy", "no-gluten", "no-eggs", "no-colors", "no-alcohol"]);
/** YYYY-MM-DD, or empty: the date is optional in the wizard */
const DateOrEmpty = z.union([z.iso.date(), z.literal("")]);

/** an add-on as chosen; whether it fits the add-on (option, colour, text, count) is checked against the catalog */
const AddonPick = z.object({
  key: ref,
  option: z.nullable(ref),
  color: z.nullable(ref),
  text: text(200),
  qty: z.nullable(z.int().check(z.gte(1), z.lte(100))),
});

export const DraftSchema = z.object({
  category: z.nullable(Category),
  figure: z.string().check(z.maxLength(3)),
  size: z.nullable(ref),
  base: z.nullable(ref),
  cream: z.nullable(ref),
  layers: z.nullable(z.int().check(z.gte(1), z.lte(MAX_LAYERS))),
  layerBases: z.array(z.nullable(ref)).check(z.maxLength(MAX_LAYERS)),
  fillings: z.array(z.nullable(ref)).check(z.maxLength(MAX_LAYERS - 1)),
  coating: z.nullable(ref),
  colors: z.array(ref).check(z.maxLength(3)),
  themeId: z.nullable(ref),
  theme: text(60),
  liked: z.array(ref).check(z.maxLength(MAX_LIKED)),
  exact: z.nullable(ref),
  keep: z.array(z.enum(KEEP_KEYS)).check(z.maxLength(KEEP_KEYS.length)),
  change: text(300),
  link: Link,
  message: text(40),
  addons: z.array(AddonPick).check(z.maxLength(MAX_ADDONS)),
  exclusions: z.array(Exclusion).check(z.maxLength(6)),
  allergy: z.boolean(),
  notes: text(400),
  date: DateOrEmpty,
});

export const OrderSchema = z.extend(DraftSchema, {
  category: Category,
  size: ref,
  base: ref,
  cream: ref,
});

/** A parsed draft, as the wizard's own Draft type (this stops compiling if the two drift apart) */
export const asDraft = (d: z.infer<typeof DraftSchema>): Draft => d;
