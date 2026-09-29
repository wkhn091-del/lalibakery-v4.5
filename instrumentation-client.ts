// Sentry in the browser: errors only, no personal data (lib/sentry.ts). Off without NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "@/lib/sentry";

Sentry.init(SENTRY_OPTIONS);
