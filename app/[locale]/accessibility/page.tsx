import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { linksOf } from "@/lib/content/contact";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { routeLocale } from "@/lib/i18n/route";
import { getSettings } from "@/sanity/content";

export async function generateMetadata(): Promise<Metadata> {
  const { accessibility, business } = await getSettings(false);
  return { title: `${accessibility.title} | ${business.name}` };
}

// "הגדרות כלליות" ב-Studio (הצהרת הנגישות ופרטי הקשר). מתרענן כמו שאר הדפים (app/api/revalidate)
export const revalidate = 3600;

export default async function AccessibilityPage({ params }: PageProps<"/[locale]/accessibility">) {
  // ההצהרה עוד בעברית בלבד: בשפה אחרת, הכתובת העברית
  if ((await routeLocale(params)) !== DEFAULT_LOCALE) redirect("/accessibility");
  const settings = await getSettings();
  const a = settings.accessibility;
  const business = settings.business;
  const links = linksOf(business);
  return (
    <main id="main" className="simple-page">
      <div className="wrap max-w-[760px]">
        <a href="/" className="brand-link">
          <img src="/brand/logo.svg" alt="" width={48} height={48} />
          <span className="brand-name">{business.name}</span>
        </a>
        <h1 className="t-h2 mt-12">{a.title}</h1>
        <p className="t-lead mt-4">{a.intro}</p>

        <h2 className="mt-12 text-[21px] font-medium">{a.doneTitle}</h2>
        <ul className="legal-list mt-4">
          {a.done.map((d, i) => <li key={i}>{d}</li>)}
        </ul>

        <h2 className="mt-12 text-[21px] font-medium">{a.contactTitle}</h2>
        <p className="mt-3">{a.contactText}</p>
        <ul className="mt-4 space-y-2">
          <li><a className="text-link" href={links.whatsapp} target="_blank" rel="noopener">{a.whatsapp}</a></li>
          <li><a className="text-link" href={links.tel}><bdi dir="ltr">{business.phone}</bdi></a></li>
          <li><a className="text-link" href={links.mail}><bdi dir="ltr">{business.email}</bdi></a></li>
        </ul>
        <p className="soft mt-8 text-[15px]">{a.coordinatorLabel}: {a.coordinator}</p>
        <p className="soft text-[15px]">{a.updatedLabel}: {a.updated}</p>

        <a href="/" className="text-link mt-12 inline-flex">{a.back}</a>
      </div>
    </main>
  );
}
