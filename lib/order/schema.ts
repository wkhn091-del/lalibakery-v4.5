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
import type { Draft } from "./model";

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

/** a catalog id (size, base, cream, colour); whether it exists is checked against the catalog */
const ref = z.string().check(z.minLength(1), z.maxLength(80));
const Category = z.enum(["number", "designer", "birthday", "kindergarten"]);
const Exclusion = z.enum(["no-nuts", "no-dairy", "no-gluten", "no-eggs", "no-colors", "no-alcohol"]);
/** YYYY-MM-DD, or empty: the date is optional in the wizard */
const DateOrEmpty = z.union([z.iso.date(), z.literal("")]);

export const DraftSchema = z.object({
  category: z.nullable(Category),
  figure: z.string().check(z.maxLength(3)),
  size: z.nullable(ref),
  base: z.nullable(ref),
  cream: z.nullable(ref),
  colors: z.array(ref).check(z.maxLength(3)),
  theme: text(60),
  message: text(40),
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
