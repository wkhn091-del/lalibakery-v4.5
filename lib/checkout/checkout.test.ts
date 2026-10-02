// The checkout's pure rules: phone numbers, the ordering calendar, the guest order link.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as z from "zod/mini";
import { israeliPhone, localPhone } from "../phone";
import { CheckoutInput, fieldsOf } from "./input";
import { orderToken, verifyOrderToken } from "../orders/token";
import { addDays, type CalendarSettings, checkDate, earliestDate, israelDate, openDays, statusOf, weekday } from "./calendar";

describe("israeliPhone", () => {
  it("reads the ways people type a mobile number", () => {
    for (const raw of ["050-123-4567", "0501234567", "+972 50 123 4567", "972501234567", "00972501234567", "(050) 123 4567", "+972-050-1234567"]) {
      assert.equal(israeliPhone(raw), "+972501234567", raw);
    }
  });
  it("reads landlines and 07x numbers", () => {
    assert.equal(israeliPhone("09-8612345"), "+97298612345");
    assert.equal(israeliPhone("077-1234567"), "+972771234567");
  });
  it("refuses what isn't an Israeli number", () => {
    for (const raw of ["", "12345", "0501234", "05012345678", "+14155550100", "abc0501234567", "1".repeat(40)]) {
      assert.equal(israeliPhone(raw), null, raw);
    }
  });
  it("shows a stored number the local way", () => {
    assert.equal(localPhone("+972501234567"), "050-123-4567");
    assert.equal(localPhone("+97298612345"), "09-861-2345");
  });
});

// Sunday to Thursday 5 cakes, Friday 3, Saturday closed
const S: CalendarSettings = {
  capacityByWeekday: [5, 5, 5, 5, 5, 3, 0],
  leadBusinessDays: 3,
  maxAdvanceDays: 30,
  blockedDates: [{ from: "2026-10-14", to: "2026-10-15" }],
  deliveryWindows: [
    { id: "morning", days: [0, 1, 2, 3, 4, 5], from: "09:00", to: "12:00" },
    { id: "evening", days: [0, 1, 2, 3, 4], from: "17:00", to: "20:00" },
  ],
};
const SUNDAY = "2026-10-04";

describe("calendar", () => {
  it("knows the weekday and adds days across months", () => {
    assert.equal(weekday(SUNDAY), 0);
    assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  });

  it("gives Israel's date, not the server's", () => {
    // 22:30 UTC on the 3rd is already the 4th in Israel (UTC+3 in October)
    assert.equal(israelDate(new Date("2026-10-03T22:30:00Z")), "2026-10-04");
  });

  it("counts working days for the lead time, skipping closed days", () => {
    // Sunday: Sun, Mon, Tue are counted, Wednesday is the first day
    assert.equal(earliestDate(S, SUNDAY), "2026-10-07");
    // Thursday: Thu, Fri, (Sat closed), Sun are counted, Monday is the first day
    assert.equal(earliestDate(S, "2026-10-08"), "2026-10-12");
    // lead 0: today itself
    assert.equal(earliestDate({ ...S, leadBusinessDays: 0 }, SUNDAY), SUNDAY);
    // a kitchen that never works has no first day
    assert.equal(earliestDate({ ...S, capacityByWeekday: [0, 0, 0, 0, 0, 0, 0] }, SUNDAY), null);
  });

  it("skips blocked dates when counting", () => {
    // Monday the 12th: Mon, Tue (13th) counted, 14–15 blocked, Fri 16th counted, Sunday the 18th first
    assert.equal(earliestDate(S, "2026-10-12"), "2026-10-18");
  });

  it("says free, few or full, never the numbers", () => {
    assert.equal(statusOf(5, 0), "free");
    assert.equal(statusOf(5, 3), "free");
    assert.equal(statusOf(5, 4), "few");
    assert.equal(statusOf(5, 5), "full");
    assert.equal(statusOf(5, 9), "full");
    assert.equal(statusOf(12, 9), "few");
  });

  it("lists the open days with their windows", () => {
    const days = openDays(S, SUNDAY, new Map([["2026-10-07", 5], ["2026-10-08", 4]]));
    assert.deepEqual(days[0], { date: "2026-10-07", status: "full", windows: ["morning", "evening"] });
    assert.deepEqual(days[1], { date: "2026-10-08", status: "few", windows: ["morning", "evening"] });
    assert.deepEqual(days[2], { date: "2026-10-09", status: "free", windows: ["morning"] });
    assert.ok(!days.some((d) => d.date === "2026-10-10"), "Saturday is closed");
    assert.ok(!days.some((d) => d.date === "2026-10-14" || d.date === "2026-10-15"), "blocked dates");
    assert.ok(days.every((d) => d.date <= addDays(SUNDAY, 30)));
  });

  it("checks a chosen day and window", () => {
    assert.deepEqual(checkDate(S, SUNDAY, "2026-10-06", null), { ok: false, problem: "date" });
    assert.deepEqual(checkDate(S, SUNDAY, "2026-11-04", null), { ok: false, problem: "date" });
    assert.deepEqual(checkDate(S, SUNDAY, "2026-10-10", null), { ok: false, problem: "closed" });
    assert.deepEqual(checkDate(S, SUNDAY, "2026-10-14", null), { ok: false, problem: "closed" });
    assert.deepEqual(checkDate(S, SUNDAY, "2026-10-09", { windowId: "evening" }), { ok: false, problem: "window" });
    const friday = checkDate(S, SUNDAY, "2026-10-09", { windowId: "morning" });
    assert.ok(friday.ok && friday.capacity === 3 && friday.window?.id === "morning");
    const pickup = checkDate(S, SUNDAY, "2026-10-09", null);
    assert.ok(pickup.ok && pickup.window === null);
    // no windows set: a delivery needs none
    assert.ok(checkDate({ ...S, deliveryWindows: [] }, SUNDAY, "2026-10-09", { windowId: null }).ok);
  });
});

