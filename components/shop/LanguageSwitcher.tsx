"use client";
import { usePathname } from "next/navigation";
import { localePath, type Locale, splitLocale } from "@/lib/i18n/config";

// The same page in the other languages. Shown only when more than one language is switched on.
export default function LanguageSwitcher({ locale, locales, names, label }: { locale: Locale; locales: Locale[]; names: Record<Locale, string>; label: string }) {
  const { path } = splitLocale(usePathname());
  return (
    <nav aria-label={label} className="lang-switch">
      {locales.map((l) => (
        <a key={l} href={localePath(l, path)} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined} className="lang-link">
          {names[l]}
        </a>
      ))}
    </nav>
  );
}
