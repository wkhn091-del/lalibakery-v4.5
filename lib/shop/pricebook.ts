/*
  The public slice of the catalog the cart and checkout pages hand to the browser: for each
  product what the cart shows (name, size names, a thumbnail, the address) and what the pricing
  engine needs for its estimate (prices, availability, a bundle's items). The same data as the
  product pages show; nothing private. The browser's estimate is for display only: the order is
  priced again on the server.
*/
import { type Localized, type Locale, localePath, pick } from "@/lib/i18n/config";
import type { PricingProduct, PricingSettings } from "@/lib/pricing/engine";
import { bundleAnchorAgorot } from "@/lib/pricing/engine";
import type { ShopCatalog, StoreSettings } from "./normalize";

export type BookProduct = PricingProduct & {
  title: string;
  href: string;
  thumb: string | null;
  variantLabels: Record<string, string>;
  /** a bundle's real "bought separately" sum, when it's higher than its price */
  anchorAgorot: number | null;
};

export type BookZone = { id: string; name: string; feeAgorot: number; freeAboveAgorot?: number; cities: string[] };

export type PriceBook = {
  products: BookProduct[];
  settings: (PricingSettings & { zones: BookZone[]; promoLabel: string | null }) | null;
};

type Thumb = (product: ShopCatalog["products"][number]) => string | null;

export function priceBook(catalog: ShopCatalog, settings: StoreSettings | null, locale: Locale, thumb: Thumb): PriceBook {
  const label = (l: Localized) => pick(l, locale);
  return {
    products: catalog.products.map((p) => ({
      id: p.id,
      kind: p.kind,
      bundle: p.bundle,
      variants: p.variants.map((v) => ({ id: v.id, priceAgorot: v.priceAgorot, available: v.available })),
      title: label(p.title),
      href: localePath(locale, `/products/${p.slug}`),
      thumb: thumb(p),
      variantLabels: Object.fromEntries(p.variants.map((v) => [v.id, label(v.label)])),
      anchorAgorot: bundleAnchorAgorot(p, catalog.products),
    })),
    settings: settings && {
      deliveryZones: settings.deliveryZones,
      launchPromo: settings.launchPromo,
      pickupEnabled: settings.pickupEnabled,
      promoLabel: settings.launchPromo ? label(settings.launchPromo.label) : null,
      zones: settings.deliveryZones.map((z) => ({ id: z.id, name: label(z.name), feeAgorot: z.feeAgorot, ...(z.freeAboveAgorot != null ? { freeAboveAgorot: z.freeAboveAgorot } : {}), cities: z.cities })),
    },
  };
}
