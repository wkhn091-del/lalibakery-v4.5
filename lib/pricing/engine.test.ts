// The pricing engine: the same sum in the browser and on the server.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ShopProduct, StoreSettings } from "@/lib/shop/normalize";
import { bundleAnchorAgorot, type CouponTerms, mergeLines, priceCart, promoRunning, zoneFor } from "./engine";

function product(over: Partial<ShopProduct> & Pick<ShopProduct, "id">): ShopProduct {
  return {
    slug: over.id,
    kind: "single",
    title: { he: `מוצר ${over.id}` },
    summary: {},
    description: {},
    seoDescription: {},
    categoryId: "cat",
    images: [],
    variants: [{ id: "v1", label: { he: "רגיל" }, priceAgorot: 10000, available: true }],
    bundle: [],
    occasionIds: [],
    styleIds: [],
    kosher: "dairy",
    diet: { glutenFreeRecipe: false, noAddedSugar: false, nutFree: false },
    allergens: [],
    featured: false,
    ...over,
  };
}

const CAKE = product({
  id: "cake",
  variants: [
    { id: "d20", label: { he: "20 ס״מ" }, priceAgorot: 24990, available: true },
    { id: "d24", label: { he: "24 ס״מ" }, priceAgorot: 32000, available: false },
  ],
});
const CUPCAKES = product({ id: "cupcakes", variants: [{ id: "six", label: { he: "6" }, priceAgorot: 8990, available: true }] });
const BOX = product({
  id: "box",
  kind: "bundle",
  variants: [{ id: "box", label: { he: "מארז" }, priceAgorot: 29900, available: true }],
  bundle: [
    { productId: "cake", variantId: "d20", quantity: 1 },
    { productId: "cupcakes", variantId: "six", quantity: 1 },
  ],
});
const PRODUCTS = [CAKE, CUPCAKES, BOX];

const NETANYA = { id: "netanya", name: { he: "נתניה" }, feeAgorot: 2000, freeAboveAgorot: 10000, cities: ["נתניה"] };
const AROUND = { id: "around", name: { he: "סביבת נתניה" }, feeAgorot: 5000, cities: ["אבן יהודה", "כפר יונה"] };

const NOW = new Date("2026-10-10T10:00:00+03:00");
const settings = (over: Partial<StoreSettings> = {}): Pick<StoreSettings, "deliveryZones" | "launchPromo" | "pickupEnabled"> => ({
  deliveryZones: [NETANYA, AROUND],
  launchPromo: null,
  pickupEnabled: true,
  ...over,
});
const PROMO_10 = { label: { he: "השקה" }, type: "percent" as const, value: 10, startsAt: "2026-10-01T00:00:00+03:00", endsAt: "2026-11-01T00:00:00+03:00" };

describe("priceCart: the items", () => {
  it("prices each line from the catalog, never from the cart", () => {
    const q = priceCart({ lines: [{ productId: "cake", variantId: "d20", qty: 2 }], products: PRODUCTS, settings: settings(), now: NOW });
    assert.deepEqual(q.lines, [{ productId: "cake", variantId: "d20", kind: "single", qty: 2, unitAgorot: 24990, totalAgorot: 49980 }]);
    assert.equal(q.subtotalAgorot, 49980);
    assert.equal(q.totalAgorot, 49980);
  });

  it("drops a missing product or size, an unavailable size, and a quantity out of range", () => {
    const q = priceCart({
      lines: [
        { productId: "gone", variantId: "v1", qty: 1 },
        { productId: "cake", variantId: "nope", qty: 1 },
        { productId: "cake", variantId: "d24", qty: 1 },
        { productId: "cupcakes", variantId: "six", qty: 0 },
        { productId: "cupcakes", variantId: "six", qty: 2.5 },
      ],
      products: PRODUCTS,
      settings: settings(),
      now: NOW,
    });
    assert.equal(q.lines.length, 0);
    assert.deepEqual(
      q.dropped.map((d) => d.reason),
      ["missing", "missing", "unavailable", "quantity"],
    );
    assert.equal(q.totalAgorot, 0);
  });

  it("merges the same product and size, and refuses more than 20", () => {
    assert.deepEqual(mergeLines([{ productId: "a", variantId: "x", qty: 2 }, { productId: "a", variantId: "x", qty: 3 }]), [{ productId: "a", variantId: "x", qty: 5 }]);
    const q = priceCart({
      lines: [{ productId: "cupcakes", variantId: "six", qty: 15 }, { productId: "cupcakes", variantId: "six", qty: 6 }],
      products: PRODUCTS,
      settings: settings(),
      now: NOW,
    });
    assert.equal(q.dropped[0]?.reason, "quantity");
  });

  it("keeps at most 30 lines", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ productId: `p${i}`, variantId: "v", qty: 1 }));
    assert.equal(mergeLines(many).length, 30);
  });
});

