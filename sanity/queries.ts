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
    sizes[] { _key, label, detail, servingsMin, servingsMax, price, shape, diameter, trayWidth, trayLength },
    "bases": bases[]->{ _id, name, note, tone },
    "creams": creams[]->{ _id, name, tone, contains, parve }
  }
`;
