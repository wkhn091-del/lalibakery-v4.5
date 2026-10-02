import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { activeLocales, DEFAULT_LOCALE } from "./lib/i18n/config";

/** the prefixes that aren't Hebrew pages: the other languages that are on, and Next's and our own routes */
const NOT_HEBREW = [DEFAULT_LOCALE, ...activeLocales().filter((l) => l !== DEFAULT_LOCALE), "api", "_next", "monitoring"].join("|");

const nextConfig: NextConfig = {
  // the project folder, not a stray lockfile higher up the disk
  turbopack: { root: __dirname },
  // Sentry, errors only: its webpack `treeshake` option has no effect under Turbopack (the default
  // bundler since Next 16), so the same flags are set here and every bundle drops the tracing code.
  compiler: {
    define: { __SENTRY_TRACING__: false, __SENTRY_DEBUG__: false },
  },
  // the pages live under app/[locale], so an address that matches nothing has no layout to show a
  // 404 in: app/global-not-found.tsx is that page
  experimental: { globalNotFound: true },

  // Languages (lib/i18n/config.ts): Hebrew's addresses have no prefix (/products), the others do
  // (/en/products). /he/... is sent to the address without it, so each page has one address.
  async redirects() {
    return [
      { source: "/he", destination: "/", permanent: true },
      { source: "/he/:path*", destination: "/:path*", permanent: true },
    ];
  },
  // Pages with personal data are never cached (not by the browser, not by a CDN), and the guest
  // order page's address (it carries the link's key) is never sent to another site as a referrer.
  async headers() {
    const privatePage = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];
    return [
      { source: "/:locale(en|ru)?/order/:code*", headers: [...privatePage, { key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/:locale(en|ru)?/checkout", headers: privatePage },
    ];
  },
  // After files and fixed routes (the API, the sitemap, the images in public/), an address without
  // a language is served from app/[locale] as Hebrew. The browser keeps seeing /products.
  // A language that isn't on (/ru/... before NEXT_PUBLIC_LOCALES lists it) is just a Hebrew
  // address that doesn't exist: the 404 page (app/global-not-found.tsx).
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: "/", destination: "/he" },
        { source: `/:path((?!(?:${NOT_HEBREW})(?:/|$)).+)`, destination: "/he/:path" },
      ],
      fallback: [],
    };
  },
};

// Source maps upload at build time when SENTRY_AUTH_TOKEN is set. Events reach Sentry through
// /monitoring on our own domain, so ad blockers don't drop them (proxy.ts leaves it alone).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
});
