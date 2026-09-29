// Sentry at the edge (middleware): errors only, no personal data (lib/sentry.ts). Loaded by instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "@/lib/sentry";

Sentry.init(SENTRY_OPTIONS);
