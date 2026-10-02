// Grow's server update: our signed address, reading the fields, and Grow's own answer.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkNotifyRef, fieldsOfJson, flattenUpdate, methodOf, notifyRef, transactionInfo, transactionOf } from "./update";
import { fromSum, toSum } from "./client";

const SECRET = "k".repeat(40);
const ORDER = "3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b";

describe("notify address", () => {
  it("opens only with its own signature", () => {
    const { o, s } = notifyRef(ORDER, SECRET);
    assert.equal(checkNotifyRef(o, s, SECRET), true);
    assert.equal(checkNotifyRef(o, s, "x".repeat(40)), false);
    assert.equal(checkNotifyRef("3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6c", s, SECRET), false);
    assert.equal(checkNotifyRef(o, `${s.slice(0, -1)}${s.endsWith("A") ? "B" : "A"}`, SECRET), false);
  });
  it("refuses what's missing or malformed", () => {
    const { s } = notifyRef(ORDER, SECRET);
    for (const [o, sig] of [[null, s], [ORDER, null], ["not-a-uuid", s], [ORDER, "x".repeat(100)]] as const) assert.equal(checkNotifyRef(o, sig, SECRET), false);
  });
});

describe("reading an update", () => {
  it("reads form fields flat or under data[...]", () => {
    const f = flattenUpdate([["data[transactionId]", "1234567"], ["data[transactionToken]", "818bf8333e7a3f0c53ef8e7"], ["status", "1"]]);
    assert.deepEqual(transactionOf(f), { transactionId: "1234567", transactionToken: "818bf8333e7a3f0c53ef8e7" });
  });
  it("reads JSON with or without the data wrapper", () => {
    assert.ok(transactionOf(fieldsOfJson({ status: "1", data: { transactionId: "1", transactionToken: "abcdef1234" } })));
    assert.ok(transactionOf(fieldsOfJson({ transactionId: 99, transactionToken: "abcdef1234" })));
  });
  it("refuses identifiers that don't look like Grow's", () => {
    assert.equal(transactionOf({ transactionId: "12a", transactionToken: "abcdef1234" }), null);
    assert.equal(transactionOf({ transactionId: "12", transactionToken: "short" }), null);
    assert.equal(transactionOf({ transactionId: "12", transactionToken: "abc'; drop" }), null);
    assert.equal(transactionOf({}), null);
  });
  it("ignores nested values and caps long ones", () => {
    const f = flattenUpdate([["a", { x: 1 }], ["b", "y".repeat(900)]]);
    assert.equal(f.a, undefined);
    assert.equal(f.b.length, 500);
  });
});

describe("Grow's answer", () => {
  it("takes the first transaction of a list, with its custom fields", () => {
    const info = transactionInfo([{ statusCode: "2", sum: "149.90", customFields: { cField1: ORDER } }]);
    assert.equal(info?.statusCode, "2");
    assert.equal(info?.cField1, ORDER);
    assert.equal(fromSum(info?.sum), 14990);
  });
  it("is null when there's nothing", () => {
    assert.equal(transactionInfo(null), null);
    assert.equal(transactionInfo([]), null);
  });
  it("names the payment method", () => {
    assert.equal(methodOf("1"), "card");
    assert.equal(methodOf("6"), "bit");
    assert.equal(methodOf("13"), "apple_pay");
    assert.equal(methodOf("99"), "other");
  });
});

describe("sums", () => {
  it("turns agorot into Grow's sum and back without rounding errors", () => {
    assert.equal(toSum(14990), "149.90");
    assert.equal(toSum(5), "0.05");
    assert.equal(fromSum("149.9"), 14990);
    assert.equal(fromSum(13), 1300);
    assert.equal(fromSum("0.07"), 7);
    assert.equal(fromSum("abc"), null);
    assert.equal(fromSum(undefined), null);
  });
});
