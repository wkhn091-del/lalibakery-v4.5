import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CakeBuilder from "@/components/CakeBuilder";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { routeLocale } from "@/lib/i18n/route";
import { ORDER_PAGE } from "@/lib/routes";
import { getCakePage, getSettings } from "@/sanity/content";

// "דף הזמנת עוגה" ב-Studio (הכותרת והתיאור), עם שם העסק מ"הגדרות כלליות"
export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([getCakePage(false), getSettings(false)]);
  const title = `${page.seo.title} | ${settings.business.name}`;
  return {
    title,
    description: page.seo.description,
    alternates: { canonical: ORDER_PAGE },
    // תצוגה מקדימה משלו כששולחים את הקישור (למשל בוואטסאפ)
    openGraph: {
      title,
      description: page.seo.description,
      url: ORDER_PAGE,
      images: [{ url: "/images/og.jpg", width: 1200, height: 630 }],
      locale: "he_IL",
      type: "website",
    },
  };
}

// סטטי (ISR), כמו דף הבית: הקטלוג והטקסטים מה-CMS נטענים בבנייה, ומתרעננים כשהבעלים מפרסמת שינוי
// (app/api/revalidate) או לכל המאוחר אחרי שעה. בלי CMS: הקטלוג והטקסטים המובנים.
export const revalidate = 3600;

// באותה מסגרת כמו שאר הדפים הפנימיים (הצהרת הנגישות): לוגו שחוזר לדף הבית, התוכן, וקישור חזרה.
// הרוחב של השורות האלה זהה לרוחב של הבונה, כדי שהקצוות יתיישרו.
export default async function CustomCakePage({ params }: PageProps<"/[locale]/custom-cake">) {
  // הבונה עוד בעברית בלבד: בשפה אחרת, הכתובת העברית
  if ((await routeLocale(params)) !== DEFAULT_LOCALE) redirect(ORDER_PAGE);
  const [page, settings] = await Promise.all([getCakePage(), getSettings()]);
  return (
    <main id="main" className="simple-page">
      <div className="wrap max-w-[1240px]">
        <a href="/" className="brand-link">
          <img src="/brand/logo.svg" alt="" width={48} height={48} />
          <span className="brand-name">{settings.business.name}</span>
        </a>
        {/* כותרת הדף לקוראי מסך; הכותרת הגלויה היא של הבונה */}
        <h1 className="sr-only">{page.heading}</h1>
      </div>

      <CakeBuilder />

      <div className="wrap max-w-[1240px]">
        <a href="/" className="text-link mt-12 inline-flex">
          {page.back}
        </a>
      </div>
    </main>
  );
}
