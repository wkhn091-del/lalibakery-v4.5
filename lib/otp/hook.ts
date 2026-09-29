/*
  Supabase Auth's Send SMS hook: Supabase hands us each login code to deliver, signed, and we
  decide whether it goes out. Everything that costs money passes through here, so every check
  runs before the provider is called:
    1. the signature (Standard Webhooks, with the secret from the Supabase dashboard)
    2. Israeli mobile numbers only: no SMS pumping to premium international numbers
    3. per number: 3 codes per 15 minutes and 6 per day. Redis holds a keyed hash of the
       number, never the number itself
    4. the whole site: 150 codes a day. Sentry hears at 80% and when the cap is reached
  Each limit is asked only after the one before it has passed: a code refused by one limit
  isn't counted by the next, so a customer who presses "resend" too often loses 15 minutes,
  not the day, and hammering one number can't use up everyone's day.
  When Redis fails or is slow, the code still goes out and Sentry hears about it: Supabase's
  own limit (30 codes an hour for the whole project, by default) still stands behind this one.

  How Supabase reads the answer (supabase/auth, hookshttp.go): only a 200 with a JSON body is
  read. A refusal is therefore a 200 carrying { error: { http_code, message } }, and Supabase
  answers the browser with that code and message; any other status becomes a generic 500.
  Supabase waits 5 s and retries a hook that times out, which would send the code twice. The
  function's cold start comes out of those 5 s too, so the answer is kept under 3.5 s from the
  moment this code runs.

  The wiring (secret, Redis, provider, Sentry) is in app/api/hooks/send-sms/route.ts; this file
  takes it as arguments, so the tests run it with none of them.
*/
import { createHmac } from "node:crypto";
import * as z from "zod/mini";

export const IL_MOBILE = /^\+9725\d{8}$/;
export const DAILY_CAP = 150;
/** codes left in the day when 80% of the cap is used */
const WARN_AT = DAILY_CAP / 5;
/** Supabase waits 5 s for the hook, cold start included */
const BUDGET_MS = 3500;

/** reason "timeout": Redis didn't answer in time and the request was let through */
export type Verdict = { success: boolean; remaining: number; reason?: string };
export type OtpHookDeps = {
  /** checks the signature and returns the parsed body; throws when it doesn't match */
  verify(raw: string, headers: Record<string, string>): unknown;
  /** the limits, or null in development without Redis (the route won't run without it in production) */
  limits: {
    phone(id: string): Promise<Verdict>;
    phoneDay(id: string): Promise<Verdict>;
    site(): Promise<Verdict>;
  } | null;
  /** keys the hash of the phone number */
  salt: string;
  send(to: string, text: string, signal: AbortSignal): Promise<unknown>;
  report: {
    message(text: string, level: "warning" | "error"): void;
    exception(error: unknown, text: string): void;
  };
  /** the site's host, for the code's last line: @host #code lets iOS and Android fill the code in */
  host?: string;
  now?: () => number;
};

// sms.phone is where the code goes (the new number, when a customer changes theirs); older
// versions of Supabase Auth sent only user.phone
const Payload = z.object({
  user: z.optional(z.object({ phone: z.optional(z.string().check(z.maxLength(32))) })),
  sms: z.object({
    otp: z.string().check(z.regex(/^\d{4,10}$/)),
    phone: z.optional(z.string().check(z.maxLength(32))),
  }),
});

const refuse = (http_code: number, message: string) => Response.json({ error: { http_code, message } });

export function smsText(otp: string, host?: string): string {
  const text = `קוד הכניסה שלך ל-LaliBakery: ${otp}`;
  return host ? `${text}\n\n@${host} #${otp}` : text;
}

/** The number in the E.164 form the checks use: Supabase stores it without the plus */
export const e164 = (phone: string) => "+" + phone.replace(/\D/g, "");

export async function handleSendSms(req: Request, deps: OtpHookDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const started = now();
  const raw = await req.text();
  let body: unknown;
  try {
    body = deps.verify(raw, Object.fromEntries(req.headers));
  } catch {
    return new Response(null, { status: 401 });
  }
  const event = Payload.safeParse(body);
  if (!event.success) return refuse(400, "Unexpected hook payload");

  const phone = e164(event.data.sms.phone || event.data.user?.phone || "");
  if (!IL_MOBILE.test(phone)) return refuse(400, "Only Israeli mobile numbers can receive a code");

  if (deps.limits) {
    const limits = deps.limits;
    try {
      const id = createHmac("sha256", deps.salt).update(phone).digest("base64url");
      const minutes = await limits.phone(id);
      if (!minutes.success) return refuse(429, "Too many codes for this number. Try again later.");
      const day = await limits.phoneDay(id);
      if (!day.success) return refuse(429, "Too many codes for this number. Try again later.");
      const site = await limits.site();
      if (!site.success) return refuse(429, "Login codes are paused until tomorrow.");
      if ([minutes, day, site].some((v) => v.reason === "timeout"))
        deps.report.message("OTP: Redis was too slow, the code was sent without some of its limits", "warning");
      else if (site.remaining === WARN_AT) deps.report.message(`OTP: 80% of today's SMS cap (${DAILY_CAP}) is used`, "warning");
      else if (site.remaining === 0)
        deps.report.message(`OTP: today's SMS cap (${DAILY_CAP}) is reached, codes are paused until midnight UTC`, "error");
    } catch (error) {
      deps.report.exception(error, "OTP: rate limits unavailable, the code was sent without them");
    }
  }

  try {
    const signal = AbortSignal.timeout(Math.max(1000, BUDGET_MS - (now() - started)));
    await deps.send(phone, smsText(event.data.sms.otp, deps.host), signal);
  } catch (error) {
    deps.report.exception(error, "OTP: the SMS provider refused the code or timed out");
    return refuse(502, "The code could not be sent. Try again in a minute.");
  }
  return Response.json({});
}
