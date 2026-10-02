import "server-only";
import { notFound } from "next/navigation";
import { activeLocales, isLocale, type Locale } from "./config";

/**
 * The language of a page under app/[locale], checked: a language that doesn't exist, or isn't
 * switched on (NEXT_PUBLIC_LOCALES), is a 404. Every page checks for itself, since Next renders a
 * page alongside its layout and doesn't wait for the layout's check.
 */
export async function routeLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale) || !activeLocales().includes(locale)) notFound();
  return locale;
}
