/*
  The words of the order emails, in Hebrew (the owner's language, and the site's). Plain text,
  built from the order as the database holds it. Pure, so it's tested.
*/
import { agorotText } from "@/lib/price";
import { localPhone } from "@/lib/phone";

export type NotifyOrder = {
  id: string;
  number: number;
  public_code: string;
  kind: "builder" | "catalog";
  status: string;
  needed_date: string | null;
  fulfilment: "delivery" | "pickup" | null;
  delivery_city: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  window_from: string | null;
  window_to: string | null;
  subtotal_agorot: number | null;
  discount_agorot: number;
  discount_source: "coupon" | "launch_promo" | null;
  shipping_agorot: number | null;
  total_agorot: number | null;
  payment_method: "online" | "whatsapp" | "phone" | "in_person" | null;
  payment_status: string;
  contact_name: string | null;
  contact_email: string | null;
  /** a builder request: its category, the cake as the server rebuilt it, and the starting price */
  category: string | null;
  details: { summary?: unknown } | null;
  estimated_price_agorot: number | null;
  customers: { phone: string };
  order_items: { line_no: number; title: string; variant_label: string; kind: string; quantity: number; unit_price_agorot: number }[];
};

const PAYMENT: Record<string, string> = { online: "אונליין (Grow)", whatsapp: "תיאום בוואטסאפ", phone: "בטלפון", in_person: "באיסוף" };
const PAID: Record<string, string> = { unpaid: "לא שולם", pending: "ממתין לתשלום", paid: "שולם", refunded: "הוחזר" };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

function lines(o: NotifyOrder): string[] {
  return o.order_items.map((i) => `• ${i.quantity} × ${i.title}${i.kind === "single" && i.variant_label !== "—" ? ` (${i.variant_label})` : ""}: ${agorotText(i.unit_price_agorot * i.quantity)}`);
}

function sums(o: NotifyOrder): string[] {
  const out = [`סכום ביניים: ${agorotText(o.subtotal_agorot ?? 0)}`];
  if (o.discount_agorot > 0) out.push(`הנחה (${o.discount_source === "coupon" ? "קופון" : "מבצע השקה"}): -${agorotText(o.discount_agorot)}`);
  if (o.fulfilment === "delivery") out.push(`משלוח: ${o.shipping_agorot ? agorotText(o.shipping_agorot) : "חינם"}`);
  out.push(`סה״כ: ${agorotText(o.total_agorot ?? 0)}`);
  return out;
}

function when(o: NotifyOrder): string {
  const day = dmy(o.needed_date);
  const window = o.window_from && o.window_to ? `, בין ${hhmm(o.window_from)} ל-${hhmm(o.window_to)}` : "";
  return o.fulfilment === "pickup" ? `איסוף עצמי ב-${day}` : `משלוח ל${o.delivery_city ?? ""} ב-${day}${window}`;
}

