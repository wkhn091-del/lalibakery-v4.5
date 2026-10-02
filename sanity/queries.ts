// The GROQ queries the site runs. Read-only: published content, or drafts in the Studio's preview (fetch.ts).

/**
 * The site's texts: three documents with fixed ids, one of each (the Studio's singletons,
 * studio/schemaTypes/site). The whole document is read; content.ts says which fields count.
 */
export const SINGLETON = { settings: "siteSettings", home: "homePage", cakePage: "cakePage" } as const;
export const singletonQuery = /* groq */ `*[_id == $id][0]`;

const image = `{ alt, crop, hotspot, asset->{ _id, metadata { lqip, dimensions { width, height } } } }`;

/** The cakes shown in the homepage gallery (the Proof section), in the owner's order */
export const galleryQuery = /* groq */ `
  *[_type == "cake" && featured != false && defined(image.asset)] | order(orderRank asc) {
    _id,
    name,
    description,
    price,
    "image": image${image}
  }
`;

/**
 * The cake builder's four cake types (fixed documents, $ids), each with its sizes, bases and
 * creams. The order is the builder's own (data.ts), not the owner's: its tile grid depends on it.
 */
export const catalogQuery = /* groq */ `
  *[_type == "category" && _id in $ids] {
    _id,
    title,
    blurb,
    "image": image${image},
    "gallery": gallery[defined(asset)]${image},
    sizes[] { _key, label, detail, servingsMin, servingsMax, price, shape, diameter, trayWidth, trayLength },
    "bases": bases[]->{ _id, name, note, tone, group, contains },
    "creams": creams[]->{ _id, name, tone, group, contains, parve },
    "fillings": fillings[]->{ _id, name, tone, group, contains, parve }
  }
`;

/* ───────── the shop (checked and shaped in lib/shop/normalize.ts) ───────── */

const term = `{ _id, title, "slug": slug.current, description, "image": image${image}, swatch }`;

/**
 * The whole catalog in one read: the products that are shown, in the owner's order, and the
 * filters. A reference to something unpublished comes back null, and the product (or bundle)
 * pointing to it isn't shown.
 */
export const shopCatalogQuery = /* groq */ `{
  "products": *[_type == "product" && available != false && defined(slug.current)] | order(orderRank asc) {
    _id,
    kind,
    title,
    "slug": slug.current,
    summary,
    description,
    seoDescription,
    "categoryId": shopCategory->_id,
    "images": images[]${image},
    variants[] { _key, label, servingsMin, servingsMax, price, available },
    bundleItems[] { "product": product->_id, variantKey, quantity },
    "occasionIds": occasions[]->_id,
    "styleIds": styles[]->_id,
    kosher,
    diet { glutenFreeRecipe, noAddedSugar, nutFree },
    allergens,
    featured
  },
  "categories": *[_type == "shopCategory" && defined(slug.current)] | order(orderRank asc) ${term},
  "occasions": *[_type == "occasion" && defined(slug.current)] | order(orderRank asc) ${term},
  "styles": *[_type == "style" && defined(slug.current)] | order(orderRank asc) ${term}
}`;

/** The shop's settings ($id: the fixed document). The reasons of blocked dates are the owner's alone: never read. */
export const storeSettingsQuery = /* groq */ `
  *[_id == $id][0] {
    dailyCapacity,
    weekdayCapacity[] { day, capacity },
    leadBusinessDays,
    maxAdvanceDays,
    blockedDates[] { from, to },
    pickupEnabled,
    pickupNote,
    deliveryWindows[] { _key, days, from, to },
    deliveryZones[] { _key, name, fee, freeAbove, cities },
    launchPromo { enabled, label, type, value, minSubtotal, startsAt, endsAt },
    catalogCancellationDays,
    kosherAuthority,
    "kosherCertificate": kosherCertificate${image},
    kosherValidUntil,
    legalName,
    businessType,
    businessNumber,
    legalAddress,
    legalEmail
  }
`;

/** The builder's add-ons (fixed documents, $ids) */
export const builderAddonsQuery = /* groq */ `
  *[_type == "builderAddon" && _id in $ids] {
    _id, title, description, available, categories,
    options[] { _key, label },
    colorable, textMax, quantity { min, max }, imageByWhatsapp
  }
`;

/** A legal page (a fixed document, $id) */
export const legalPageQuery = /* groq */ `*[_id == $id][0] { _id, title, updatedAt, body }`;
