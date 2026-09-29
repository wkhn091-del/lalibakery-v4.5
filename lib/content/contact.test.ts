// The call, WhatsApp, mail and Waze links made from the business details (contact.ts).   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vercelStegaCombine } from "@vercel/stega";
import { SETTINGS } from "@/content";
import { fill } from "@/lib/text";
import { international, ISRAELI, linksOf } from "./contact";

const marked = (text: string) => vercelStegaCombine(text, { origin: "sanity.io", href: "/intent/edit/id=siteSettings" });

describe("contact links", () => {
  it("turns the phone, however it's typed, into an international number", () => {
    for (const typed of ["050-873-9090", "0508739090", "+972 50 873 9090", "+972-050-873-9090", "00972-50-873-9090", "(050) 873 9090"])
      assert.equal(international(typed), "972508739090", typed);
    assert.equal(international("03-555-1234"), "97235551234");
    assert.equal(international(""), "");
  });

  it("knows a number the links can dial from one they can't", () => {
    for (const ok of ["050-873-9090", "+972-050-873-9090", "03-555-1234"]) assert.ok(ISRAELI.test(international(ok)), ok);
    for (const bad of ["12345678", "050-873", "+1 212 555 0100", "972-0-123"]) assert.ok(!ISRAELI.test(international(bad)), bad);
  });

  it("makes the same links as the site had before the CMS", () => {
    const links = linksOf(SETTINGS.business);
    assert.equal(links.tel, "tel:+972508739090");
    assert.equal(links.whatsapp, "https://wa.me/972508739090");
    assert.equal(links.mail, "mailto:hello@lalibakery.co.il");
    assert.equal(links.waze, "");
  });

  it("uses a separate WhatsApp number and an address when there are any", () => {
    const links = linksOf({ ...SETTINGS.business, whatsapp: "052-000-1111", address: "הרצל 1, חיפה" });
    assert.equal(links.whatsapp, "https://wa.me/972520001111");
    assert.equal(links.waze, `https://waze.com/ul?q=${encodeURIComponent("הרצל 1, חיפה")}&navigate=yes`);
  });

  it("makes clean links from the preview's marked texts", () => {
    const links = linksOf({ ...SETTINGS.business, phone: marked("050-873-9090"), email: marked("a@b.co"), address: marked("הרצל 1") });
    assert.equal(links.tel, "tel:+972508739090");
    assert.equal(links.mail, "mailto:a@b.co");
    assert.equal(links.waze, `https://waze.com/ul?q=${encodeURIComponent("הרצל 1")}&navigate=yes`);
  });
});

describe("fill", () => {
  it("fills the blanks it knows and leaves the rest", () => {
    assert.equal(fill("שלב {n} מתוך {total}", { n: 2, total: 5 }), "שלב 2 מתוך 5");
    assert.equal(fill("החל מ-{price} {oops}", { price: "₪300" }), "החל מ-₪300 {oops}");
  });

  it("doesn't fill a blank inside a filled-in value", () => {
    assert.equal(fill("{a} {b}", { a: "{b}", b: "x" }), "{b} x");
  });
});
