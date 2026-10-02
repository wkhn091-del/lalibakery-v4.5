/*
  The site's languages. Hebrew is the site's own: every text exists in Hebrew, and any other
  language falls back to it, field by field, so a page is never missing a word.

  English and Russian are built in from day one (every shop field in the Studio has them, and the
  pages take a language) but stay off until the owner's texts are ready:
    NEXT_PUBLIC_LOCALES=he,en,ru       on the site (Vercel), and
    SANITY_STUDIO_EXTRA_LOCALES=en,ru  in the Studio, so the owner sees the fields to fill in.
  Not a secret: it only says which languages the site shows.
*/

export const LOCALES = ["he", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "he";

/** A text in every language, as the Studio stores it ({ he, en, ru }); only Hebrew is ever required */
export type Localized<T = string> = Partial<Record<Locale, T>>;

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** The languages the site shows: Hebrew, and whichever of the others NEXT_PUBLIC_LOCALES lists */
export function activeLocales(setting = process.env.NEXT_PUBLIC_LOCALES): Locale[] {
  const listed = new Set((setting ?? "").split(",").map((s) => s.trim()));
  return LOCALES.filter((l) => l === DEFAULT_LOCALE || listed.has(l));
}

export const dir = (locale: Locale): "rtl" | "ltr" => (locale === "he" ? "rtl" : "ltr");

/** For Open Graph (the preview when a link is shared) */
export const OG_LOCALE: Record<Locale, string> = { he: "he_IL", en: "en_US", ru: "ru_RU" };

/*
  Addresses: Hebrew has none of its own (/products), the others start with theirs (/en/products).
  next.config.ts serves an address without a language as Hebrew, and sends /he/... back to the
  address without it, so every page has one address per language.
*/

/** A page's address in this language: path is the Hebrew one ("/", "/products/x?y=1") */
export function localePath(locale: Locale, path: string): string {
  const own = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return own;
  return own === "/" ? `/${locale}` : own.startsWith("/?") ? `/${locale}${own.slice(1)}` : `/${locale}${own}`;
}

/** For a page's metadata: its own address, and the same page in each language that's on (for Google) */
export function alternatesFor(locale: Locale, path: string, locales: Locale[] = activeLocales()) {
  return {
    canonical: localePath(locale, path),
    languages: Object.fromEntries([...locales.map((l) => [l, localePath(l, path)]), ["x-default", localePath(DEFAULT_LOCALE, path)]]),
  };
}

/** The language of an address as the browser shows it, and the address without it */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first = "", ...rest] = pathname.split("/");
  if (first !== DEFAULT_LOCALE && isLocale(first)) return { locale: first, path: `/${rest.join("/")}` };
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** The text in this language, or in Hebrew when it isn't filled in */
export function pick(value: Localized | null | undefined, locale: Locale): string {
  const own = value?.[locale];
  if (typeof own === "string" && own.trim()) return own;
  const he = value?.[DEFAULT_LOCALE];
  return typeof he === "string" ? he : "";
}

/** The same, for formatted text (the legal pages): this language's paragraphs, or the Hebrew ones */
export function pickBlocks<T>(value: Localized<T[]> | null | undefined, locale: Locale): T[] {
  const own = value?.[locale];
  if (Array.isArray(own) && own.length) return own;
  const he = value?.[DEFAULT_LOCALE];
  return Array.isArray(he) ? he : [];
}
