/*
  Supabase Auth → Send SMS hook (Supabase dashboard: Authentication > Hooks > Send SMS, HTTPS,
  https://<domain>/api/hooks/send-sms). Every login code goes through here. The checks are in
  lib/otp/hook.ts; this file wires the real secret, Redis, the SMS provider and Sentry.

  Nothing is sent while a piece is missing in production: the hook answers with an error, Sentry
  names the missing variables, and customers can't get a code until it's fixed. Loud on purpose,
  so an unprotected launch can't happen quietly.
*/
import * as Sentry from "@sentry/nextjs";
import { Ratelimit } from "@upstash/ratelimit";
import { Webhook } from "standardwebhooks";
import { DAILY_CAP, handleSendSms, type OtpHookDeps } from "@/lib/otp/hook";
import { smsSender } from "@/lib/sms";
import { redisFromEnv } from "@/lib/upstash";

export const runtime = "nodejs";

/** each limit gives up after this long and lets the code through (Supabase waits 5 s in all;
    Upstash answers from the same Frankfurt region in a few milliseconds) */
const LIMIT_TIMEOUT_MS = 500;

let wired: OtpHookDeps | undefined;

/** The hook's pieces, or the names of the ones missing */
function wire(env = process.env): OtpHookDeps | string[] {
  if (wired) return wired;
  const production = env.NODE_ENV === "production";
  const missing: string[] = [];

  // "v1,whsec_…" as the dashboard shows it; several, separated by "|", while rotating the secret
  const secrets = (env.SEND_SMS_HOOK_SECRET ?? "").split("|").map((s) => s.trim().replace(/^v1,/, "")).filter(Boolean);
  if (!secrets.length) missing.push("SEND_SMS_HOOK_SECRET");
  const redis = redisFromEnv(env);
  if (!redis && production) missing.push("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN");
  const salt = env.RATE_LIMIT_SALT ?? "";
  if (redis && salt.length < 16) missing.push("RATE_LIMIT_SALT (16 characters or more)");
  const send = smsSender(env);
  if (!send) missing.push("an SMS provider (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM)");
  if (missing.length) return missing;

  const hooks = secrets.map((s) => new Webhook(s));
  const limiter = (prefix: string, algorithm: ConstructorParameters<typeof Ratelimit>[0]["limiter"]) =>
    new Ratelimit({ redis: redis!, prefix, limiter: algorithm, timeout: LIMIT_TIMEOUT_MS });
  const phone = redis && limiter("otp:phone", Ratelimit.slidingWindow(3, "15 m"));
  const phoneDay = redis && limiter("otp:phone:day", Ratelimit.slidingWindow(6, "1 d"));
  const site = redis && limiter("otp:day", Ratelimit.fixedWindow(DAILY_CAP, "1 d"));

  let host: string | undefined;
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    if (url.protocol === "https:") host = url.host;
  } catch {
    // no site address: the code goes out without the autofill line
  }

  return (wired = {
    verify(raw, headers) {
      let failure: unknown;
      for (const hook of hooks) {
        try {
          return hook.verify(raw, headers);
        } catch (error) {
          failure = error;
        }
      }
      throw failure;
    },
    limits:
      phone && phoneDay && site
        ? { phone: (id) => phone.limit(id), phoneDay: (id) => phoneDay.limit(id), site: () => site.limit("all") }
        : null,
    salt,
    send: send!,
    report: {
      message: (text, level) => Sentry.captureMessage(text, { level, tags: { area: "otp" } }),
      exception: (error, text) => Sentry.captureException(error, { tags: { area: "otp" }, extra: { step: text } }),
    },
    host,
  });
}

export async function POST(req: Request) {
  const deps = wire();
  if (Array.isArray(deps)) {
    Sentry.captureMessage(`OTP hook is missing: ${deps.join(", ")}`, { level: "error", tags: { area: "otp" } });
    return Response.json({ error: { http_code: 503, message: "Login codes aren't available yet." } });
  }
  return handleSendSms(req, deps);
}
