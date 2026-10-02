// The site's languages and the Hebrew fallback.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeLocales, alternatesFor, dir, isLocale, localePath, pick, pickBlocks, splitLocale } from "./config";
import { agorotText } from "../price";

describe("addresses", () => {
  it("Hebrew has no prefix, the others do", () => {
    assert.equal(localePath("he", "/products"), "/products");
    assert.equal(localePath("he", "/"), "/");
    assert.equal(localePath("en", "/"), "/en");
    assert.equal(localePath("en", "/products/x"), "/en/products/x");
    assert.equal(localePath("ru", "/?a=1"), "/ru?a=1");
    assert.equal(localePath("en", "products"), "/en/products");
  });

  it("reads the language back from an address", () => {
    assert.deepEqual(splitLocale("/en/products/x"), { locale: "en", path: "/products/x" });
    assert.deepEqual(splitLocale("/ru"), { locale: "ru", path: "/" });
    assert.deepEqual(splitLocale("/products"), { locale: "he", path: "/products" });
    assert.deepEqual(splitLocale("/"), { locale: "he", path: "/" });
    assert.deepEqual(splitLocale("/english"), { locale: "he", path: "/english" });
  });

  it("lists the page in each language that's on", () => {
    assert.deepEqual(alternatesFor("en", "/products", ["he", "en"]), {
      canonical: "/en/products",
      languages: { he: "/products", en: "/en/products", "x-default": "/products" },
    });
  });
});

describe("agorotText", () => {
  it("shows agorot only when there are some", () => {
    assert.equal(agorotText(12000), "120 ₪");
    assert.equal(agorotText(4990), "49.90 ₪");
    assert.equal(agorotText(123450), "1,234.50 ₪");
  });
});

describe("activeLocales", () => {
  it("is Hebrew alone until other languages are switched on", () => {
    assert.deepEqual(activeLocales(undefined), ["he"]);
    assert.deepEqual(activeLocales(""), ["he"]);
    assert.deepEqual(activeLocales(" en , ru "), ["he", "en", "ru"]);
    assert.deepEqual(activeLocales("ru,fr,he"), ["he", "ru"]);
  });
});

describe("pick", () => {
  it("falls back to Hebrew, field by field", () => {
    assert.equal(pick({ he: "עוגה", en: "Cake" }, "en"), "Cake");
    assert.equal(pick({ he: "עוגה", en: "  " }, "en"), "עוגה");
    assert.equal(pick({ he: "עוגה" }, "ru"), "עוגה");
    assert.equal(pick(undefined, "he"), "");
    assert.deepEqual(pickBlocks({ he: [1], ru: [] }, "ru"), [1]);
    assert.deepEqual(pickBlocks({ he: [1], en: [2] }, "en"), [2]);
  });

  it("knows each language's direction", () => {
    assert.equal(dir("he"), "rtl");
    assert.equal(dir("en"), "ltr");
    assert.equal(isLocale("ru"), true);
    assert.equal(isLocale("fr"), false);
  });
});
