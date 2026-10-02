import type { Metadata } from "next";
import { connection } from "next/server";
import Catalog from "@/components/shop/Catalog";
import ShopHeader from "@/components/shop/ShopHeader";
import Footer from "@/components/sections/Footer";
import { linksOf } from "@/lib/content/contact";
import { alternatesFor, OG_LOCALE } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";
import { routeLocale } from "@/lib/i18n/route";
import { ORDER_PAGE } from "@/lib/routes";
import { catalogTerms, toCards } from "@/lib/shop/catalog";
import { getSettings } from "@/sanity/content";
import { cmsImage } from "@/sanity/image";
import { getShopCatalog } from "@/sanity/shop";

export async function generateMetadata({ params }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const locale = await routeLocale(params);
  const { business } = await getSettings(false);
  const t = messages(locale);
  const title = `${t.shop.metaTitle} | ${business.name}`;
  const alternates = alternatesFor(locale, "/products");
  return {
    title,
    description: t.shop.intro,
    alternates,
    openGraph: { title, description: t.shop.intro, url: alternates.canonical, locale: OG_LOCALE[locale], type: "website", images: [{ url: "/images/og.jpg", width: 1200, height: 630 }] },
  };
}

/*
  The catalog. Rendered per request, because the filters are in the address and the first page
  already shows the filtered products (for a shared link, for Google, and before any JS). That's
  cheap: the catalog itself comes from Next's data cache, refreshed by the CMS webhook
  (app/api/revalidate), so a visit reads nothing from Sanity. After the first page, filtering
  happens in the browser (components/shop/Catalog.tsx).
*/
export default async function ProductsPage({ params }: PageProps<"/[locale]/products">) {
  const locale = await routeLocale(params);
  await connection();
  const [catalog, settings] = await Promise.all([getShopCatalog(), getSettings()]);
  const t = messages(locale);
  const cards = toCards(catalog, locale, cmsImage);
  const terms = catalogTerms(catalog, cards, locale);

  return (
    <>
      <ShopHeader locale={locale} name={settings.business.name} />
      <main id="main" tabIndex={-1} className="shop-page">
        <div className="wrap">
          <h1 className="t-h2">{t.shop.title}</h1>
          <p className="t-lead soft mt-3 measure">{t.shop.intro}</p>
          {cards.length ? (
            <Catalog
              cards={cards}
              terms={terms}
              t={{ filters: t.filters, allergens: t.allergens, card: { from: t.product.from, unavailable: t.product.unavailable, diet: t.diet } }}
            />
          ) : (
            <div className="catalog-none">
              <p>{t.shop.empty}</p>
              <a href={ORDER_PAGE} className="btn-primary mt-6">{t.shop.emptyCta}</a>
            </div>
          )}
        </div>
      </main>
      <Footer settings={settings} links={linksOf(settings.business)} />
    </>
  );
}
