import { getSettings } from "@/sanity/content";

// "הגדרות כלליות" ב-Studio: הדף שלא נמצא
export default async function NotFound() {
  const settings = await getSettings();
  const c = settings.notFound;
  return (
    <main id="main" className="simple-page flex min-h-[80svh] items-center justify-center">
      <div className="wrap text-center">
        <img src="/brand/logo.svg" alt={settings.business.wordmark} width={120} height={120} className="mx-auto" />
        <h1 className="t-h2 mt-8">{c.title}</h1>
        <p className="soft mt-3">{c.text}</p>
        <a href="/" className="btn-primary mt-8">{c.back}</a>
      </div>
    </main>
  );
}
