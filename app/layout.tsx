import type { Metadata, Viewport } from "next";
import { draftMode } from "next/headers";
import "./globals.css";
import PreviewEditing from "@/components/cms/PreviewEditing";
import SmoothScroll from "@/components/SmoothScroll";
import { getSettings } from "@/sanity/content";

// שם האתר בלשונית, התיאור לגוגל והתצוגה המקדימה כששולחים קישור: "הגדרות כלליות" ב-Studio
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSettings(false);
  return {
    // TODO: להחליף בדומיין האמיתי לפני העלאה
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: seo.title,
    description: seo.description,
    openGraph: {
      title: seo.title,
      description: seo.description,
      images: [{ url: "/images/og.jpg", width: 1200, height: 630 }],
      locale: "he_IL",
      type: "website",
    },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FCF8F5" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, draft] = await Promise.all([getSettings(), draftMode()]);
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
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
