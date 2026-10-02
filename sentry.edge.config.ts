// Sentry for any route that opts into the edge runtime (proxy.ts runs on Node): errors only, no personal data (lib/sentry.ts). Loaded by instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "@/lib/sentry";

Sentry.init(SENTRY_OPTIONS);
