import { redirect } from "next/navigation";
import Hero from "@/components/sections/Hero";
import Pain from "@/components/sections/Pain";
import Failed from "@/components/sections/Failed";
import Mechanism from "@/components/sections/Mechanism";
import Proof from "@/components/sections/Proof";
import Deliverables from "@/components/sections/Deliverables";
import Start from "@/components/sections/Start";
import Objections from "@/components/sections/Objections";
import Closing from "@/components/sections/Closing";
import Footer from "@/components/sections/Footer";
import BackgroundShift from "@/components/BackgroundShift";
import FloatingCta from "@/components/FloatingCta";
import SiteHeader from "@/components/SiteHeader";
import JsonLd from "@/components/JsonLd";
import { GALLERY } from "@/content";
import { linksOf } from "@/lib/content/contact";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";
import { routeLocale } from "@/lib/i18n/route";
import { getHome, getSettings } from "@/sanity/content";
import { getGallery } from "@/sanity/data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// דף סטטי (ISR): נבנה מראש, ונבנה מחדש כשהבעלים מפרסמת שינוי ב-CMS (app/api/revalidate),
// או לכל המאוחר אחרי שעה אם ההודעה על השינוי לא הגיעה.
export const revalidate = 3600;

export default async function Page({ params }: PageProps<"/[locale]">) {
  // הטקסטים של הדף הזה עוד בעברית בלבד: בשפה אחרת, הכתובת העברית
  if ((await routeLocale(params)) !== DEFAULT_LOCALE) redirect("/");
  // הטקסטים ("הגדרות כלליות", "דף הבית") והעוגות בגלריה, מה-CMS.
  // כשה-CMS לא מוגדר או לא זמין: מה שכתוב ב-content.ts
  const [settings, home, gallery] = await Promise.all([getSettings(), getHome(), getGallery()]);
  const business = settings.business;
  const links = linksOf(business);
  const { nav } = messages(DEFAULT_LOCALE);
  return (
    <>
      <SiteHeader
        header={settings.header}
        name={business.name}
        phone={business.phone}
        tel={links.tel}
        cart={{ href: "/cart", label: nav.cart, labelWithCount: nav.cartWithCount }}
      />
      <main id="main" tabIndex={-1}>
        <Hero c={home.hero} wordmark={business.wordmark} logoAlt={business.logoAlt} />
        <Pain c={home.pain} />
        <Failed c={home.failed} />
        <Mechanism c={home.mechanism} />
        <Proof c={home.proof} items={gallery ?? GALLERY} />
        <Deliverables c={home.deliverables} />
        <Start c={home.start} />
        <Objections c={home.faq} phone={business.phone} whatsapp={links.whatsapp} tel={links.tel} />
        <Closing c={home.closing} />
      </main>
      <Footer settings={settings} links={links} />
      {/* נרשם אחרון, אחרי שכל הסקשנים קיימים */}
      <BackgroundShift />
      <FloatingCta href={links.whatsapp} label={settings.floatingCta} />
      <JsonLd settings={settings} siteUrl={SITE_URL} />
    </>
  );
}
