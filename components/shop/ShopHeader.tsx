import Link from "next/link";
import { activeLocales, localePath, type Locale } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";
import { ORDER_PAGE } from "@/lib/routes";
import CartLink from "./CartLink";
import LanguageSwitcher from "./LanguageSwitcher";

// The bar on top of the shop's pages: the logo back home, the shop, the cake builder, the cart, the languages
export default function ShopHeader({ locale, name }: { locale: Locale; name: string }) {
  const t = messages(locale);
  const locales = activeLocales();
  return (
    <header className="shop-header">
      <div className="wrap shop-header-inner">
        <a href={localePath(locale, "/")} className="brand-link">
          <img src="/brand/logo.svg" alt="" width={40} height={40} className="brand-mark" />
          <span className="brand-name">{name}</span>
        </a>
        <nav aria-label={t.nav.label} className="shop-nav">
          <Link href={localePath(locale, "/products")} className="nav-link">{t.nav.shop}</Link>
          <a href={ORDER_PAGE} className="nav-link">{t.nav.custom}</a>
          <CartLink href={localePath(locale, "/cart")} label={t.nav.cart} labelWithCount={t.nav.cartWithCount} />
        </nav>
        {locales.length > 1 && <LanguageSwitcher locale={locale} locales={locales} names={t.languageNames} label={t.nav.language} />}
      </div>
    </header>
  );
}