describe("checkout input", () => {
  const VALID = {
    lines: [{ productId: "p1", variantId: "v1", qty: 2 }],
    name: "  אבי   כהן ",
    phone: "050-123-4567",
    fulfilment: { type: "delivery", city: "נתניה", address: "הרצל 10", windowId: "morning", recipient: { name: "דנה לוי", phone: "09-8612345" } },
    date: "2026-10-09",
    payment: "online",
    terms: true,
  };

  it("accepts a full order and cleans it", () => {
    const r = z.safeParse(CheckoutInput, VALID);
    assert.ok(r.success);
    assert.equal(r.data.phone, "+972501234567");
    assert.equal(r.data.name, "אבי   כהן");
    assert.ok(r.data.fulfilment.type === "delivery" && r.data.fulfilment.recipient?.phone === "+97298612345");
  });

  it("strips invisible and direction characters from text", () => {
    const r = z.safeParse(CheckoutInput, { ...VALID, name: "אבי\u202E כהן\u200B" });
    assert.ok(r.success);
    assert.equal(r.data.name, "אבי כהן");
  });

  it("names the fields to fix, never echoing values", () => {
    const r = z.safeParse(CheckoutInput, { ...VALID, name: "אבי", phone: "09-8612345", fulfilment: { ...VALID.fulfilment, address: "" }, terms: false });
    assert.ok(!r.success);
    assert.deepEqual(fieldsOf(r.error).sort(), ["address", "name", "phone", "terms"]);
  });

  it("refuses prices, unknown payment methods and oversized carts", () => {
    assert.ok(!z.safeParse(CheckoutInput, { ...VALID, payment: "cash" }).success);
    assert.ok(!z.safeParse(CheckoutInput, { ...VALID, lines: [{ productId: "p1", variantId: "v1", qty: 21 }] }).success);
    assert.ok(!z.safeParse(CheckoutInput, { ...VALID, lines: Array.from({ length: 31 }, (_, i) => ({ productId: `p${i}`, variantId: "v", qty: 1 })) }).success);
    const r = z.safeParse(CheckoutInput, { ...VALID, totalAgorot: 1, lines: [{ productId: "p1", variantId: "v1", qty: 1, priceAgorot: 1 }] });
    assert.ok(r.success && !("totalAgorot" in r.data) && !("priceAgorot" in r.data.lines[0]));
  });
});

describe("order link", () => {
  const SECRET = "s".repeat(40);
  const CODE = "LB-7KQ2M9XA";
  const NOW = Date.parse("2026-10-04T10:00:00Z");

  it("opens with its own signature, for 72 hours", () => {
    const t = orderToken(CODE, SECRET, NOW);
    assert.equal(verifyOrderToken(CODE, t, SECRET, NOW), true);
    assert.equal(verifyOrderToken(CODE, t, SECRET, NOW + 71 * 3600_000), true);
    assert.equal(verifyOrderToken(CODE, t, SECRET, NOW + 72 * 3600_000), false);
  });

  it("doesn't open another order, with another secret, or when edited", () => {
    const t = orderToken(CODE, SECRET, NOW);
    assert.equal(verifyOrderToken("LB-7KQ2M9XB", t, SECRET, NOW), false);
    assert.equal(verifyOrderToken(CODE, t, "x".repeat(40), NOW), false);
    const [exp, sig] = t.split(".");
    assert.equal(verifyOrderToken(CODE, `${Number(exp) + 3600}.${sig}`, SECRET, NOW), false);
    const flipped = `${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    assert.equal(verifyOrderToken(CODE, `${exp}.${flipped}`, SECRET, NOW), false);
    for (const bad of [undefined, null, "", "abc", `${exp}.`, `${exp}.${sig}x`]) assert.equal(verifyOrderToken(CODE, bad, SECRET, NOW), false);
  });

  it("refuses a malformed code", () => {
    assert.equal(verifyOrderToken("LB-7KQ2M9X0", orderToken("LB-7KQ2M9X0", SECRET, NOW), SECRET, NOW), false);
  });
});
