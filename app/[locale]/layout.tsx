import type { Metadata, Viewport } from "next";
import { draftMode } from "next/headers";
import "../globals.css";
import PreviewEditing from "@/components/cms/PreviewEditing";
import SmoothScroll from "@/components/SmoothScroll";
import { activeLocales, dir, OG_LOCALE } from "@/lib/i18n/config";
import { routeLocale } from "@/lib/i18n/route";
import { getSettings } from "@/sanity/content";

// כל שפה פעילה נבנית מראש. שפה שלא הופעלה (NEXT_PUBLIC_LOCALES) מחזירה 404, גם אם הקידומת שלה בכתובת
export function generateStaticParams() {
  return activeLocales().map((locale) => ({ locale }));
}

// שם האתר בלשונית, התיאור לגוגל והתצוגה המקדימה כששולחים קישור: "הגדרות כלליות" ב-Studio
export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const [locale, { seo }] = await Promise.all([routeLocale(params), getSettings(false)]);
  return {
    // TODO: להחליף בדומיין האמיתי לפני העלאה
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: seo.title,
    description: seo.description,
    openGraph: {
      title: seo.title,
      description: seo.description,
      images: [{ url: "/images/og.jpg", width: 1200, height: 630 }],
      locale: OG_LOCALE[locale],
      type: "website",
    },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FCF8F5" };

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const [locale, settings, draft] = await Promise.all([routeLocale(params), getSettings(), draftMode()]);
  return (
    <html lang={locale} dir={dir(locale)} suppressHydrationWarning>
      <head>
        {/* מסמן שיש JS כדי שמצב ההתחלה של ה-mask reveal לא יהבהב */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500&family=Noto+Serif+Hebrew:wght@500&display=swap"
        />
      </head>
      <body>
        <a href="#main" className="skip-link">{settings.skipLink}</a>
        <SmoothScroll>{children}</SmoothScroll>
        {/* רק בתצוגה המקדימה של ה-Studio: לחיצה על טקסט פותחת את השדה שלו (CMS.md). באתר עצמו: כלום */}
        {draft.isEnabled && <PreviewEditing />}
      </body>
    </html>
  );
}
