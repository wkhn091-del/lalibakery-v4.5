/*
  Sentry settings shared by the browser, the server and the edge (instrumentation-client.ts,
  sentry.server.config.ts, sentry.edge.config.ts). Setup: SERVICES.md, "Sentry".

  Errors only (tracing is tree-shaken out in next.config.ts), and no personal data: Sentry 11
  collects IP addresses, cookies, headers and request bodies by default, and this site handles
  phone numbers, so all of that is off. Headers are an allow-list, not a deny-list: Vercel adds
  headers of its own that carry the visitor's IP (x-vercel-proxied-for, among others). Anything
  shaped like an Israeli mobile number is masked before an event or a breadcrumb leaves.
  Without NEXT_PUBLIC_SENTRY_DSN nothing is sent, and nothing is sent from `next dev`.
*/
import type { BrowserOptions } from "@sentry/nextjs";

// what helps read an error and says nothing about who the visitor is
const REQUEST_HEADERS = ["user-agent", "referer", "accept", "accept-language", "content-type", "next-action", "x-vercel-id"];
const RESPONSE_HEADERS = ["content-type", "cache-control", "x-vercel-cache"];

export const SENTRY_OPTIONS = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: REQUEST_HEADERS }, response: { allow: RESPONSE_HEADERS } },
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
  },
  // noise that isn't ours: browser extensions, and a harmless browser warning
  denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-(web-)?extension:\/\//],
  ignoreErrors: [/ResizeObserver loop/],
  beforeSend: redactPhones,
  beforeBreadcrumb: redactPhones,
} satisfies BrowserOptions;

// +972 50-123-4567, 972501234567, 050 123 4567, 0501234567 …
const PHONE = /(\+?972[-\s]?|\b0)5\d[-\s]?\d{3}[-\s]?\d{4}\b/g;

function scrub<T>(value: T, depth: number): T {
  if (typeof value === "string") return value.replace(PHONE, "[phone]") as T;
  if (depth > 12 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = scrub(v, depth + 1);
  return out as T;
}

/** Masks Israeli mobile numbers anywhere in an event or a breadcrumb */
export function redactPhones<T>(item: T): T {
  return scrub(item, 0);
}
