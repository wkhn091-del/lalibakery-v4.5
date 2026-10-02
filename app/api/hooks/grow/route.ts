/*
  Grow's server update (the notifyUrl of each payment page). Public and unsigned by Grow, so:
    1. the address must carry the order id with our HMAC of it (lib/grow/update.ts): anything
       else is a 404 before any work is done
    2. the update only names a transaction; Grow is asked about it server to server
       (getTransactionInfo), and only that answer counts: its status and its sum
    3. record_payment in Supabase records it at most once per transaction (a redelivered update
       changes nothing), checks the sum against the order's total, and marks the order paid
    4. approveTransaction tells Grow we have it (Grow resends the update until it hears that)
  A 5xx when Grow or the database can't be reached, so Grow tries again; 200 otherwise.
*/
import * as Sentry from "@sentry/nextjs";
import { after, type NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { fromSum, growCall } from "@/lib/grow/client";
import { checkNotifyRef, fieldsOfJson, flattenUpdate, methodOf, transactionInfo, transactionOf } from "@/lib/grow/update";
import { notifyPayment } from "@/lib/notify/order";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_BODY = 32 * 1024;
const reply = (status: number) => new NextResponse(status === 200 ? "ok" : null, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const secret = serverEnv().ORDER_LINK_SECRET;
  const orderId = req.nextUrl.searchParams.get("o");
  if (!secret || !checkNotifyRef(orderId, req.nextUrl.searchParams.get("s"), secret)) return reply(404);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply(413);

  let fields: Record<string, string>;
  try {
    const type = req.headers.get("content-type") ?? "";
    fields = type.includes("application/json") ? fieldsOfJson(await req.json()) : flattenUpdate((await req.formData()).entries());
  } catch {
    return reply(400);
  }
  const tx = transactionOf(fields);
  if (!tx) return reply(400);

  let info: Record<string, string> | null;
  try {
    info = transactionInfo((await growCall("getTransactionInfo", tx)).data);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "grow-notify" } });
    return reply(503);
  }
  if (!info) return reply(503);
  if (info.cField1 && info.cField1 !== orderId) {
    Sentry.captureMessage("Grow update: the transaction belongs to another order", { level: "error", tags: { area: "grow-notify" } });
    return reply(200);
  }

  const succeeded = info.statusCode === "2";
  const db = supabaseAdmin();
  if (!db) return reply(503);
  const { data, error } = await db.rpc("record_payment", {
    p_provider: "grow",
    p_event_id: `tx:${tx.transactionId}`,
    p_order_id: orderId,
    p_succeeded: succeeded,
    p_amount_agorot: fromSum(info.sum),
    p_transaction_id: tx.transactionId,
    p_method: methodOf(info.transactionTypeId ?? fields.transactionTypeId),
    p_payload: { statusCode: info.statusCode ?? null, transactionTypeId: info.transactionTypeId ?? null, paymentType: info.paymentType ?? null },
  });
  if (error) {
    Sentry.captureException(new Error(`record_payment failed: ${error.message}`), { tags: { area: "grow-notify" } });
    return reply(503);
  }
  const outcome = String((Array.isArray(data) ? data[0] : data)?.outcome ?? "");

  if (succeeded) {
    try {
      await growCall("approveTransaction", { ...fields, ...tx });
    } catch (e) {
      // the payment stands either way; Grow resends the update and we approve then
      Sentry.captureException(e, { tags: { area: "grow-approve" } });
    }
  }
  if (outcome && outcome !== "duplicate") after(() => notifyPayment(orderId, outcome));
  return reply(200);
}
