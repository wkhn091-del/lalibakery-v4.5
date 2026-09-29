import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
};

// Sentry, errors only: tracing is tree-shaken out of every bundle (36 kB of First Load instead of
// 65). Source maps upload at build time when SENTRY_AUTH_TOKEN is set. Events reach Sentry through
// /monitoring on our own domain, so ad blockers don't drop them (middleware.ts leaves it alone).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  webpack: { treeshake: { removeTracing: true, removeDebugLogging: true } },
});
