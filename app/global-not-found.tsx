import type { Metadata } from "next";
import "./globals.css";
import { getSettings } from "@/sanity/content";

// כתובת שלא מתאימה לשום דף (או שפה שלא הופעלה). כל הדפים יושבים תחת app/[locale], ולכן אין כאן
// layout: הדף בונה את המסמך כולו בעצמו. הטקסטים מ"הגדרות כלליות", כמו app/[locale]/not-found.tsx
export async function generateMetadata(): Promise<Metadata> {
  const { notFound, business } = await getSettings(false);
  return { title: `${notFound.title} | ${business.name}` };
}

export default async function GlobalNotFound() {
  const settings = await getSettings(false);
  const c = settings.notFound;
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500&family=Noto+Serif+Hebrew:wght@500&display=swap" />
      </head>
      <body>
        <main id="main" className="simple-page flex min-h-[80svh] items-center justify-center">
          <div className="wrap text-center">
            <img src="/brand/logo.svg" alt={settings.business.wordmark} width={120} height={120} className="mx-auto" />
            <h1 className="t-h2 mt-8">{c.title}</h1>
            <p className="soft mt-3">{c.text}</p>
            <a href="/" className="btn-primary mt-8">{c.back}</a>
          </div>
        </main>
      </body>
    </html>
  );
}
