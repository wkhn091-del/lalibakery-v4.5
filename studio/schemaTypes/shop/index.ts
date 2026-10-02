import { builderAddon } from "./builderAddon";
import { legalPage } from "./legalPage";
import { bundleItem, product, productVariant } from "./product";
import { storeSettings } from "./storeSettings";
import { occasion, shopCategory, style } from "./taxonomy";

/** The shop: products and their filters, the builder's add-ons, the shop's settings and legal pages */
export const shopTypes = [product, productVariant, bundleItem, shopCategory, occasion, style, builderAddon, storeSettings, legalPage];
