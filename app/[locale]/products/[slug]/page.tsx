import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as z from "zod/mini";
import AddToCart from "@/components/shop/AddToCart";
import ProductGallery, { type GalleryImage } from "@/components/shop/ProductGallery";
import ProductJsonLd from "@/components/shop/ProductJsonLd";
import ShopHeader from "@/components/shop/ShopHeader";
import { cardPrice } from "@/components/shop/ProductCard";
import Footer from "@/components/sections/Footer";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { linksOf } from "@/lib/content/contact";
import { alternatesFor, type Locale, localePath, OG_LOCALE, pick } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";
import { routeLocale } from "@/lib/i18n/route";
import { bundleAnchorAgorot } from "@/lib/pricing/engine";
import { DIET_KEYS } from "@/lib/shop/catalog";
import type { ShopCatalog, ShopProduct } from "@/lib/shop/normalize";
import { agorotText } from "@/lib/price";
import { clean } from "@/lib/stega";
import { fill } from "@/lib/text";
import { getSettings } from "@/sanity/content";
import { cmsImage } from "@/sanity/image";
import { getShopCatalog, getStoreSettings } from "@/sanity/shop";

// סטטי (ISR), כמו שאר הדפים: נבנה מראש לכל מוצר, ומתרענן כשהבעלים מפרסמת שינוי (app/api/revalidate)
// או לכל המאוחר אחרי שעה. מוצר חדש נבנה בביקור הראשון בו.
export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
/** the address's last part, as the Studio makes slugs (sanity/queries.ts reads only those) */
const SlugParam = z.string().check(z.minLength(1), z.maxLength(80), z.regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u));

export async function generateStaticParams() {
  const { products } = await getShopCatalog({ published: true });
  return products.map((p) => ({ slug: p.slug }));
}

function decoded(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/** The product the address names, or null (the page shows the 404; the metadata stays empty for it) */
async function find(params: Promise<{ locale: string; slug: string }>) {
  const locale = await routeLocale(params);
  const parsed = z.safeParse(SlugParam, decoded((await params).slug));
  const catalog = await getShopCatalog();
  const product = parsed.success ? catalog.products.find((p) => p.slug === parsed.data) : undefined;
  return { locale, catalog, product };
}

const galleryOf = (p: ShopProduct): GalleryImage[] =>
  p.images.flatMap((img) => {
    const big = cmsImage(img, [480, 720, 960, 1200], { square: true });
    const thumb = cmsImage(img, [192], { square: true });
    return big && thumb ? [{ ...big, alt: img.alt, thumb: thumb.src }] : [];
  });

export async function generateMetadata({ params }: PageProps<"/[locale]/products/[slug]">): Promise<Metadata> {
  const [{ locale, product }, { business }] = await Promise.all([find(params), getSettings(false)]);
  if (!product) return {};
  const name = clean(pick(product.title, locale));
  const description = clean(pick(product.seoDescription, locale) || pick(product.summary, locale));
  const title = `${name} | ${business.name}`;
  const alternates = alternatesFor(locale, `/products/${product.slug}`);
  const image = product.images[0] && cmsImage(product.images[0], [1200], { square: true });
  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      locale: OG_LOCALE[locale],
      type: "website",
      images: image ? [{ url: image.src, width: 1200, height: 1200, alt: clean(product.images[0].alt) }] : [{ url: "/images/og.jpg", width: 1200, height: 630 }],
    },
  };
}

function servingsText(servings: [number, number] | undefined, t: ReturnType<typeof messages>["product"]): string {
  if (!servings) return "";
  const [min, max] = servings;
  return min === max ? fill(t.servingsExact, { n: min }) : fill(t.servingsRange, { min, max });
}

/** A bundle's items, each with the product it is and the size, for the list under "what's in the box" */
function bundleLines(p: ShopProduct, catalog: ShopCatalog, locale: Locale) {
  return p.bundle.flatMap((line) => {
    const item = catalog.products.find((x) => x.id === line.productId);
    const variant = item?.variants.find((v) => v.id === line.variantId);
    if (!item || !variant) return [];
    return [{ key: `${line.productId}:${line.variantId}`, quantity: line.quantity, title: pick(item.title, locale), size: pick(variant.label, locale), href: localePath(locale, `/products/${item.slug}`) }];
  });
}

