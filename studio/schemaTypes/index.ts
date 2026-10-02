import { cake } from "./cake";
import { cakeSize } from "./cakeSize";
import { category } from "./category";
import { cream } from "./cream";
import { filling } from "./filling";
import { flavour } from "./flavour";
import { shopTypes } from "./shop";
import { SINGLETON_TYPES as SITE_SINGLETON_TYPES, siteTypes } from "./site";

export const schemaTypes = [...siteTypes, cake, category, cakeSize, flavour, cream, filling, ...shopTypes];

/** Types the owner edits but never creates or deletes: the builder's four cake types and ten
 *  add-ons, and the legal pages */
export const FIXED_TYPES = new Set(["category", "builderAddon", "legalPage"]);

/** One document of each, opened straight from the sidebar: the site's texts (site/spec.ts) and
 *  the shop's settings */
export const SINGLETON_TYPES = new Set([...SITE_SINGLETON_TYPES, "storeSettings"]);
