// The order emails' words: everything the owner needs, nothing broken by what a customer typed.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerEmail, type NotifyOrder, ownerEmail, paymentAlert, requestCustomerEmail, requestOwnerEmail } from "./text";

const ORDER: NotifyOrder = {
  id: "3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b",
  number: 1042,
  public_code: "LB-7KQ2M9XA",
  kind: "catalog",
  status: "confirmed",
  needed_date: "2026-10-09",
  fulfilment: "delivery",
  delivery_city: "נתניה",
  delivery_address: "הרצל 10 דירה 4",
  delivery_notes: "קומה 2 <script>",
  recipient_name: "דנה לוי",
  recipient_phone: "+972521234567",
  window_from: "09:00:00",
  window_to: "12:00:00",
  subtotal_agorot: 24990,
  discount_agorot: 2499,
  discount_source: "launch_promo",
  shipping_agorot: 0,
  total_agorot: 22491,
  payment_method: "whatsapp",
  payment_status: "unpaid",
  contact_name: "אבי כהן",
  contact_email: "avi@example.com",
  category: null,
  details: null,
  estimated_price_agorot: null,
  customers: { phone: "+972501234567" },
  order_items: [{ line_no: 1, title: "עוגת שוקולד", variant_label: "22 ס״מ", kind: "single", quantity: 1, unit_price_agorot: 24990 }],
};

describe("owner email", () => {
  const { subject, text } = ownerEmail(ORDER, "https://x/admin/orders/1");
  it("has the code, day and total in the subject", () => {
    assert.match(subject, /LB-7KQ2M9XA/);
    assert.match(subject, /09\/10\/2026/);
    assert.match(subject, /224\.91 ₪/);
  });
  it("has what's needed to deliver", () => {
    for (const part of ["אבי כהן", "050-123-4567", "הרצל 10 דירה 4, נתניה", "דנה לוי, 052-123-4567", "בין 09:00 ל-12:00", "1 × עוגת שוקולד (22 ס״מ): 249.90 ₪", "הנחה (מבצע השקה): -24.99 ₪", "משלוח: חינם", "תיאום בוואטסאפ, לא שולם", "https://x/admin/orders/1"]) {
      assert.ok(text.includes(part), part);
    }
  });
  it("keeps typed text as plain text", () => {
    assert.ok(text.includes("קומה 2 <script>"));
  });
  it("says when the address was already erased", () => {
    assert.match(ownerEmail({ ...ORDER, delivery_address: null }, "u").text, /\(נמחקה\)/);
  });
});

describe("customer email", () => {
  it("thanks, lists the order, and links to it", () => {
    const { subject, text } = customerEmail(ORDER, "Lalibakery", "https://x/order/LB-7KQ2M9XA?t=1");
    assert.match(subject, /Lalibakery: LB-7KQ2M9XA/);
    assert.match(text, /שלום אבי כהן/);
    assert.match(text, /ניצור איתך קשר לתיאום התשלום/);
    assert.match(text, /https:\/\/x\/order\/LB-7KQ2M9XA\?t=1/);
  });
  it("says paid when it's paid, and pickup for a pickup", () => {
    const { text } = customerEmail({ ...ORDER, payment_status: "paid", fulfilment: "pickup", delivery_city: null }, "L", null);
    assert.match(text, /התשלום התקבל/);
    assert.match(text, /איסוף עצמי ב-09\/10\/2026/);
    assert.ok(!text.includes("משלוח:"));
  });
});

describe("builder request emails", () => {
  const REQUEST: NotifyOrder = {
    ...ORDER,
    kind: "builder",
    status: "requested",
    needed_date: null,
    fulfilment: null,
    delivery_city: null,
    delivery_address: null,
    subtotal_agorot: null,
    discount_agorot: 0,
    discount_source: null,
    total_agorot: null,
    payment_method: null,
    category: "birthday",
    details: { summary: "שלום! אשמח להזמין עוגה\n\nסוג העוגה: עוגות יום הולדת\nתוספות: פרחים: פרחי סוכר, בצבע ורוד עתיק\nכיתוב על העוגה: <b>נועה</b>" },
    order_items: [],
  };
  it("gives the owner the contact and the whole cake, without the greeting", () => {
    const { subject, text } = requestOwnerEmail(REQUEST, "https://x/admin/orders/1");
    assert.match(subject, /LB-7KQ2M9XA: בלי תאריך/);
    for (const part of ["אבי כהן", "050-123-4567", "תוספות: פרחים: פרחי סוכר, בצבע ורוד עתיק", "<b>נועה</b>", "https://x/admin/orders/1"]) assert.ok(text.includes(part), part);
    assert.ok(!text.includes("אשמח להזמין"));
    assert.ok(!text.includes("נשמר ביומן"));
  });
  it("says the day is held when there is one", () => {
    assert.match(requestOwnerEmail({ ...REQUEST, needed_date: "2026-10-20" }, "u").text, /נשמר ביומן/);
  });
  it("tells the customer nothing is charged before the price is agreed", () => {
    const { subject, text } = requestCustomerEmail(REQUEST, "Lalibakery");
    assert.match(subject, /Lalibakery: LB-7KQ2M9XA/);
    assert.match(text, /שום דבר לא נגבה/);
    assert.ok(text.includes("סוג העוגה: עוגות יום הולדת"));
  });
  it("copes with a request saved without a summary", () => {
    assert.doesNotThrow(() => requestOwnerEmail({ ...REQUEST, details: { summary: 5 } }, "u"));
  });
});

describe("payment alerts", () => {
  it("speaks up only when the owner has to act", () => {
    assert.equal(paymentAlert("LB-1", "paid", "u"), null);
    assert.equal(paymentAlert("LB-1", "duplicate", "u"), null);
    assert.match(paymentAlert("LB-1", "amount_mismatch", "u")?.text ?? "", /לא תואם/);
    assert.match(paymentAlert("LB-1", "already_paid", "u")?.text ?? "", /להחזיר/);
  });
});
