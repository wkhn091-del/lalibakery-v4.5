/*
  Email through Resend's API (one fetch, no SDK). Plain text only: what customers typed goes into
  the message as text, so there's no HTML to inject into. Each message has an idempotency key, so
  a retried job never sends it twice. Without RESEND_API_KEY nothing is sent (and the log says so).
*/
import "server-only";
import { serverEnv } from "@/lib/env/server";

export type Email = { to: string; subject: string; text: string; replyTo?: string; key: string };

export async function sendEmail(email: Email): Promise<boolean> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY || !env.ORDERS_EMAIL_FROM) {
    console.warn("[email] Resend isn't set up: not sent:", email.subject);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": email.key.slice(0, 256) },
    body: JSON.stringify({ from: env.ORDERS_EMAIL_FROM, to: [email.to], subject: email.subject.slice(0, 200), text: email.text, ...(email.replyTo ? { reply_to: email.replyTo } : {}) }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  return true;
}
