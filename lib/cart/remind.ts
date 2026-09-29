/*
  "Did you forget your cake?" QStash asks /api/cart/remind about a draft 2 hours after the
  customer's first save (lib/cart/save.ts schedules it). The database decides
  (claim_cart_reminder in supabase/migrations/20260929090000_cart_recovery.sql), atomically;
  this file carries out its answer:
    wait  ask again at the time the database gives (still being edited, or quiet hours)
    stop  nothing to send for this draft
    send  send once, and record the result on the queued message
  A reminder is never sent twice: after a claim, QStash always gets a 200, even when sending
  failed (the failure goes to Sentry and onto the message). Before the claim, an error is a 500
  and QStash asks again, which is safe: a claim can be repeated.

  The wiring (Supabase, QStash, the SMS provider, Sentry) is in app/api/cart/remind/route.ts.
*/
import * as z from "zod/mini";

export const ClaimRow = z.object({
  action: z.enum(["send", "wait", "stop"]),
  not_before: z.nullable(z.string()),
  reason: z.nullable(z.string()),
  message_id: z.nullable(z.string()),
  phone: z.nullable(z.string()),
  customer_name: z.nullable(z.string()),
  channel: z.nullable(z.enum(["sms", "whatsapp"])),
});
export type ClaimRow = z.infer<typeof ClaimRow>;
export type Channel = "sms" | "whatsapp";
export type SendResult = { status: "sent"; providerId?: string } | { status: "failed"; error: string };

export type RemindDeps = {
  claim(draftId: string): Promise<ClaimRow>;
  reschedule(draftId: string, at: Date): Promise<void>;
  /** sends and returns the provider's message id; throws when it can't */
  send(channel: Channel, to: string, text: string): Promise<string | undefined>;
  record(messageId: string, result: SendResult): Promise<void>;
  report: { exception(error: unknown, text: string): void };
  siteUrl: string;
};

const Body = z.object({ draftId: z.uuid() });

/** The reminder. An advertisement under the spam law: labelled "פרסומת", with a free way out */
export function reminderText(name: string | null, siteUrl: string): string {
  const hello = name?.trim() ? `שלום ${name.trim()}` : "שלום";
  return `פרסומת: ${hello}, העוגה שהתחלתם לתכנן ב-LaliBakery מחכה לכם: ${new URL("/custom-cake", siteUrl)}\nלהסרה השיבו "הסר"`;
}

const describe = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300);

export async function handleCartReminder(body: unknown, deps: RemindDeps): Promise<Response> {
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "draftId is missing" }, { status: 400 });
  const { draftId } = parsed.data;

  const claim = await deps.claim(draftId);
  if (claim.action === "stop") return Response.json({ action: "stop", reason: claim.reason });
  if (claim.action === "wait") {
    if (!claim.not_before) throw new Error("claim_cart_reminder: wait without a time");
    const at = new Date(claim.not_before);
    await deps.reschedule(draftId, at);
    return Response.json({ action: "wait", at: at.toISOString() });
  }

  if (!claim.message_id || !claim.phone || !claim.channel) {
    deps.report.exception(new Error("claim_cart_reminder: send without a message, phone or channel"), "cart reminder");
    return Response.json({ action: "send", status: "failed" });
  }
  let result: SendResult;
  try {
    result = { status: "sent", providerId: await deps.send(claim.channel, claim.phone, reminderText(claim.customer_name, deps.siteUrl)) };
  } catch (error) {
    deps.report.exception(error, "cart reminder: the message could not be sent");
    result = { status: "failed", error: describe(error) };
  }
  try {
    await deps.record(claim.message_id, result);
  } catch (error) {
    deps.report.exception(error, "cart reminder: the result could not be recorded");
  }
  return Response.json({ action: "send", status: result.status });
}