describe("priceCart: promo and coupon", () => {
  it("applies the launch promo only while it runs", () => {
    assert.equal(promoRunning(PROMO_10, NOW), true);
    assert.equal(promoRunning(PROMO_10, new Date("2026-11-01T00:00:00+03:00")), false);
    assert.equal(promoRunning(PROMO_10, new Date("2026-09-30T23:59:59+03:00")), false);
    const q = priceCart({ lines: [{ productId: "cake", variantId: "d20", qty: 1 }], products: PRODUCTS, settings: settings({ launchPromo: PROMO_10 }), now: NOW });
    assert.deepEqual(q.discount, { source: "launch_promo", amountAgorot: 2499 });
    assert.equal(q.totalAgorot, 24990 - 2499);
  });

  it("never discounts a bundle: its price already is the deal", () => {
    const q = priceCart({ lines: [{ productId: "box", variantId: "box", qty: 1 }], products: PRODUCTS, settings: settings({ launchPromo: PROMO_10 }), now: NOW });
    assert.equal(q.discountableAgorot, 0);
    assert.equal(q.discount, null);
    assert.equal(q.totalAgorot, 29900);
  });

  it("takes the better of promo and coupon, never both", () => {
    const coupon: CouponTerms = { id: "c1", kind: "amount", value: 5000, minSubtotalAgorot: 0 };
    const q = priceCart({ lines: [{ productId: "cake", variantId: "d20", qty: 1 }], products: PRODUCTS, settings: settings({ launchPromo: PROMO_10 }), coupon, now: NOW });
    assert.equal(q.promoAgorot, 2499);
    assert.equal(q.couponAgorot, 5000);
    assert.deepEqual(q.discount, { source: "coupon", amountAgorot: 5000, couponId: "c1" });
    assert.equal(q.totalAgorot, 24990 - 5000);
  });

  it("on a tie keeps the promo, so the coupon stays unused", () => {
    const coupon: CouponTerms = { id: "c1", kind: "percent", value: 10, minSubtotalAgorot: 0 };
    const q = priceCart({ lines: [{ productId: "cake", variantId: "d20", qty: 1 }], products: PRODUCTS, settings: settings({ launchPromo: PROMO_10 }), coupon, now: NOW });
    assert.equal(q.discount?.source, "launch_promo");
  });

  it("says when a coupon's minimum isn't met", () => {
    const coupon: CouponTerms = { id: "c1", kind: "amount", value: 2000, minSubtotalAgorot: 30000 };
    const q = priceCart({ lines: [{ productId: "cake", variantId: "d20", qty: 1 }], products: PRODUCTS, settings: settings(), coupon, now: NOW });
    assert.equal(q.couponUnmet, true);
    assert.equal(q.discount, null);
  });

  it("an amount coupon never takes the discountable part below zero", () => {
    const coupon: CouponTerms = { id: "c1", kind: "amount", value: 100000, minSubtotalAgorot: 0 };
    const q = priceCart({ lines: [{ productId: "cupcakes", variantId: "six", qty: 1 }], products: PRODUCTS, settings: settings(), coupon, now: NOW });
    assert.equal(q.discount?.amountAgorot, 8990);
    assert.equal(q.totalAgorot, 0);
  });

  it("a percent coupon rounds down, as the database checks", () => {
    const coupon: CouponTerms = { id: "c1", kind: "percent", value: 15, minSubtotalAgorot: 0 };
    const q = priceCart({ lines: [{ productId: "cupcakes", variantId: "six", qty: 1 }], products: PRODUCTS, settings: settings(), coupon, now: NOW });
    assert.equal(q.discount?.amountAgorot, Math.floor((8990 * 15) / 100));
  });
});

