/*
  What the checkout form may send, checked with Zod on the server: the cart as ids and quantities
  (prices are never read from the browser), the contact details, how and when, and how to pay.
  Every text is capped, normalized and stripped of invisible characters (they could reorder what
  the owner reads). The phone is turned into E.164 here; a field that fails is named, its value
  never echoed back.
*/
import * as z from "zod/mini";
import { israeliPhone } from "@/lib/phone";
import { CartLinesInput, CityInput } from "@/lib/pricing/input";

const INVISIBLE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Plain text: NFC, no control or bidi characters, trimmed, at most `max` characters */
export const plain = (max: number) =>
  z.string().check(
    z.maxLength(max * 4, { abort: true }),
    z.normalize("NFC"),
    z.overwrite((s) => s.replace(INVISIBLE, "").trim()),
    z.maxLength(max),
  );

const phone = (pattern: RegExp) =>
  z.pipe(
    z.string().check(z.maxLength(32)),
    z.pipe(
      z.transform((raw: string) => israeliPhone(raw) ?? ""),
      z.string().check(z.regex(pattern)),
    ),
  );
/** the customer's: a mobile (updates go there, and the payment page requires one) */
export const Mobile = phone(/^\+9725\d{8}$/);
/** a recipient's: any Israeli number */
const Phone = phone(/^\+972\d{8,9}$/);
/** first and last name (the payment page requires two words) */
export const FullName = plain(80).check(z.minLength(3), z.regex(/^\S+(?:\s+\S+)+$/));

export const OptionalEmail = z.pipe(
  plain(254),
  z.union([z.literal(""), z.email()]),
);

const Id = z.string().check(z.regex(/^[A-Za-z0-9._-]{1,128}$/));

export const PAYMENT_METHODS = ["online", "whatsapp", "phone", "in_person"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CheckoutInput = z.object({
  lines: CartLinesInput,
  coupon: z.optional(z.string().check(z.maxLength(64))),
  name: FullName,
  phone: Mobile,
  email: z.optional(OptionalEmail),
  fulfilment: z.discriminatedUnion("type", [
    z.object({ type: z.literal("pickup") }),
    z.object({
      type: z.literal("delivery"),
      city: CityInput,
      address: plain(200).check(z.minLength(3)),
      notes: z.optional(plain(300)),
      windowId: z.nullable(Id),
      recipient: z.optional(
        z.object({
          name: plain(80).check(z.minLength(2)),
          phone: Phone,
        }),
      ),
    }),
  ]),
  date: z.iso.date(),
  payment: z.enum(PAYMENT_METHODS),
  terms: z.literal(true),
  turnstile: z.optional(z.string().check(z.maxLength(2048))),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;

/** The form's fields, for pointing at the ones to fix (by name only) */
export type CheckoutField = "name" | "phone" | "email" | "city" | "address" | "notes" | "recipientName" | "recipientPhone" | "date" | "window" | "payment" | "terms" | "lines";

export function fieldsOf(error: z.core.$ZodError): CheckoutField[] {
  const out = new Set<CheckoutField>();
  for (const issue of error.issues) {
    const [a, b, c] = issue.path.map(String);
    if (a === "fulfilment") {
      if (b === "city") out.add("city");
      else if (b === "address") out.add("address");
      else if (b === "notes") out.add("notes");
      else if (b === "windowId") out.add("window");
      else if (b === "recipient") out.add(c === "phone" ? "recipientPhone" : "recipientName");
      else out.add("city");
    } else if (a === "name" || a === "phone" || a === "email" || a === "date" || a === "payment" || a === "terms" || a === "lines") out.add(a);
    else if (a === "coupon") out.add("lines");
  }
  return [...out];
}
