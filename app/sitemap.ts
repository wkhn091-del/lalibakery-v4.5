import type { MetadataRoute } from "next";
import { activeLocales, DEFAULT_LOCALE, localePath } from "@/lib/i18n/config";
import { getShopCatalog } from "@/sanity/shop";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// מתרענן כמו הדפים: כשהבעלים מפרסמת (app/api/revalidate) או לכל המאוחר אחרי שעה
export const revalidate = 3600;

/** a page of the shop, with its address in every language that's on */
function shopEntry(path: string, priority: number): MetadataRoute.Sitemap[number] {
  const locales = activeLocales();
  return {
    url: `${SITE_URL}${localePath(DEFAULT_LOCALE, path)}`,
    changeFrequency: "weekly",
    priority,
    ...(locales.length > 1 ? { alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${SITE_URL}${localePath(l, path)}`])) } } : {}),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products } = await getShopCatalog({ published: true });
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    shopEntry("/products", 0.9),
    ...products.map((p) => shopEntry(`/products/${p.slug}`, 0.7)),
    { url: `${SITE_URL}/custom-cake`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/accessibility`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
