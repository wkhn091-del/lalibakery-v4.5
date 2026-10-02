import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once per server runtime: Sentry for Node or for the edge
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // a malformed secret stops the server here, not halfway through someone's checkout
    const { parseEnv } = await import("./lib/env/schema");
    parseEnv(process.env);
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

// Errors thrown in server components, route handlers and Server Actions
export const onRequestError = Sentry.captureRequestError;
