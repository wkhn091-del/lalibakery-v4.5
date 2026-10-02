import type { Metadata } from "next";
import { connection } from "next/server";
import CheckoutForm from "@/components/shop/CheckoutForm";
import ShopHeader from "@/components/shop/ShopHeader";
import Footer from "@/components/sections/Footer";
import { availableDays } from "@/lib/checkout/availability";
import type { OpenDay } from "@/lib/checkout/calendar";
import { linksOf } from "@/lib/content/contact";
import { growEnv, serverEnv } from "@/lib/env/server";
import { localePath, pick } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";
import { routeLocale } from "@/lib/i18n/route";
import { priceBook } from "@/lib/shop/pricebook";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSettings } from "@/sanity/content";
import { cmsImage } from "@/sanity/image";
import { getShopCatalog, getStoreSettings } from "@/sanity/shop";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">): Promise<Metadata> {
  const locale = await routeLocale(params);
  const { business } = await getSettings(false);
  return { title: `${messages(locale).checkout.metaTitle} | ${business.name}`, robots: { index: false, follow: false } };
}

/*
  The checkout. Rendered per request: the days and how full they are change all the time (the
  database counts them, lib/checkout/availability.ts). What reaches the browser is the published
  catalog's prices (the same as the product pages), each day's status (free, few left, full; never
  the counts), the delivery windows and zones, and which payment methods are on.
  Closed (a WhatsApp link instead) until the shop's settings, Supabase and the order link's secret
  are all in place.
*/
export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const locale = await routeLocale(params);
  await connection();
  const [catalog, store, settings] = await Promise.all([getShopCatalog({ published: true }), getStoreSettings({ published: true }), getSettings()]);
  const t = messages(locale);
  const links = linksOf(settings.business);
  const open = !!store && !!supabaseAdmin() && !!serverEnv().ORDER_LINK_SECRET;

  let days: OpenDay[] = [];
  if (open && store) {
    try {
      days = await availableDays(store);
    } catch (error) {
      console.error("[checkout] availability failed:", error);
    }
  }

  return (
    <>
      <ShopHeader locale={locale} name={settings.business.name} />
      <main id="main" tabIndex={-1} className="shop-page">
        <div className="wrap">
          <h1 className="t-h2">{t.checkout.title}</h1>
          <div className="mt-8">
            {open && store ? (
              <CheckoutForm
                locale={locale}
                book={priceBook(catalog, store, locale, (p) => (p.images[0] && cmsImage(p.images[0], [192], { square: true })?.src) || null)}
                days={days}
                windows={store.deliveryWindows.map(({ id, from, to }) => ({ id, from, to }))}
                pickup={{ enabled: store.pickupEnabled, note: pick(store.pickupNote, locale) }}
                online={!!growEnv()}
                links={{
                  cart: localePath(locale, "/cart"),
                  shop: localePath(locale, "/products"),
                  terms: localePath(locale, "/legal/terms"),
                  cancellation: localePath(locale, "/legal/cancellation"),
                  privacy: localePath(locale, "/legal/privacy"),
                  whatsapp: links.whatsapp,
                }}
                t={t.checkout}
                tc={t.cart}
              />
            ) : (
              <div className="catalog-none">
                <p>{t.checkout.closed}</p>
                <a href={links.whatsapp} target="_blank" rel="noopener" className="btn-primary mt-6">{t.checkout.closedCta}</a>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer settings={settings} links={links} />
    </>
  );
}