/** To the owner: everything she needs to prepare and deliver */
export function ownerEmail(o: NotifyOrder, adminUrl: string): { subject: string; text: string } {
  const delivery =
    o.fulfilment === "delivery"
      ? [`כתובת: ${o.delivery_address ?? "(נמחקה)"}, ${o.delivery_city ?? ""}`, o.delivery_notes ? `הערות: ${o.delivery_notes}` : "", o.recipient_name ? `מקבל/ת: ${o.recipient_name}${o.recipient_phone ? `, ${localPhone(o.recipient_phone)}` : ""}` : ""]
      : [];
  const text = [
    `הזמנה חדשה ${o.public_code} (#${o.number})`,
    "",
    when(o),
    "",
    `שם: ${o.contact_name ?? ""}`,
    `טלפון: ${localPhone(o.customers.phone)}`,
    o.contact_email ? `אימייל: ${o.contact_email}` : "",
    ...delivery,
    "",
    ...lines(o),
    "",
    ...sums(o),
    `תשלום: ${PAYMENT[o.payment_method ?? ""] ?? "-"}, ${PAID[o.payment_status] ?? o.payment_status}`,
    "",
    `לפרטים ולניהול: ${adminUrl}`,
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
  return { subject: `הזמנה חדשה ${o.public_code}: ${dmy(o.needed_date)}, ${agorotText(o.total_agorot ?? 0)}`, text };
}

/** To the customer: what they ordered, when, and how to pay (if not paid) */
export function customerEmail(o: NotifyOrder, business: string, orderUrl: string | null): { subject: string; text: string } {
  const pay =
    o.payment_status === "paid"
      ? "התשלום התקבל, תודה."
      : o.payment_method === "online"
        ? "ההזמנה ממתינה לתשלום."
        : "ניצור איתך קשר לתיאום התשלום.";
  const text = [
    `שלום ${o.contact_name ?? ""},`,
    "",
    `תודה על ההזמנה! קוד ההזמנה: ${o.public_code}`,
    when(o),
    "",
    ...lines(o),
    "",
    ...sums(o),
    "",
    pay,
    orderUrl ? `לצפייה בהזמנה (הקישור תקף ל-72 שעות): ${orderUrl}` : "",
    "",
    "שאלה? פשוט עונים למייל הזה או כותבים לנו בוואטסאפ.",
    business,
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
  return { subject: `ההזמנה שלך ב${business}: ${o.public_code}`, text };
}

/** a builder request's summary lines, without the WhatsApp greeting the summary starts with */
function cakeLines(o: NotifyOrder): string[] {
  const summary = typeof o.details?.summary === "string" ? o.details.summary : "";
  return summary
    .split("\n")
    .slice(1)
    .filter((l) => l.trim() !== "");
}

/** To the owner: a cake from the builder, to price and confirm with the customer */
export function requestOwnerEmail(o: NotifyOrder, adminUrl: string): { subject: string; text: string } {
  const day = o.needed_date ? dmy(o.needed_date) : "בלי תאריך";
  const text = [
    `בקשה חדשה מהבונה ${o.public_code} (#${o.number})`,
    "",
    `שם: ${o.contact_name ?? ""}`,
    `טלפון: ${localPhone(o.customers.phone)}`,
    o.contact_email ? `אימייל: ${o.contact_email}` : "",
    "",
    ...cakeLines(o),
    "",
    o.needed_date ? "היום נשמר ביומן עד שהבקשה תאושר או תבוטל." : "",
    "המחיר עוד לא נקבע: אחרי שסוגרים אותו עם הלקוח, מעדכנים אותו בניהול ושולחים קישור לתשלום.",
    "",
    `לפרטים ולניהול: ${adminUrl}`,
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
  return { subject: `בקשה חדשה מהבונה ${o.public_code}: ${day}`, text };
}

/** To the customer: what they asked for, and what happens next */
export function requestCustomerEmail(o: NotifyOrder, business: string): { subject: string; text: string } {
  const text = [
    `שלום ${o.contact_name ?? ""},`,
    "",
    `קיבלנו את הבקשה שלך. מספר הבקשה: ${o.public_code}`,
    "",
    ...cakeLines(o),
    "",
    "נחזור אליך עם מחיר ואישור עיצוב בשעות הפעילות. שום דבר לא נגבה עד שהמחיר מאושר.",
    "",
    "שאלה, או תמונה לעוגה? פשוט עונים למייל הזה או כותבים לנו בוואטסאפ.",
    business,
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
  return { subject: `הבקשה שלך ב${business}: ${o.public_code}`, text };
}

const ALERTS: Record<string, string> = {
  paid_late: "שולמה אחרי שהזמן לתשלום עבר. ההזמנה אושרה, אבל כדאי לבדוק שהיום לא עמוס מדי.",
  amount_mismatch: "התקבל תשלום בסכום שלא תואם להזמנה. ההזמנה לא סומנה כשולמה: צריך לבדוק ב-Grow.",
  already_paid: "התקבל תשלום נוסף על הזמנה שכבר שולמה. צריך להחזיר אותו ב-Grow.",
  after_cancel: "התקבל תשלום על הזמנה שבוטלה. צריך להחזיר אותו ב-Grow, או לשחזר את ההזמנה.",
  unknown_order: "התקבל תשלום שלא נמצאה לו הזמנה. צריך לבדוק ב-Grow.",
};

/** To the owner, when a payment needs her attention */
export function paymentAlert(code: string, outcome: string, adminUrl: string): { subject: string; text: string } | null {
  const what = ALERTS[outcome];
  if (!what) return null;
  return { subject: `לתשומת לבך: תשלום להזמנה ${code}`, text: `הזמנה ${code}: ${what}\n\n${adminUrl}` };
}
