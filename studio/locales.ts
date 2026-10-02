/**
 * The site's languages. Hebrew is the site's own and always required; English and Russian are
 * ready in every shop field but stay hidden in the Studio until they're switched on, so the owner
 * isn't asked to fill in languages the site doesn't show yet.
 *
 * Switching one on: SANITY_STUDIO_EXTRA_LOCALES=en,ru in studio/.env (and .env.production),
 * restart or redeploy the Studio, and set NEXT_PUBLIC_LOCALES the same way on the site.
 */
export const LOCALES = [
  { id: "he", title: "עברית", dir: "rtl" },
  { id: "en", title: "English", dir: "ltr" },
  { id: "ru", title: "Русский", dir: "ltr" },
] as const;

export type LocaleId = (typeof LOCALES)[number]["id"];
export const DEFAULT_LOCALE: LocaleId = "he";

const requested = (process.env.SANITY_STUDIO_EXTRA_LOCALES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** The languages shown in the Studio: Hebrew, and whichever of the others are switched on */
export const ENABLED_LOCALES = new Set<LocaleId>([
  DEFAULT_LOCALE,
  ...LOCALES.map((l) => l.id).filter((id) => id !== DEFAULT_LOCALE && requested.includes(id)),
]);

export const isLtrLocale = (id: string) => LOCALES.some((l) => l.id === id && l.dir === "ltr");
