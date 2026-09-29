"use client";
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// A render error that no nearer error boundary caught. Reported to Sentry, then the same screen
// Next.js shows without this file.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
