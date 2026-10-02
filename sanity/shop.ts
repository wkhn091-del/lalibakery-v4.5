import "server-only";
import { cache } from "react";
import { DEFAULT_LOCALE, pick } from "@/lib/i18n/config";
import { type Addon, BUILT_IN_ADDONS } from "@/lib/order/model";
import {
  ADDON_KEYS,
  type BuilderAddon,
  type LegalKey,
  type LegalPage,
  normalizeAddons,
  normalizeCatalog,
  normalizeLegal,
  normalizeSettings,
  type RawCatalog,
  type ShopCatalog,
  type StoreSettings,
} from "@/lib/shop/normalize";
import { isSanityConfigured } from "./env";
import { loadOrNull, sanityFetch } from "./fetch";
import { builderAddonsQuery, legalPageQuery, shopCatalogQuery, storeSettingsQuery } from "./queries";

/*
  The shop's content, read on the server only (the browser never talks to Sanity). Within one
  request each read happens once. The fixed documents' ids match the Studio's (studio/store.ts,
  studio/addons.ts, studio/legal.ts; lib/shop/normalize.test.ts checks).

  For pages: the Studio's preview shows drafts. For orders ({ published: true }): always the
  published content, so a price is only ever charged once the owner has published it.

  With no CMS set up the shop has no products and takes no orders: unlike the site's texts there's
  no built-in catalog to fall back on, and a made-up price would be worse than none.
*/

export const STORE_SETTINGS_ID = "storeSettings";
export const addonId = (key: (typeof ADDON_KEYS)[number]) => `addon-${key}`;
export const legalId = (key: LegalKey) => `legal-${key}`;

const EMPTY: ShopCatalog = { products: [], categories: [], occasions: [], styles: [] };

type For = { published?: boolean };

const catalog = cache(async (published: boolean): Promise<ShopCatalog> => {
  if (!isSanityConfigured) return EMPTY;
  const raw = await loadOrNull("the shop's catalog", () => sanityFetch<RawCatalog>(shopCatalogQuery, {}, { published }));
  return raw ? normalizeCatalog(raw) : EMPTY;
});

const settings = cache(async (published: boolean): Promise<StoreSettings | null> => {
  if (!isSanityConfigured) return null;
  const raw = await loadOrNull("the shop's settings", () => sanityFetch<unknown>(storeSettingsQuery, { id: STORE_SETTINGS_ID }, { published }));
  return normalizeSettings(raw);
});

const addons = cache(async (published: boolean): Promise<BuilderAddon[]> => {
  if (!isSanityConfigured) return [];
  const raw = await loadOrNull("the builder's add-ons", () => sanityFetch<unknown[]>(builderAddonsQuery, { ids: ADDON_KEYS.map(addonId) }, { published }));
  return normalizeAddons(raw);
});

const legal = cache(async (key: LegalKey): Promise<LegalPage | null> => {
  if (!isSanityConfigured) return null;
  const raw = await loadOrNull(`the legal page "${key}"`, () => sanityFetch<unknown>(legalPageQuery, { id: legalId(key) }));
  return normalizeLegal(key, raw);
});

/** The products that are shown and the shop's filters */
export const getShopCatalog = ({ published = false }: For = {}) => catalog(published);
/** The calendar, delivery, the promo, cancellations, kosher and the business; null: the shop takes no orders */
export const getStoreSettings = ({ published = false }: For = {}) => settings(published);
/** The cake builder's add-ons that are switched on */
export const getBuilderAddons = ({ published = false }: For = {}) => addons(published);

/**
 * The add-ons as the builder shows them (in Hebrew, published only, so the page and the server's
 * check of a request agree). With no CMS: the built-in ones, like the rest of the builder.
 */
export async function getWizardAddons(): Promise<Addon[]> {
  if (!isSanityConfigured) return BUILT_IN_ADDONS;
  return (await addons(true)).map((a) => ({
    key: a.key,
    title: pick(a.title, DEFAULT_LOCALE),
    description: pick(a.description, DEFAULT_LOCALE),
    categories: a.categories,
    options: a.options.map((o) => ({ id: o.id, label: pick(o.label, DEFAULT_LOCALE) })),
    colorable: a.colorable,
    textMax: a.textMax,
    ...(a.quantity ? { quantity: a.quantity } : {}),
    imageByWhatsapp: a.imageByWhatsapp,
  }));
}
/** A legal page; null while it isn't written and published */
export const getLegalPage = (key: LegalKey) => legal(key);
