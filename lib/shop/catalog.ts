/*
  The catalog as the shop's pages show it: each product as a card in one language, and the filters
  it can be found by. Built on the server from the checked catalog (lib/shop/normalize.ts); the
  catalog page hands the cards to the browser, which filters them without asking the server again
  (lib/shop/filter.ts).

  A card carries only what's shown and filtered on, and nothing private: the catalog is public.
  Its prices are for display. An order is priced again on the server, from Sanity (the pricing
  engine), and never from what the browser has.
*/
import { localePath, type Locale, pick } from "@/lib/i18n/config";
import type { CmsImage } from "@/sanity/image";
import type { Allergen, ShopCatalog, ShopProduct, ShopTerm } from "./normalize";

export type CardImage = { src: string; srcSet: string; width: number; height?: number; lqip?: string; position?: string; alt: string };
type ImageOf = (image: CmsImage, widths: number[], options?: { square?: boolean }) => Omit<CardImage, "alt"> | null;

export const DIET_KEYS = ["parve", "glutenFreeRecipe", "noAddedSugar", "nutFree"] as const;
export type DietKey = (typeof DIET_KEYS)[number];

export type CatalogCard = {
  id: string;
  slug: string;
  href: string;
  title: string;
  summary: string;
  kind: ShopProduct["kind"];
  image: CardImage | null;
  /** the lowest price of a size that's available; null when none is */
  fromAgorot: number | null;
  /** one available size only: its price is the price, not "from" */
  onePrice: boolean;
  available: boolean;
  /** the servings of the sizes that are available */
  servings: [number, number][];
  category: string;
  occasions: string[];
  styles: string[];
  diet: DietKey[];
  allergens: Allergen[];
  featured: boolean;
  /** the owner's order in the Studio */
  rank: number;
};

export type FilterTerm = { slug: string; title: string; swatch?: string };
export type CatalogTerms = { category: FilterTerm[]; occasion: FilterTerm[]; style: FilterTerm[] };

export const CARD_WIDTHS = [320, 480, 640, 800];

function dietOf(p: ShopProduct): DietKey[] {
  return DIET_KEYS.filter((k) => (k === "parve" ? p.kosher === "parve" : p.diet[k]));
}

const termTitle = (t: ShopTerm, locale: Locale): FilterTerm => ({ slug: t.slug, title: pick(t.title, locale), ...(t.swatch ? { swatch: t.swatch } : {}) });

/** The products as cards, in the owner's order */
export function toCards(catalog: ShopCatalog, locale: Locale, imageOf: ImageOf): CatalogCard[] {
  const slugOf = (terms: ShopTerm[]) => new Map(terms.map((t) => [t.id, t.slug]));
  const categories = slugOf(catalog.categories);
  const occasions = slugOf(catalog.occasions);
  const styles = slugOf(catalog.styles);
  return catalog.products.map((p, rank) => {
    const open = p.variants.filter((v) => v.available);
    const prices = open.map((v) => v.priceAgorot);
    const first = p.images[0];
    const image = first ? imageOf(first, CARD_WIDTHS, { square: true }) : null;
    return {
      id: p.id,
      slug: p.slug,
      href: localePath(locale, `/products/${p.slug}`),
      title: pick(p.title, locale),
      summary: pick(p.summary, locale),
      kind: p.kind,
      image: image && first ? { ...image, alt: first.alt } : null,
      fromAgorot: prices.length ? Math.min(...prices) : null,
      onePrice: open.length === 1,
      available: open.length > 0,
      servings: open.flatMap((v) => (v.servings ? [v.servings] : [])),
      category: categories.get(p.categoryId) ?? "",
      occasions: p.occasionIds.flatMap((id) => occasions.get(id) ?? []),
      styles: p.styleIds.flatMap((id) => styles.get(id) ?? []),
      diet: dietOf(p),
      allergens: p.allergens,
      featured: p.featured,
      rank,
    };
  });
}

/** The filters' choices: only the ones some product has, so no choice leads to an empty page */
export function catalogTerms(catalog: ShopCatalog, cards: CatalogCard[], locale: Locale): CatalogTerms {
  const used = (pickSlugs: (c: CatalogCard) => string[]) => new Set(cards.flatMap(pickSlugs));
  const category = used((c) => [c.category]);
  const occasion = used((c) => c.occasions);
  const style = used((c) => c.styles);
  return {
    category: catalog.categories.filter((t) => category.has(t.slug)).map((t) => termTitle(t, locale)),
    occasion: catalog.occasions.filter((t) => occasion.has(t.slug)).map((t) => termTitle(t, locale)),
    style: catalog.styles.filter((t) => style.has(t.slug)).map((t) => termTitle(t, locale)),
  };
}
