"use client";
/*
  The two moving parts of the order page: the "pay" button (a fresh Grow page each time, through
  a server action that checks the link's signature), and a quiet refresh while a payment that just
  happened is being confirmed (Grow tells our server, not the browser).
*/
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { payOrder } from "@/app/[locale]/order/[code]/actions";

export function PayButton({ locale, code, token, label, failed, expired }: { locale: string; code: string; token: string; label: string; failed: string; expired: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const result = await payOrder(locale, { code, token });
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      setError(result.error === "expired" ? expired : failed);
    } catch {
      setError(failed);
    }
    setBusy(false);
  }
  return (
    <div className="mt-6">
      <button type="button" className="btn-primary" onClick={pay} disabled={busy} aria-busy={busy}>
        {label}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Refreshes the page every few seconds for up to two minutes, until the payment shows */
export function RefreshWhilePaying() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      if (++n > 30) window.clearInterval(id);
      else router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}
