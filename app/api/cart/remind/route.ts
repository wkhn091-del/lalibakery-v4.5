/*
  QStash → the cart reminder, 2 hours after a signed-in customer's draft was started. Only QStash
  can call it (its signature, checked with QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY).
  What happens is in lib/cart/remind.ts; this file wires Supabase (service role), QStash, the SMS
  provider and Sentry.

  Reminders go out by the channel the customer agreed to. SMS works today; a WhatsApp reminder
  needs an approved WhatsApp template and its sender, and until then it's recorded as failed
  (and reported), not switched to SMS behind the customer's back.
*/
import * as Sentry from "@sentry/nextjs";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { ClaimRow, handleCartReminder, type RemindDeps } from "@/lib/cart/remind";
import { scheduleCartReminder } from "@/lib/qstash";
import { smsSender } from "@/lib/sms";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function wire(env = process.env): RemindDeps | string[] {
  const missing: string[] = [];
  const db = supabaseAdmin(env);
  if (!db) missing.push("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY");
  if (!env.NEXT_PUBLIC_SITE_URL) missing.push("NEXT_PUBLIC_SITE_URL");
  if (!env.QSTASH_TOKEN) missing.push("QSTASH_TOKEN");
  if (missing.length || !db) return missing;
  const sms = smsSender(env);

  return {
    async claim(draftId) {
      const { data, error } = await db.rpc("claim_cart_reminder", { p_draft_id: draftId });
      if (error) throw new Error(`claim_cart_reminder: ${error.message}`);
      return ClaimRow.parse(Array.isArray(data) ? data[0] : data);
    },
    async reschedule(draftId, at) {
      if (!(await scheduleCartReminder(draftId, at, env))) throw new Error("QStash is not set up");
    },
    async send(channel, to, text) {
      if (channel === "whatsapp") throw new Error("The WhatsApp sender isn't set up yet");
      if (!sms) throw new Error("No SMS provider is set up");
      return sms(to, text);
    },
    async record(messageId, result) {
      const { error } = await db
        .from("reminder_messages")
        .update(
          result.status === "sent"
            ? { status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.providerId ?? null }
            : { status: "failed", error: result.error },
        )
        .eq("id", messageId);
      if (error) throw new Error(`reminder_messages: ${error.message}`);
    },
    report: {
      exception: (error, text) => Sentry.captureException(error, { tags: { area: "cart" }, extra: { step: text } }),
    },
    siteUrl: env.NEXT_PUBLIC_SITE_URL!,
  };
}

async function remind(req: Request): Promise<Response> {
  const deps = wire();
  if (Array.isArray(deps)) {
    Sentry.captureMessage(`Cart reminders are missing: ${deps.join(", ")}`, { level: "error", tags: { area: "cart" } });
    return new Response("Not set up", { status: 500 }); // QStash asks again later
  }
  const body: unknown = await req.json().catch(() => null);
  return handleCartReminder(body, deps);
}

// The signature check reads its keys when it's created: created on the first request, so a
// build without the keys still works
let verified: ((req: Request) => Promise<Response>) | undefined;

export async function POST(req: Request) {
  try {
    verified ??= verifySignatureAppRouter(remind);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "cart" } });
    return new Response("QStash signing keys are missing", { status: 500 });
  }
  return verified(req);
}
