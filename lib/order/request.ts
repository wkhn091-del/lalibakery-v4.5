/*
  What the builder sends when the cake goes to the owner as a request: the draft (checked again on
  the server against the published catalog, validate.ts) and how to reach the customer. No price:
  a builder cake is priced by the owner. A field that fails is named, its value never echoed back.
*/
import * as z from "zod/mini";
import { FullName, Mobile, OptionalEmail } from "@/lib/checkout/input";

export const CakeRequestInput = z.object({
  draft: z.unknown(),
  name: FullName,
  phone: Mobile,
  email: z.optional(OptionalEmail),
  turnstile: z.optional(z.string().check(z.maxLength(2048))),
});

export type CakeRequestField = "name" | "phone" | "email" | "cake";

export function requestFieldsOf(error: z.core.$ZodError): CakeRequestField[] {
  const out = new Set<CakeRequestField>();
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    out.add(key === "name" || key === "phone" || key === "email" ? key : "cake");
  }
  return [...out];
}
