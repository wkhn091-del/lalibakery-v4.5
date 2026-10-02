/*
  What happens after an order is placed or paid, run after the response (next/server `after`), so
  the customer never waits for it and a failure here never fails the order:
    a request from the cake builder     → the owner's email, the customer's email, a log row
    placed, paid otherwise than online  → the owner's email, the customer's email, a log row
    placed, to be paid online           → a log row only (the emails wait for the payment)
    paid online                         → the owner's email, the customer's email, a log row
    a payment that needs the owner      → an alert to the owner, a log row
  Every failure goes to Sentry, never to the customer.
*/
import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serverEnv, siteUrl } from "@/lib/env/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { orderLink } from "@/lib/orders/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSettings } from "@/sanity/content";
import { sendEmail } from "./resend";
import { logOrder } from "./sheets";
import { customerEmail, type NotifyOrder, ownerEmail, paymentAlert, requestCustomerEmail, requestOwnerEmail } from "./text";

const COLUMNS =
  "id, number, public_code, kind, status, needed_date, fulfilment, delivery_city, delivery_address, delivery_notes, recipient_name, recipient_phone, window_from, window_to, subtotal_agorot, discount_agorot, discount_source, shipping_agorot, total_agorot, payment_method, payment_status, contact_name, contact_email, category, details, estimated_price_agorot, customers(phone), order_items(line_no, title, variant_label, kind, quantity, unit_price_agorot)";

async function load(orderId: string): Promise<NotifyOrder | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("orders").select(COLUMNS).eq("id", orderId).maybeSingle();
  if (error) throw new Error(`notify: order read failed: ${error.message}`);
  if (!data) return null;
  const o = data as unknown as NotifyOrder;
  o.order_items.sort((a, b) => a.line_no - b.line_no);
  return o;
}

const adminUrl = (o: { id: string }) => `${siteUrl()}/admin/orders/${o.id}`;

async function attempt(what: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "notify", what } });
    console.error(`[notify] ${what}:`, error instanceof Error ? error.message : error);
  }
}

async function emails(o: NotifyOrder, event: string) {
  const env = serverEnv();
  const { business } = await getSettings(false);
  if (env.ORDERS_EMAIL_TO) {
    const mail = ownerEmail(o, adminUrl(o));
    await attempt("owner email", () => sendEmail({ to: env.ORDERS_EMAIL_TO!, ...mail, replyTo: o.contact_email ?? undefined, key: `owner/${event}/${o.id}` }));
  }
  if (o.contact_email) {
    const link = orderLink(DEFAULT_LOCALE, o.public_code);
    const mail = customerEmail(o, business.name, link ? `${siteUrl()}${link}` : null);
    await attempt("customer email", () => sendEmail({ to: o.contact_email!, ...mail, replyTo: env.ORDERS_EMAIL_TO, key: `customer/${event}/${o.id}` }));
  }
}

const log = (o: NotifyOrder, status: string) =>
  attempt("sheet", () => logOrder({ code: o.public_code, day: o.needed_date, city: o.fulfilment === "delivery" ? o.delivery_city : o.fulfilment === "pickup" ? "איסוף" : "לתיאום", totalAgorot: o.total_agorot, status }));

export async function notifyOrderPlaced(orderId: string): Promise<void> {
  await attempt("order placed", async () => {
    const o = await load(orderId);
    if (!o) return;
    await log(o, o.status);
    if (o.payment_method !== "online") await emails(o, "placed");
  });
}

export async function notifyRequestPlaced(orderId: string): Promise<void> {
  await attempt("request placed", async () => {
    const o = await load(orderId);
    if (!o) return;
    await log(o, "requested");
    const env = serverEnv();
    if (env.ORDERS_EMAIL_TO) {
      const mail = requestOwnerEmail(o, adminUrl(o));
      await attempt("owner email", () => sendEmail({ to: env.ORDERS_EMAIL_TO!, ...mail, replyTo: o.contact_email ?? undefined, key: `owner/request/${o.id}` }));
    }
    if (o.contact_email) {
      const { business } = await getSettings(false);
      const mail = requestCustomerEmail(o, business.name);
      await attempt("customer email", () => sendEmail({ to: o.contact_email!, ...mail, replyTo: env.ORDERS_EMAIL_TO, key: `customer/request/${o.id}` }));
    }
  });
}

export async function notifyPayment(orderId: string, outcome: string): Promise<void> {
  await attempt("payment", async () => {
    const o = await load(orderId);
    if (!o) return;
    if (outcome === "failed") return;
    await log(o, outcome === "paid" ? "paid" : `payment:${outcome}`);
    if (outcome === "paid" || outcome === "paid_late") await emails(o, "paid");
    const alert = paymentAlert(o.public_code, outcome, adminUrl(o));
    const to = serverEnv().ORDERS_EMAIL_TO;
    if (alert && to) await attempt("payment alert", () => sendEmail({ to, ...alert, key: `alert/${outcome}/${o.id}` }));
  });
}
