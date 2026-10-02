import { orderableDocumentListDeskItem } from "@sanity/orderable-document-list";
import { BasketIcon } from "@sanity/icons/Basket";
import { CogIcon } from "@sanity/icons/Cog";
import { ColorWheelIcon } from "@sanity/icons/ColorWheel";
import { ControlsIcon } from "@sanity/icons/Controls";
import { DocumentsIcon } from "@sanity/icons/Documents";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";
import { DropIcon } from "@sanity/icons/Drop";
import { StackCompactIcon } from "@sanity/icons/StackCompact";
import { FolderIcon } from "@sanity/icons/Folder";
import { HomeIcon } from "@sanity/icons/Home";
import { ImagesIcon } from "@sanity/icons/Images";
import { SparklesIcon } from "@sanity/icons/Sparkles";
import { StackIcon } from "@sanity/icons/Stack";
import { StarIcon } from "@sanity/icons/Star";
import { ThLargeIcon } from "@sanity/icons/ThLarge";
import type { StructureResolver } from "sanity/structure";
import { ADDONS, addonId } from "./addons";
import { CATEGORIES, categoryId } from "./categories";
import { LEGAL_PAGES, legalId } from "./legal";
import { SINGLETONS } from "./schemaTypes/site";
import { STORE_SETTINGS_ID } from "./store";

const SINGLETON_ICONS = { siteSettings: CogIcon, homePage: HomeIcon, cakePage: DocumentTextIcon } as Record<string, typeof CogIcon>;

/**
 * The Studio's sidebar, in the owner's words:
 *   הגדרות כלליות     every text that's on every page: the business, the menu, the footer, prices
 *   דף הבית           every text of the homepage, section by section
 *   דף הזמנת עוגה     the order page and every word of the cake builder
 *   הגדרות החנות      the calendar, delivery, the promo, cancellations, kosher, the business
 *   מוצרים            the shop; drag to reorder, the order is the shop's order
 *   קטגוריות, אירועים, צבעים   the shop's filters
 *   עוגות בגלריה      the homepage gallery; drag to reorder, the order is the site's order
 *   סוגי עוגות        the builder's four cake types: sizes, prices, bases, creams, photo
 *   תוספות בבונה      the builder's ten add-ons
 *   טעמי בסיס, קרמים, מילויים  the options the cake types offer
 *   דפים משפטיים      terms, privacy, shipping, cancellations, kosher and allergens
 */
export const structure: StructureResolver = (S, context) => {
  const fixedList = (id: string, title: string, icon: typeof CogIcon, type: string, items: { id: string; title: string }[]) =>
    S.listItem()
      .id(id)
      .title(title)
      .icon(icon)
      .child(
        S.list()
          .id(id)
          .title(title)
          .items(items.map((item) => S.listItem().id(item.id).title(item.title).icon(icon).child(S.document().schemaType(type).documentId(item.id).title(item.title)))),
      );

  return S.list()
    .title("LaliBakery")
    .items([
      // the site's texts: one document each, opened directly (they can't be created or deleted)
      ...SINGLETONS.map(({ type, title, id }) =>
        S.listItem()
          .id(id)
          .title(title)
          .icon(SINGLETON_ICONS[type])
          .child(S.document().schemaType(type).documentId(id).title(title)),
      ),
      S.listItem()
        .id(STORE_SETTINGS_ID)
        .title("הגדרות החנות")
        .icon(ControlsIcon)
        .child(S.document().schemaType("storeSettings").documentId(STORE_SETTINGS_ID).title("הגדרות החנות")),
      S.divider(),
      orderableDocumentListDeskItem({ type: "product", id: "products", title: "מוצרים", icon: BasketIcon, S, context }),
      orderableDocumentListDeskItem({ type: "shopCategory", id: "shop-categories", title: "קטגוריות בחנות", icon: FolderIcon, S, context }),
      orderableDocumentListDeskItem({ type: "occasion", id: "occasions", title: "אירועים", icon: StarIcon, S, context }),
      orderableDocumentListDeskItem({ type: "style", id: "styles", title: "צבעים וסגנונות", icon: ColorWheelIcon, S, context }),
      S.divider(),
      orderableDocumentListDeskItem({ type: "cake", id: "cakes", title: "עוגות בגלריה", icon: ImagesIcon, S, context }),
      S.divider(),
      fixedList(
        "categories",
        "סוגי עוגות (בונה העוגה)",
        ThLargeIcon,
        "category",
        CATEGORIES.map(({ key, title }) => ({ id: categoryId(key), title })),
      ),
      fixedList(
        "addons",
        "תוספות בבונה",
        SparklesIcon,
        "builderAddon",
        ADDONS.map(({ key, title }) => ({ id: addonId(key), title })),
      ),
      S.documentTypeListItem("flavour").title("טעמי בסיס").icon(StackIcon),
      S.documentTypeListItem("cream").title("קרמים").icon(DropIcon),
      S.documentTypeListItem("filling").title("מילויים").icon(StackCompactIcon),
      S.divider(),
      fixedList(
        "legal",
        "דפים משפטיים",
        DocumentsIcon,
        "legalPage",
        LEGAL_PAGES.map(({ key, title }) => ({ id: legalId(key), title })),
      ),
    ]);
};
