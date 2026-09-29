import { orderableDocumentListDeskItem } from "@sanity/orderable-document-list";
import { CogIcon } from "@sanity/icons/Cog";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";
import { DropIcon } from "@sanity/icons/Drop";
import { HomeIcon } from "@sanity/icons/Home";
import { ImagesIcon } from "@sanity/icons/Images";
import { StackIcon } from "@sanity/icons/Stack";
import { ThLargeIcon } from "@sanity/icons/ThLarge";
import type { StructureResolver } from "sanity/structure";
import { CATEGORIES, categoryId } from "./categories";
import { SINGLETONS } from "./schemaTypes/site";

const SINGLETON_ICONS = { siteSettings: CogIcon, homePage: HomeIcon, cakePage: DocumentTextIcon } as Record<string, typeof CogIcon>;

/**
 * The Studio's sidebar, in the owner's words:
 *   הגדרות כלליות     every text that's on every page: the business, the menu, the footer, prices
 *   דף הבית           every text of the homepage, section by section
 *   דף הזמנת עוגה     the order page and every word of the cake builder
 *   עוגות בגלריה      the homepage gallery; drag to reorder, the order is the site's order
 *   סוגי עוגות        the builder's four cake types: sizes, prices, bases, creams, photo
 *   טעמי בסיס, קרמים  the options the cake types offer
 */
export const structure: StructureResolver = (S, context) =>
  S.list()
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
      S.divider(),
      orderableDocumentListDeskItem({ type: "cake", id: "cakes", title: "עוגות בגלריה", icon: ImagesIcon, S, context }),
      S.divider(),
      S.listItem()
        .id("categories")
        .title("סוגי עוגות (בונה העוגה)")
        .icon(ThLargeIcon)
        .child(
          S.list()
            .id("categories")
            .title("סוגי עוגות")
            .items(
              CATEGORIES.map(({ key, title }) =>
                S.listItem()
                  .id(key)
                  .title(title)
                  .icon(ThLargeIcon)
                  .child(S.document().schemaType("category").documentId(categoryId(key)).title(title)),
              ),
            ),
        ),
      S.documentTypeListItem("flavour").title("טעמי בסיס").icon(StackIcon),
      S.documentTypeListItem("cream").title("קרמים").icon(DropIcon),
    ]);
