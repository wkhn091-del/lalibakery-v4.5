/*
  Sending an SMS (the login codes now, the reminders later): one function in front of whichever
  provider is set up.
    Twilio  TWILIO_ACCOUNT_SID, and either TWILIO_AUTH_TOKEN or an API key (TWILIO_API_KEY_SID +
            TWILIO_API_KEY_SECRET, which can be revoked on its own), and a sender:
            TWILIO_MESSAGING_SERVICE_SID, or TWILIO_FROM (a number or an approved sender name)
    none    in development the message is printed in the terminal instead; in production there
            is no sender, and the caller reports it rather than failing quietly
  An Israeli SMS gateway is one more function of the same shape, tried before or after Twilio.

  Errors carry the provider's status and error code, never its message: those can quote the
  phone number, and errors end up in Sentry.
*/
import "server-only";

/** Sends and returns the provider's message id. signal: when to give up (the SMS hook passes
    what's left of Supabase's 5 s) */
export type SendSms = (to: string, text: string, signal?: AbortSignal) => Promise<string | undefined>;

export class SmsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "SmsError";
  }
}

type Env = Record<string, string | undefined>;

/** when the caller gives no signal of its own */
export const SMS_TIMEOUT_MS = 3500;

function twilio(env: Env): SendSms | null {
  const account = env.TWILIO_ACCOUNT_SID;
  const [user, secret] = env.TWILIO_API_KEY_SID
    ? [env.TWILIO_API_KEY_SID, env.TWILIO_API_KEY_SECRET]
    : [account, env.TWILIO_AUTH_TOKEN];
  const service = env.TWILIO_MESSAGING_SERVICE_SID;
  const from = env.TWILIO_FROM;
  if (!account || !user || !secret || !(service || from)) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account)}/Messages.json`;
  const authorization = `Basic ${btoa(`${user}:${secret}`)}`;
  return async (to, text, signal) => {
    const form = new URLSearchParams({ To: to, Body: text });
    if (service) form.set("MessagingServiceSid", service);
    else form.set("From", from!);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: signal ?? AbortSignal.timeout(SMS_TIMEOUT_MS),
    });
    const detail = (await res.json().catch(() => null)) as { sid?: unknown; code?: unknown } | null;
    if (res.ok) return typeof detail?.sid === "string" ? detail.sid : undefined;
    const code = typeof detail?.code === "number" ? detail.code : undefined;
    throw new SmsError(`Twilio refused the message (HTTP ${res.status}${code ? `, error ${code}` : ""})`, res.status, code);
  };
}

const terminal: SendSms = async (to, text) => {
  console.info(`[sms, development only] to ${to}:\n${text}`);
  return undefined;
};

/** The configured sender; null in production when no provider is set up */
export function smsSender(env: Env = process.env): SendSms | null {
  return twilio(env) ?? (env.NODE_ENV === "development" ? terminal : null);
}
