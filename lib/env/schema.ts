/*
  The shape of the server's environment, checked with Zod. No values live here: instrumentation.ts
  runs the check once when the server starts (it can't import "server-only" code), and
  lib/env/server.ts, which the rest of the server reads, runs it on first use.

  A value that's set but malformed stops the server with a message that names the variable, never
  its value. A value that isn't set leaves its feature off, and the feature says so where it's used
  (without Grow the checkout offers only the manual payments, without Resend no email is sent...).
*/
import * as z from "zod/mini";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodMiniType>(schema: T) => z.pipe(z.transform(blank), z.optional(schema));

const secret = (min: number) => z.string().check(z.minLength(min), z.maxLength(4096));
const url = z.url({ protocol: /^https?$/ });

export const EnvSchema = z.object({
  NODE_ENV: z.optional(z.string()),
  NEXT_PUBLIC_SITE_URL: opt(url),

  // Supabase (the orders). The secret key bypasses row-level security: server only.
  NEXT_PUBLIC_SUPABASE_URL: opt(url),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: opt(secret(20)),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: opt(secret(20)),
  SUPABASE_SECRET_KEY: opt(secret(20)),
  SUPABASE_SERVICE_ROLE_KEY: opt(secret(20)),

  // the coupon codes' HMAC pepper, and the guest order link's signing key
  COUPON_PEPPER: opt(secret(32)),
  ORDER_LINK_SECRET: opt(secret(32)),

  // Grow (Meshulam): the payment page
  GROW_API_URL: opt(url),
  GROW_PAGE_CODE: opt(z.string().check(z.regex(/^[A-Za-z0-9]{4,64}$/))),
  GROW_USER_ID: opt(z.string().check(z.regex(/^[A-Za-z0-9]{4,64}$/))),
  GROW_API_KEY: opt(secret(8)),

  // Cloudflare Turnstile: the site key is public, the secret isn't
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: opt(z.string().check(z.regex(/^[0-9A-Za-z_-]{10,100}$/))),
  TURNSTILE_SECRET_KEY: opt(secret(10)),

  // Resend (emails from the site) and where the owner's copy goes
  RESEND_API_KEY: opt(z.string().check(z.regex(/^re_[A-Za-z0-9_]{10,200}$/))),
  ORDERS_EMAIL_FROM: opt(z.string().check(z.maxLength(200), z.regex(/^(?:[^<>]{1,80} )?<?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/))),
  ORDERS_EMAIL_TO: opt(z.email()),

  // Google Sheets: a service account, and the sheet it may write to
  GOOGLE_SERVICE_ACCOUNT_EMAIL: opt(z.email()),
  GOOGLE_SERVICE_ACCOUNT_KEY: opt(z.string().check(z.minLength(100), z.maxLength(8192), z.includes("PRIVATE KEY"))),
  ORDERS_SHEET_ID: opt(z.string().check(z.regex(/^[A-Za-z0-9_-]{20,100}$/))),

  // the jobs (expire unpaid orders, purge old addresses) are called with this
  CRON_SECRET: opt(secret(32)),

  // Meta Pixel (public; loads only after consent)
  NEXT_PUBLIC_META_PIXEL_ID: opt(z.string().check(z.regex(/^\d{8,20}$/))),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

/** The checked environment. Throws, naming the variables, when one is set but malformed */
export function parseEnv(env: Record<string, string | undefined>): ServerEnv {
  const result = z.safeParse(EnvSchema, env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "?")))];
    throw new Error(`Malformed environment variables: ${names.join(", ")}. Check them in .env.local or in Vercel (the values aren't printed).`);
  }
  return result.data;
}
