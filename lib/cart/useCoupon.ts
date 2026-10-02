"use client";
/*
  The cart's coupon, checked on the server once (app/[locale]/cart/actions.ts): when it's applied,
  and once when a page opens with one stored. A valid code returns its terms, which the page's
  estimate then includes; an invalid one is taken out of the cart. The cart and the checkout share
  this, so they show the same thing. The order itself checks the coupon again, from scratch.
*/
import { useEffect, useState } from "react";
import { type PublicCouponTerms, quoteCart, type QuoteResult } from "@/app/[locale]/cart/actions";
import { useCart } from "./store";

export type CouponProblem = "invalid" | "busy" | "error";

export function useCoupon(ready: boolean) {
  const coupon = useCart((s) => s.coupon);
  const hasItems = useCart((s) => s.items.length > 0);
  const [checked, setChecked] = useState<{ code: string; terms: PublicCouponTerms } | null>(null);
  const [problem, setProblem] = useState<CouponProblem | null>(null);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !coupon || !hasItems || checked?.code === coupon) return;
    let live = true;
    setChecking(true);
    const lines = useCart.getState().items.map(({ productId, variantId, qty }) => ({ productId, variantId, qty }));
    quoteCart({ lines, coupon, delivery: null })
      .catch((): QuoteResult => ({ ok: false, error: "error" }))
      .then((result) => {
        if (!live) return;
        setChecking(false);
        if (result.ok && result.coupon) {
          setChecked({ code: coupon, terms: result.coupon });
          setProblem(null);
          return;
        }
        setChecked(null);
        if (!result.ok && result.error !== "invalid") setProblem(result.error);
        else {
          setProblem("invalid");
          useCart.getState().setCoupon("");
        }
      });
    return () => {
      live = false;
      setChecking(false);
    };
  }, [ready, coupon, hasItems, attempt, checked?.code]);

  return {
    coupon,
    terms: checked && checked.code === coupon ? checked.terms : null,
    problem,
    checking,
    apply(code: string) {
      setProblem(null);
      useCart.getState().setCoupon(code.trim().slice(0, 64));
      setAttempt((n) => n + 1);
    },
    remove() {
      useCart.getState().setCoupon("");
      setChecked(null);
      setProblem(null);
    },
  };
}
