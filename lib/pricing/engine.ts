/*
  The one pricing engine. A pure function, so the same code runs in two places:

  - in the browser, for the cart's instant feedback: the launch promo, the bundle's real anchor and
    "₪23 more for free delivery". That result is an estimate for display and is never sent back.
  - on the server, for every quote and every order (lib/pricing/server.ts): from the published
    catalog in Sanity and the coupon in Supabase. Of what the browser sends, only product ids, size
    ids, quantities and the coupon's text are read.

  The order of the sum:
    1. each size's price (agorot), times its quantity
    2. the better of the launch promo and the coupon: they never add up. Neither applies to a
       bundle, whose own price already is its deal.
    3. delivery, by the city's zone, free above the zone's threshold (after the discount)
    4. the total

  Lines that can't be priced (a product or size that's gone or unavailable, a quantity out of range)
  are dropped, and the result says which, so the cart can tell the customer.
*/
import type { LaunchPromo, ShopProduct, ShopVariant, StoreSettings } from "@/lib/shop/normalize";
import { cityKey } from "@/lib/shop/normalize";

export const MAX_LINES = 30;
export const MAX_QTY = 20;

/** What pricing needs of a product: the browser gets only this much of the catalog */
export type PricingProduct = Pick<ShopProduct, "id" | "kind" | "bundle"> & { variants: Pick<ShopVariant, "id" | "priceAgorot" | "available">[] };
export type PricingSettings = Pick<StoreSettings, "deliveryZones" | "launchPromo" | "pickupEnabled">;

export type CartLine = { productId: string; variantId: string; qty: number };

/** A coupon as the server found it in Supabase (the code itself is never here) */
export type CouponTerms = {
  id: string;
  kind: "percent" | "amount";
  /** whole percent, or agorot */
  value: number;
  minSubtotalAgorot: number;
};

export type Delivery = { fulfilment: "pickup" } | { fulfilment: "delivery"; city: string } | null;

export type PricedLine = {
  productId: string;
  variantId: string;
  kind: ShopProduct["kind"];
  qty: number;
  unitAgorot: number;
  totalAgorot: number;
};

export type DroppedLine = { productId: string; variantId: string; reason: "missing" | "unavailable" | "quantity" };

export type AppliedDiscount = { source: "launch_promo" | "coupon"; amountAgorot: number; couponId?: string };

export type Shipping =
  | { status: "none" }
  | { status: "pickup"; feeAgorot: 0 }
  | { status: "zone"; zoneId: string; feeAgorot: number; freeAboveAgorot?: number }
  /** a city outside every zone: no delivery there, pickup or WhatsApp instead */
  | { status: "outside" };

export type Quote = {
  lines: PricedLine[];
  dropped: DroppedLine[];
  subtotalAgorot: number;
  /** what a promo or coupon can apply to: the single products, not the bundles */
  discountableAgorot: number;
  /** what each would give on its own, so the cart can say why one was chosen */
  promoAgorot: number;
  couponAgorot: number;
  /** the coupon was given but doesn't apply to this cart (its minimum, or nothing it can apply to) */
  couponUnmet: boolean;
  discount: AppliedDiscount | null;
  shipping: Shipping;
  shippingAgorot: number;
  totalAgorot: number;
  /** how much more for free delivery: in the chosen zone, or else the cheapest zone that has it */
  freeDelivery: { zoneId: string; remainingAgorot: number } | null;
};

export type PricingInput = {
  lines: readonly CartLine[];
  products: readonly PricingProduct[];
  settings: PricingSettings | null;
  coupon?: CouponTerms | null;
  delivery?: Delivery;
  now: Date;
};

/** The same product and size twice become one line; at most MAX_LINES lines */
export function mergeLines(lines: readonly CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const line of lines) {
    const key = `${line.productId}\u0000${line.variantId}`;
    const had = merged.get(key);
    if (had) had.qty += line.qty;
    else merged.set(key, { ...line });
  }
  return [...merged.values()].slice(0, MAX_LINES);
}

export function promoRunning(promo: LaunchPromo | null | undefined, now: Date): promo is LaunchPromo {
  if (!promo) return false;
  const t = now.getTime();
  return Date.parse(promo.startsAt) <= t && t < Date.parse(promo.endsAt);
}

function discountOf(kind: "percent" | "amount", value: number, base: number): number {
  if (base <= 0) return 0;
  const amount = kind === "percent" ? Math.floor((base * value) / 100) : value;
  return Math.max(0, Math.min(amount, base));
}

/** The zone that delivers to a city, by the same comparison the settings use */
export function zoneFor(city: string, zones: StoreSettings["deliveryZones"]) {
  const key = cityKey(city);
  return zones.find((z) => z.cities.includes(key)) ?? null;
}

