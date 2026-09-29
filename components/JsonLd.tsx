import { linksOf } from "@/lib/content/contact";
import type { SiteSettings, SocialKey } from "@/lib/content/types";
import { clean } from "@/lib/stega";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SOCIAL: SocialKey[] = ["instagram", "facebook", "tiktok"];

// נתונים מובנים לגוגל: שם, טלפון ושעות, כדי שיופיעו בתוצאות החיפוש ובמפות.
// (בתצוגה המקדימה של ה-Studio הטקסטים מגיעים עם תווים בלתי נראים; כאן הם מנוקים, כי זה לא טקסט שלוחצים עליו)
export default function JsonLd({ settings, siteUrl }: { settings: SiteSettings; siteUrl: string }) {
  const business = settings.business;
  const data = clean({
    "@context": "https://schema.org",
    "@type": "Bakery",
    name: business.name,
    description: settings.seo.description,
    url: siteUrl,
    image: `${siteUrl}/images/og.jpg`,
    logo: `${siteUrl}/brand/logo-512.png`,
    telephone: linksOf(business).phoneIntl,
    email: business.email,
    ...(clean(business.address).trim() ? { address: business.address } : {}),
    openingHoursSpecification: business.hours
      .filter((h) => h.open && h.close)
      .map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.days.map((d) => DAYS[d]), opens: h.open, closes: h.close })),
    sameAs: SOCIAL.map((id) => business.social[id].url).filter(Boolean),
  });
  // "<" escaped: the texts come from the CMS now, and a "</script>" typed in one mustn't end the tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
