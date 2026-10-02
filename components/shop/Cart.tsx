"use client";
/*
  The cart page's body. The lines come from the browser's cart (ids, quantities and names only);
  the prices from the catalog the page was rendered with (lib/shop/pricebook.ts), through the same
  pricing engine the server uses. So the sum here is an honest estimate that updates as you type,
  and the checkout prices it again on the server, from Sanity, at the moment of the order.

  A coupon is checked on the server once (app/[locale]/cart/actions.ts): a valid one returns its
  terms, and from then on the estimate includes it. The promo and a coupon never add up: the
  better one applies, and the cart says so.
*/
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { Messages } from "@/lib/i18n/messages";
import { type CartItem, useCart, useCartReady } from "@/lib/cart/store";
import { useCoupon } from "@/lib/cart/useCoupon";
import { priceCart } from "@/lib/pricing/engine";
import type { PriceBook } from "@/lib/shop/pricebook";
import { agorotText } from "@/lib/price";
import { fill } from "@/lib/text";
import QtyStepper from "./QtyStepper";

type T = Messages["cart"];

const linesOf = (items: CartItem[]) => items.map(({ productId, variantId, qty }) => ({ productId, variantId, qty }));

export default function Cart({ book, t, shopHref, checkoutHref }: { book: PriceBook; t: T; shopHref: string; checkoutHref: string }) {
  const ready = useCartReady();
  const items = useCart((s) => s.items);
  const { coupon, terms, problem, checking, apply, remove: removeCoupon } = useCoupon(ready);
  const [removed, setRemoved] = useState<string[]>([]);
  const byId = useMemo(() => new Map(book.products.map((p) => [p.id, p])), [book.products]);
  const hasItems = items.length > 0;
  const couponError = problem === "busy" ? t.tooMany : problem === "error" ? t.error : problem === "invalid" ? t.couponInvalid : null;

  // once the stored cart is read: drop lines whose product or size is gone or not available now
  useEffect(() => {
    if (!ready) return;
    const available = (productId: string, variantId: string) => !!byId.get(productId)?.variants.find((v) => v.id === variantId)?.available;
    const gone = useCart.getState().items.filter((i) => !available(i.productId, i.variantId));
    if (gone.length === 0) return;
    useCart.getState().reconcile(available);
    setRemoved(gone.map((i) => byId.get(i.productId)?.title ?? i.title));
  }, [ready, byId]);

  const quote = useMemo(
    () => priceCart({ lines: linesOf(items), products: book.products, settings: book.settings, coupon: terms && { id: "coupon", ...terms }, now: new Date() }),
    [items, book, terms],
  );

  function applyCoupon(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("coupon") ?? "").trim();
    if (code) apply(code);
    else removeCoupon();
  }

  if (!ready) return <div className="cart-loading" aria-busy="true" />;

  if (!hasItems) {
    return (
      <div className="catalog-none">
        {removed.map((name) => <p key={name} role="status">{fill(t.removed, { product: name })}</p>)}
        <p>{t.empty}</p>
        <Link href={shopHref} className="btn-primary mt-6">{t.emptyCta}</Link>
      </div>
    );
  }

  const promoLabel = book.settings?.promoLabel ?? t.discount;
  const discount = quote.discount;
  const discountLabel = discount?.source === "coupon" ? `${t.discount} · ${coupon}` : promoLabel;
  const zone = quote.freeDelivery && book.settings?.zones.find((z) => z.id === quote.freeDelivery?.zoneId);
  const hasBundle = quote.lines.some((l) => l.kind === "bundle");

  let couponNote: string | null = couponError;
  if (terms) {
    if (quote.couponUnmet) couponNote = t.couponUnmet;
    else if (discount?.source !== "coupon") couponNote = fill(t.couponNotBetter, { promo: promoLabel });
    else couponNote = t.couponApplied;
  }

  return (
    <div className="cart-layout">
      <div>
        {removed.length > 0 && (
          <div className="cart-notice" role="status">
            {removed.map((name) => <p key={name}>{fill(t.removed, { product: name })}</p>)}
          </div>
        )}
        <ul className="cart-lines">
          {items.map((item) => {
            const p = byId.get(item.productId);
            const unit = p?.variants.find((v) => v.id === item.variantId)?.priceAgorot;
            if (!p || unit == null) return null;
            const label = p.variantLabels[item.variantId] ?? item.variantLabel;
            const thumb = p.thumb ?? item.thumb;
            return (
              <li key={`${item.productId}:${item.variantId}`} className="cart-line">
                <Link href={p.href} className="cart-thumb" tabIndex={-1} aria-hidden>
                  {thumb && <img src={thumb} alt="" width={96} height={96} loading="lazy" decoding="async" />}
                </Link>
                <div className="cart-line-main">
                  <Link href={p.href} className="cart-line-title">{p.title}</Link>
                  {p.kind === "single" && label && <p className="soft text-[15px]">{label}</p>}
                  <div className="cart-line-tools">
                    <QtyStepper
                      value={item.qty}
                      onChange={(n) => useCart.getState().setQty(item.productId, item.variantId, n)}
                      label={`${t.qty}: ${p.title}`}
                      decrease={t.decrease}
                      increase={t.increase}
                    />
                    <button type="button" className="cart-remove" onClick={() => useCart.getState().remove(item.productId, item.variantId)}>
                      {t.remove}
                      <span className="sr-only"> {p.title}</span>
                    </button>
                  </div>
                </div>
                <div className="cart-line-price">
                  <span>{agorotText(unit * item.qty)}</span>
                  {p.anchorAgorot != null && <span className="soft block text-[14px] font-normal">{fill(t.insteadOf, { price: agorotText(p.anchorAgorot * item.qty) })}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="cart-summary" aria-labelledby="cart-summary-h">
        <h2 id="cart-summary-h" className="sr-only">{t.total}</h2>
        <dl className="cart-sums">
          <div>
            <dt>{t.subtotal}</dt>
            <dd>{agorotText(quote.subtotalAgorot)}</dd>
          </div>
          {discount && (
            <div className="cart-discount">
              <dt>{discountLabel}</dt>
              <dd><bdi>−{agorotText(discount.amountAgorot)}</bdi></dd>
            </div>
          )}
          <div>
            <dt>{t.delivery}</dt>
            <dd className="soft font-normal">{t.deliveryLater}</dd>
          </div>
          <div className="cart-total">
            <dt>{t.total}</dt>
            <dd>{agorotText(quote.totalAgorot)}</dd>
          </div>
        </dl>

        {quote.freeDelivery && zone && <p className="cart-nudge">{fill(t.freeDelivery, { amount: agorotText(quote.freeDelivery.remainingAgorot), zone: zone.name })}</p>}

        <form className="cart-coupon" onSubmit={applyCoupon} noValidate>
          <label htmlFor="cart-coupon" className="cart-coupon-label">{t.coupon}</label>
          <div className="cart-coupon-row">
            <input id="cart-coupon" name="coupon" defaultValue={coupon} key={coupon} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} dir="ltr" className="cart-input" aria-describedby="cart-coupon-note" />
            <button type="submit" className="cart-coupon-btn" disabled={checking}>{checking ? t.busy : t.couponApply}</button>
          </div>
          <p id="cart-coupon-note" className="cart-coupon-note" role="status" data-error={couponError ? "" : undefined}>
            {couponNote}
            {terms && (
              <>
                {" "}
                <button type="button" className="cart-remove" onClick={removeCoupon}>{t.couponRemove}</button>
              </>
            )}
          </p>
        </form>

        {hasBundle && (discount || terms) && <p className="soft text-[14px] mt-3">{t.bundleNote}</p>}
        <p className="soft text-[14px] mt-3">{t.estimate}</p>
        <Link href={checkoutHref} className="btn-primary cart-checkout">{t.checkout}</Link>
        <Link href={shopHref} className="text-link mt-4 inline-block">{t.continue}</Link>
      </aside>
    </div>
  );
}
