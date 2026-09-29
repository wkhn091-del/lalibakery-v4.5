import { cake } from "./cake";
import { cakeSize } from "./cakeSize";
import { category } from "./category";
import { cream } from "./cream";
import { flavour } from "./flavour";
import { SINGLETON_TYPES, siteTypes } from "./site";

export const schemaTypes = [...siteTypes, cake, category, cakeSize, flavour, cream];

/** Types the owner edits but never creates or deletes (the four cake types of the builder) */
export const FIXED_TYPES = new Set(["category"]);

/** The site's texts: one document of each (site/spec.ts), opened straight from the sidebar */
export { SINGLETON_TYPES };