export function priceCart(input: PricingInput): Quote {
  const byId = new Map(input.products.map((p) => [p.id, p]));
  const lines: PricedLine[] = [];
  const dropped: DroppedLine[] = [];

  for (const line of mergeLines(input.lines)) {
    const product = byId.get(line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant) {
      dropped.push({ productId: line.productId, variantId: line.variantId, reason: "missing" });
      continue;
    }
    if (!variant.available) {
      dropped.push({ productId: line.productId, variantId: line.variantId, reason: "unavailable" });
      continue;
    }
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
      dropped.push({ productId: line.productId, variantId: line.variantId, reason: "quantity" });
      continue;
    }
    lines.push({
      productId: product.id,
      variantId: variant.id,
      kind: product.kind,
      qty: line.qty,
      unitAgorot: variant.priceAgorot,
      totalAgorot: variant.priceAgorot * line.qty,
    });
  }

  const subtotalAgorot = lines.reduce((sum, l) => sum + l.totalAgorot, 0);
  const discountableAgorot = lines.filter((l) => l.kind === "single").reduce((sum, l) => sum + l.totalAgorot, 0);

  const promo = input.settings?.launchPromo;
  const promoAgorot =
    promoRunning(promo, input.now) && subtotalAgorot >= (promo.minSubtotalAgorot ?? 0)
      ? discountOf(promo.type, promo.value, discountableAgorot)
      : 0;

  const coupon = input.coupon ?? null;
  const couponAgorot = coupon && subtotalAgorot >= coupon.minSubtotalAgorot ? discountOf(coupon.kind, coupon.value, discountableAgorot) : 0;
  const couponUnmet = !!coupon && couponAgorot === 0;

  // the better one for the customer; on a tie the promo, which leaves the coupon unused
  let discount: AppliedDiscount | null = null;
  if (couponAgorot > promoAgorot && coupon) discount = { source: "coupon", amountAgorot: couponAgorot, couponId: coupon.id };
  else if (promoAgorot > 0) discount = { source: "launch_promo", amountAgorot: promoAgorot };

  const afterDiscount = subtotalAgorot - (discount?.amountAgorot ?? 0);
  const zones = input.settings?.deliveryZones ?? [];

  let shipping: Shipping = { status: "none" };
  const delivery = input.delivery ?? null;
  if (delivery?.fulfilment === "pickup") {
    shipping = { status: "pickup", feeAgorot: 0 };
  } else if (delivery?.fulfilment === "delivery") {
    const zone = zoneFor(delivery.city, zones);
    shipping = zone
      ? {
          status: "zone",
          zoneId: zone.id,
          feeAgorot: zone.freeAboveAgorot != null && afterDiscount >= zone.freeAboveAgorot ? 0 : zone.feeAgorot,
          ...(zone.freeAboveAgorot != null ? { freeAboveAgorot: zone.freeAboveAgorot } : {}),
        }
      : { status: "outside" };
  }
  const shippingAgorot = shipping.status === "zone" ? shipping.feeAgorot : 0;

  let freeDelivery: Quote["freeDelivery"] = null;
  if (lines.length > 0 && shipping.status !== "pickup" && shipping.status !== "outside") {
    const target =
      shipping.status === "zone"
        ? zones.find((z) => z.id === shipping.zoneId)
        : [...zones].filter((z) => z.freeAboveAgorot != null).sort((a, b) => a.feeAgorot - b.feeAgorot)[0];
    if (target?.freeAboveAgorot != null && afterDiscount < target.freeAboveAgorot) {
      freeDelivery = { zoneId: target.id, remainingAgorot: target.freeAboveAgorot - afterDiscount };
    }
  }

  return {
    lines,
    dropped,
    subtotalAgorot,
    discountableAgorot,
    promoAgorot,
    couponAgorot,
    couponUnmet,
    discount,
    shipping,
    shippingAgorot,
    totalAgorot: afterDiscount + shippingAgorot,
    freeDelivery,
  };
}

/**
 * A bundle's honest anchor: what its items cost bought one by one, at today's prices. null when an
 * item is gone, or when the sum isn't more than the bundle's price (then there's nothing to show).
 */
export function bundleAnchorAgorot(bundle: PricingProduct, products: readonly PricingProduct[]): number | null {
  if (bundle.kind !== "bundle" || bundle.bundle.length === 0) return null;
  const own = bundle.variants[0]?.priceAgorot;
  if (own == null) return null;
  let sum = 0;
  for (const line of bundle.bundle) {
    const variant = products.find((p) => p.id === line.productId)?.variants.find((v) => v.id === line.variantId);
    if (!variant) return null;
    sum += variant.priceAgorot * line.quantity;
  }
  return sum > own ? sum : null;
}