describe("priceCart: delivery", () => {
  const one = [{ productId: "cupcakes", variantId: "six", qty: 1 }];

  it("charges the city's zone, and nothing for pickup", () => {
    const netanya = priceCart({ lines: one, products: PRODUCTS, settings: settings(), delivery: { fulfilment: "delivery", city: "נתניה" }, now: NOW });
    assert.equal(netanya.shippingAgorot, 2000);
    assert.equal(netanya.totalAgorot, 8990 + 2000);
    const pickup = priceCart({ lines: one, products: PRODUCTS, settings: settings(), delivery: { fulfilment: "pickup" }, now: NOW });
    assert.equal(pickup.shippingAgorot, 0);
    assert.equal(pickup.freeDelivery, null);
  });

  it("is free above the zone's threshold, counted after the discount", () => {
    const big = [{ productId: "cake", variantId: "d20", qty: 1 }];
    const q = priceCart({ lines: big, products: PRODUCTS, settings: settings(), delivery: { fulfilment: "delivery", city: "נתניה" }, now: NOW });
    assert.equal(q.shippingAgorot, 0);
    const coupon: CouponTerms = { id: "c1", kind: "amount", value: 8000, minSubtotalAgorot: 0 };
    const under = priceCart({
      lines: [{ productId: "cupcakes", variantId: "six", qty: 2 }],
      products: PRODUCTS,
      settings: settings(),
      coupon,
      delivery: { fulfilment: "delivery", city: "נתניה" },
      now: NOW,
    });
    assert.equal(under.subtotalAgorot - under.discount!.amountAgorot, 9980);
    assert.equal(under.shippingAgorot, 2000);
  });

  it("matches a city however it's typed", () => {
    assert.equal(zoneFor("  כפר   יונה ", [NETANYA, AROUND])?.id, "around");
  });

  it("says when a city is outside every zone", () => {
    const q = priceCart({ lines: one, products: PRODUCTS, settings: settings(), delivery: { fulfilment: "delivery", city: "אילת" }, now: NOW });
    assert.deepEqual(q.shipping, { status: "outside" });
    assert.equal(q.shippingAgorot, 0);
  });

  it("tells how much more for free delivery: the chosen zone, or the cheapest that has it", () => {
    const none = priceCart({ lines: one, products: PRODUCTS, settings: settings(), now: NOW });
    assert.deepEqual(none.freeDelivery, { zoneId: "netanya", remainingAgorot: 10000 - 8990 });
    const around = priceCart({ lines: one, products: PRODUCTS, settings: settings(), delivery: { fulfilment: "delivery", city: "אבן יהודה" }, now: NOW });
    assert.equal(around.freeDelivery, null);
  });
});

describe("bundleAnchorAgorot", () => {
  it("is the real sum of the items at today's prices", () => {
    assert.equal(bundleAnchorAgorot(BOX, PRODUCTS), 24990 + 8990);
  });

  it("is null when an item is gone, or when the sum isn't higher", () => {
    assert.equal(bundleAnchorAgorot({ ...BOX, bundle: [{ productId: "gone", variantId: "x", quantity: 1 }] }, PRODUCTS), null);
    assert.equal(bundleAnchorAgorot({ ...BOX, variants: [{ id: "box", priceAgorot: 40000, available: true }] }, PRODUCTS), null);
    assert.equal(bundleAnchorAgorot(CAKE, PRODUCTS), null);
  });
});
