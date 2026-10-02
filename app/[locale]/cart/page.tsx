import type { Metadata } from "next";
import Cart from "@/components/shop/Cart";
import ShopHeader from "@/components/shop/ShopHeader";
import Footer from "@/components/sections/Footer";
import { linksOf } from "@/lib/content/contact";
import { localePath } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";
import { routeLocale } from "@/lib/i18n/route";
import { priceBook } from "@/lib/shop/pricebook";
import { getSettings } from "@/sanity/content";
import { cmsImage } from "@/sanity/image";
import { getShopCatalog, getStoreSettings } from "@/sanity/shop";

/*
  The cart. The page itself is the same for everyone (static, refreshed with the catalog): what's
  in the cart lives in the browser, and the prices on it come from the published catalog this page
  was built with. Not for search engines: there's nothing on it until someone adds something.
*/
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const locale = await routeLocale(params);
  const { business } = await getSettings(false);
  return { title: `${messages(locale).cart.metaTitle} | ${business.name}`, robots: { index: false, follow: false } };
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const locale = await routeLocale(params);
  const [catalog, store, settings] = await Promise.all([getShopCatalog({ published: true }), getStoreSettings({ published: true }), getSettings()]);
  const t = messages(locale);
  const book = priceBook(catalog, store, locale, (p) => (p.images[0] && cmsImage(p.images[0], [192], { square: true })?.src) || null);

  return (
    <>
      <ShopHeader locale={locale} name={settings.business.name} />
      <main id="main" tabIndex={-1} className="shop-page">
        <div className="wrap">
          <h1 className="t-h2">{t.cart.title}</h1>
          <div className="mt-8">
            <Cart book={book} t={t.cart} shopHref={localePath(locale, "/products")} checkoutHref={localePath(locale, "/checkout")} />
          </div>
        </div>
      </main>
      <Footer settings={settings} links={linksOf(settings.business)} />
    </>
  );
}