export default async function ProductPage({ params }: PageProps<"/[locale]/products/[slug]">) {
  const { locale, catalog, product: p } = await find(params);
  if (!p) notFound();
  const [settings, store] = await Promise.all([getSettings(), getStoreSettings()]);
  const t = messages(locale);
  const links = linksOf(settings.business);

  const title = pick(p.title, locale);
  const summary = pick(p.summary, locale);
  const description = pick(p.description, locale);
  const open = p.variants.filter((v) => v.available);
  const prices = open.map((v) => v.priceAgorot);
  const price = cardPrice({ fromAgorot: prices.length ? Math.min(...prices) : null, onePrice: open.length === 1 }, t.product);
  const diet = DIET_KEYS.filter((k) => k !== "parve" && p.diet[k]) as Exclude<(typeof DIET_KEYS)[number], "parve">[];
  const today = new Date().toISOString().slice(0, 10);
  const kosher = store?.kosher;
  const authority = kosher?.authority && (!kosher.validUntil || kosher.validUntil >= today) ? kosher.authority : null;
  const lines = bundleLines(p, catalog, locale);
  const gallery = galleryOf(p);
  const anchor = bundleAnchorAgorot(p, catalog.products);
  const order = `${links.whatsapp}?text=${encodeURIComponent(fill(t.product.orderText, { product: clean(title) }))}`;
  const url = `${SITE_URL}${localePath(locale, `/products/${p.slug}`)}`;

  return (
    <>
      <ShopHeader locale={locale} name={settings.business.name} />
      <main id="main" tabIndex={-1} className="shop-page">
        <div className="wrap">
          <Link href={localePath(locale, "/products")} className="text-link">{t.product.back}</Link>

          <div className="product-layout mt-8">
            <ProductGallery images={gallery} label={t.product.photos} photo={t.product.photo} />

            <div className="product-info">
              <h1 className="t-h2">{title}</h1>
              {summary && <p className="t-lead soft mt-3">{summary}</p>}
              <p className="product-price mt-6">{price}</p>
              {anchor != null && <p className="soft mt-1">{fill(t.product.insteadOf, { price: agorotText(anchor) })}</p>}

              <AddToCart
                product={{ id: p.id, kind: p.kind, title: clean(title), href: localePath(locale, `/products/${p.slug}`), thumb: gallery[0]?.thumb ?? null }}
                variants={p.variants.map((v) => ({ id: v.id, label: clean(pick(v.label, locale)), priceAgorot: v.priceAgorot, available: v.available, servings: servingsText(v.servings, t.product) }))}
                cartHref={localePath(locale, "/cart")}
                t={{ ...t.product, decrease: t.cart.decrease, increase: t.cart.increase }}
              />

              <a href={order} target="_blank" rel="noopener" className="text-link product-ask">
                <WhatsAppIcon />
                {t.product.orAsk}
              </a>

              {lines.length > 0 && (
                <section className="product-section" aria-labelledby="bundle">
                  <h2 id="bundle" className="product-h">{t.product.bundle}</h2>
                  <ul className="legal-list">
                    {lines.map((l) => (
                      <li key={l.key}>
                        <bdi>{l.quantity}</bdi> × <Link href={l.href} className="text-link">{l.title}</Link> <span className="soft">({l.size})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {description && <p className="product-description">{description}</p>}

              <section className="product-section" aria-labelledby="kosher">
                <h2 id="kosher" className="product-h">{t.product.kosher}</h2>
                <p>
                  {p.kosher === "parve" ? t.product.parve : t.product.dairy}
                  {authority && <span className="soft"> · {fill(t.product.kosherBy, { authority })}</span>}
                </p>
              </section>

              {diet.length > 0 && (
                <section className="product-section" aria-labelledby="diet">
                  <h2 id="diet" className="product-h">{t.product.diet}</h2>
                  <ul className="legal-list">
                    {diet.map((d) => <li key={d}>{t.dietLong[d]}</li>)}
                  </ul>
                </section>
              )}

              {p.allergens.length > 0 && (
                <section className="product-section" aria-labelledby="allergens">
                  <h2 id="allergens" className="product-h">{t.product.contains}</h2>
                  <p>{p.allergens.map((a) => t.allergens[a]).join(", ")}</p>
                </section>
              )}
              <p className="soft mt-4 text-[15px]">{t.product.allergenNote}</p>
            </div>
          </div>
        </div>
      </main>
      <Footer settings={settings} links={links} />
      <ProductJsonLd
        name={title}
        description={pick(p.seoDescription, locale) || summary}
        url={url}
        images={gallery.map((g) => g.src)}
        brand={settings.business.name}
        prices={prices}
      />
    </>
  );
}
