"use client";
/*
  The checkout form. What it sends is ids, quantities, the details typed and the choices made;
  the server prices the order again and decides (app/[locale]/checkout/actions.ts). The sum shown
  here is the same engine's estimate, from the catalog this page was given, so it matches what
  the server will charge unless the owner changed a price in the meantime (then the server says so).

  The fields are checked here too, but only to point at what's missing before a round trip; the
  server checks everything again.
*/
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { type CheckoutError, placeOrder } from "@/app/[locale]/checkout/actions";
import Turnstile, { TURNSTILE_SITE_KEY } from "@/components/Turnstile";
import { useCart, useCartReady } from "@/lib/cart/store";
import { useCoupon } from "@/lib/cart/useCoupon";
import type { OpenDay } from "@/lib/checkout/calendar";
import type { CheckoutField, PaymentMethod } from "@/lib/checkout/input";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { israeliPhone } from "@/lib/phone";
import { priceCart } from "@/lib/pricing/engine";
import type { PriceBook } from "@/lib/shop/pricebook";
import { agorotText } from "@/lib/price";
import { fill } from "@/lib/text";

type T = Messages["checkout"];
type TCart = Pick<Messages["cart"], "subtotal" | "discount" | "delivery" | "deliveryLater" | "total" | "estimate" | "couponNotBetter" | "couponUnmet">;

export type CheckoutProps = {
  locale: Locale;
  book: PriceBook;
  days: OpenDay[];
  windows: { id: string; from: string; to: string }[];
  pickup: { enabled: boolean; note: string };
  online: boolean;
  links: { cart: string; shop: string; terms: string; cancellation: string; privacy: string; whatsapp: string };
  t: T;
  tc: TCart;
};

const ERROR_TEXT: Record<CheckoutError, keyof T["errors"]> = {
  fields: "fields",
  robot: "robot",
  busy: "busy",
  cart: "cart",
  coupon: "coupon",
  date: "date",
  date_full: "dateFull",
  window: "window",
  outside: "outside",
  pickup: "pickup",
  payment: "payment",
  too_many: "tooMany",
  closed: "closed",
  error: "error",
};

const OTHER_CITY = "__other__";

export default function CheckoutForm({ locale, book, days, windows, pickup, online, links, t, tc }: CheckoutProps) {
  const router = useRouter();
  const uid = useId();
  const ready = useCartReady();
  const items = useCart((s) => s.items);
  const { coupon, terms } = useCoupon(ready);

  const [type, setType] = useState<"pickup" | "delivery">(pickup.enabled ? "pickup" : "delivery");
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [windowId, setWindowId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | "">(online ? "online" : "");
  const [other, setOther] = useState(false);
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [bad, setBad] = useState<Set<CheckoutField>>(new Set());
  const [error, setError] = useState<CheckoutError | null>(null);

  const cities = useMemo(
    () =>
      (book.settings?.zones ?? [])
        .flatMap((z) => z.cities.map((c) => ({ city: c, zone: z })))
        .sort((a, b) => a.city.localeCompare(b.city, locale)),
    [book.settings, locale],
  );
  const zone = cities.find((c) => c.city === city)?.zone ?? null;
  const day = days.find((d) => d.date === date) ?? null;
  const dayWindows = windows.filter((w) => day?.windows.includes(w.id));
  const needsWindow = type === "delivery" && windows.length > 0;

  // a window that doesn't exist on the new day, or in-person payment without pickup, is cleared
  useEffect(() => {
    if (windowId && !dayWindows.some((w) => w.id === windowId)) setWindowId(null);
  }, [windowId, dayWindows]);
  useEffect(() => {
    if (payment === "in_person" && type !== "pickup") setPayment("");
  }, [payment, type]);

  const lines = useMemo(() => items.map(({ productId, variantId, qty }) => ({ productId, variantId, qty })), [items]);
  const quote = useMemo(
    () =>
      priceCart({
        lines,
        products: book.products,
        settings: book.settings,
        coupon: terms && { id: "coupon", ...terms },
        delivery: type === "pickup" ? { fulfilment: "pickup" } : city ? { fulfilment: "delivery", city } : null,
        now: new Date(),
      }),
    [lines, book, terms, type, city],
  );
  const byId = useMemo(() => new Map(book.products.map((p) => [p.id, p])), [book.products]);
  const dateText = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }), [locale]);

  if (!ready) return <div className="cart-loading" aria-busy="true" />;
  if (items.length === 0) {
    return (
      <div className="catalog-none">
        <p>{t.empty}</p>
        <Link href={links.shop} className="btn-primary mt-6">{t.editCart}</Link>
      </div>
    );
  }
  if (days.length === 0) {
    return (
      <div className="catalog-none">
        <p>{t.noDates}</p>
        <a href={links.whatsapp} target="_blank" rel="noopener" className="btn-primary mt-6">{t.closedCta}</a>
      </div>
    );
  }

  const outside = type === "delivery" && other;
  const show = (f: CheckoutField) => bad.has(f);
  const errId = (f: string) => `${uid}-${f}-err`;
  const describe = (f: CheckoutField) => (show(f) ? errId(f) : undefined);

  function localCheck(form: HTMLFormElement): Set<CheckoutField> {
    const v = new FormData(form);
    const out = new Set<CheckoutField>();
    if (!/^\S+(?:\s+\S+)+$/.test(String(v.get("name") ?? "").trim())) out.add("name");
    if (!israeliPhone(String(v.get("phone") ?? ""))?.startsWith("+9725")) out.add("phone");
    const email = String(v.get("email") ?? "").trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.add("email");
    if (type === "delivery") {
      if (!zone) out.add("city");
      if (String(v.get("address") ?? "").trim().length < 3) out.add("address");
      if (v.get("other") === "on") {
        if (String(v.get("recipientName") ?? "").trim().length < 2) out.add("recipientName");
        if (!israeliPhone(String(v.get("recipientPhone") ?? ""))) out.add("recipientPhone");
      }
      if (needsWindow && !windowId) out.add("window");
    }
    if (!day || day.status === "full") out.add("date");
    if (!payment) out.add("payment");
    if (v.get("terms") !== "on") out.add("terms");
    return out;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending || outside) return;
    const form = e.currentTarget;
    const problems = localCheck(form);
    setBad(problems);
    if (problems.size > 0) {
      setError("fields");
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    const v = new FormData(form);
    const str = (k: string) => String(v.get(k) ?? "").trim();
    setSending(true);
    setError(null);
    try {
      const result = await placeOrder(locale, {
        lines,
        coupon: coupon || undefined,
        name: str("name"),
        phone: str("phone"),
        email: str("email") || undefined,
        fulfilment:
          type === "pickup"
            ? { type: "pickup" }
            : {
                type: "delivery",
                city,
                address: str("address"),
                notes: str("notes") || undefined,
                windowId: needsWindow ? windowId : null,
                recipient: v.get("other") === "on" ? { name: str("recipientName"), phone: str("recipientPhone") } : undefined,
              },
        date,
        payment,
        terms: true,
        turnstile: token || undefined,
      });
      if (result.ok) {
        useCart.getState().clear();
        window.location.assign(result.href);
        return;
      }
      setError(result.error);
      setBad(new Set(result.fields ?? (result.error === "date" || result.error === "date_full" ? ["date"] : result.error === "window" ? ["window"] : [])));
      if (result.error === "date_full") router.refresh();
    } catch {
      setError("error");
    }
    setSending(false);
    if (TURNSTILE_SITE_KEY) setResetKey((n) => n + 1);
  }

  const discount = quote.discount;
  const deliveryFee = type === "pickup" ? 0 : quote.shipping.status === "zone" ? quote.shipping.feeAgorot : null;
  const total = agorotText(quote.totalAgorot);

  return (
    <form className="checkout-layout" onSubmit={submit} noValidate>
      <div className="checkout-main">
        <fieldset className="checkout-section">
          <legend className="product-h">{t.contact}</legend>
          <Field id={`${uid}-name`} label={t.name} error={show("name") ? t.errors.name : null} errId={errId("name")}>
            <input id={`${uid}-name`} name="name" autoComplete="name" maxLength={80} required className="cart-input" aria-invalid={show("name")} aria-describedby={describe("name")} />
          </Field>
          <Field id={`${uid}-phone`} label={t.phone} hint={t.phoneHint} error={show("phone") ? t.errors.phone : null} errId={errId("phone")}>
            <input id={`${uid}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} dir="ltr" required className="cart-input" aria-invalid={show("phone")} aria-describedby={describe("phone")} />
          </Field>
          <Field id={`${uid}-email`} label={t.email} hint={t.emailHint} error={show("email") ? t.errors.email : null} errId={errId("email")}>
            <input id={`${uid}-email`} name="email" type="email" autoComplete="email" maxLength={254} dir="ltr" className="cart-input" aria-invalid={show("email")} aria-describedby={describe("email")} />
          </Field>
        </fieldset>

        <fieldset className="checkout-section">
          <legend className="product-h">{t.how}</legend>
          <div className="choice-row">
            {pickup.enabled && (
              <label className="choice">
                <input type="radio" name="type" value="pickup" checked={type === "pickup"} onChange={() => setType("pickup")} />
                <span>
                  {t.pickup} <span className="soft">· {t.pickupFree}</span>
                </span>
              </label>
            )}
            {cities.length > 0 && (
              <label className="choice">
                <input type="radio" name="type" value="delivery" checked={type === "delivery"} onChange={() => setType("delivery")} />
                <span>{t.delivery}</span>
              </label>
            )}
          </div>
          {type === "pickup" && pickup.note && <p className="soft mt-3 text-[15px] whitespace-pre-line">{pickup.note}</p>}

          {type === "delivery" && (
            <div className="mt-4">
              <Field id={`${uid}-city`} label={t.city} error={show("city") ? t.errors.city : null} errId={errId("city")}>
                <select
                  id={`${uid}-city`}
                  className="cart-input"
                  value={other ? OTHER_CITY : city}
                  onChange={(e) => {
                    const v = e.target.value;
                    setOther(v === OTHER_CITY);
                    setCity(v === OTHER_CITY ? "" : v);
                  }}
                  aria-invalid={show("city")}
                  aria-describedby={describe("city")}
                >
                  <option value="">{t.cityChoose}</option>
                  {cities.map((c) => (
                    <option key={c.city} value={c.city}>{c.city}</option>
                  ))}
                  <option value={OTHER_CITY}>{t.cityOther}</option>
                </select>
              </Field>
              {outside && <p className="cart-notice mt-2" role="status">{t.outside}</p>}
              {zone && (
                <p className="soft text-[15px] mt-1">
                  {fill(t.zoneFee, { zone: zone.name, fee: agorotText(zone.feeAgorot) })}
                  {zone.freeAboveAgorot != null && <> · {fill(t.zoneFree, { amount: agorotText(zone.freeAboveAgorot) })}</>}
                </p>
              )}
              {!outside && (
                <>
                  <Field id={`${uid}-address`} label={t.address} error={show("address") ? t.errors.address : null} errId={errId("address")}>
                    <input id={`${uid}-address`} name="address" autoComplete="street-address" maxLength={200} className="cart-input" aria-invalid={show("address")} aria-describedby={describe("address")} />
                  </Field>
                  <Field id={`${uid}-notes`} label={t.notes} hint={t.notesHint} error={show("notes") ? t.errors.notes : null} errId={errId("notes")}>
                    <textarea id={`${uid}-notes`} name="notes" maxLength={300} rows={2} className="cart-input cart-textarea" />
                  </Field>
                  <Recipient uid={uid} t={t} show={show} errId={errId} describe={describe} />
                </>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="checkout-section">
          <legend className="product-h">{t.when}</legend>
          <Field id={`${uid}-date`} label={t.date} error={show("date") ? t.errors[error === "date_full" ? "dateFull" : "date"] : null} errId={errId("date")}>
            <select id={`${uid}-date`} className="cart-input" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={show("date")} aria-describedby={describe("date")}>
              <option value="">{t.dateChoose}</option>
              {days.map((d) => (
                <option key={d.date} value={d.date} disabled={d.status === "full"}>
                  {dateText.format(new Date(`${d.date}T00:00:00Z`))}
                  {d.status === "few" ? ` · ${t.few}` : d.status === "full" ? ` · ${t.full}` : ""}
                </option>
              ))}
            </select>
          </Field>
          {needsWindow && day && (
            <div className="mt-4" role="radiogroup" aria-labelledby={`${uid}-window`} aria-describedby={describe("window")}>
              <p id={`${uid}-window`} className="cart-coupon-label">{t.window}</p>
              {dayWindows.length === 0 ? (
                <p className="soft text-[15px]">{t.noWindows}</p>
              ) : (
                <div className="choice-row">
                  {dayWindows.map((w) => (
                    <label key={w.id} className="choice">
                      <input type="radio" name="window" value={w.id} checked={windowId === w.id} onChange={() => setWindowId(w.id)} aria-invalid={show("window")} />
                      <span dir="ltr">{fill(t.windowValue, { from: w.from, to: w.to })}</span>
                    </label>
                  ))}
                </div>
              )}
              {show("window") && <p id={errId("window")} className="field-error">{t.errors.window}</p>}
            </div>
          )}
        </fieldset>

        <fieldset className="checkout-section" aria-describedby={describe("payment")}>
          <legend className="product-h">{t.payment}</legend>
          <div className="choice-list">
            {online && (
              <label className="choice">
                <input type="radio" name="payment" value="online" checked={payment === "online"} onChange={() => setPayment("online")} aria-invalid={show("payment")} />
                <span>
                  {t.payOnline}
                  <span className="soft block text-[14px]">{t.payOnlineNote}</span>
                </span>
              </label>
            )}
            <label className="choice">
              <input type="radio" name="payment" value="whatsapp" checked={payment === "whatsapp"} onChange={() => setPayment("whatsapp")} aria-invalid={show("payment")} />
              <span>{t.payWhatsapp}</span>
            </label>
            <label className="choice">
              <input type="radio" name="payment" value="phone" checked={payment === "phone"} onChange={() => setPayment("phone")} aria-invalid={show("payment")} />
              <span>{t.payPhone}</span>
            </label>
            {type === "pickup" && (
              <label className="choice">
                <input type="radio" name="payment" value="in_person" checked={payment === "in_person"} onChange={() => setPayment("in_person")} aria-invalid={show("payment")} />
                <span>{t.payInPerson}</span>
              </label>
            )}
          </div>
          {payment && <p className="soft mt-3 text-[15px]">{payment === "online" ? t.holdNote : t.payManualNote}</p>}
          {show("payment") && <p id={errId("payment")} className="field-error">{t.errors.payment}</p>}
        </fieldset>

        <div className="checkout-section">
          <label className="choice">
            <input type="checkbox" name="terms" aria-invalid={show("terms")} aria-describedby={describe("terms")} />
            <span>
              <Sentence
                text={t.terms}
                parts={{
                  terms: <a href={links.terms} target="_blank" rel="noopener" className="text-link">{t.termsLink}</a>,
                  cancellation: <a href={links.cancellation} target="_blank" rel="noopener" className="text-link">{t.cancellationLink}</a>,
                }}
              />
            </span>
          </label>
          {show("terms") && <p id={errId("terms")} className="field-error">{t.errors.terms}</p>}
          <p className="soft mt-3 text-[14px]">
            <Sentence text={t.privacy} parts={{ link: <a href={links.privacy} target="_blank" rel="noopener" className="text-link">{t.privacyLink}</a> }} />
          </p>
          <div className="mt-4">
            <Turnstile onToken={setToken} label={t.robot} locale={locale} resetKey={resetKey} />
          </div>
        </div>
      </div>

      <aside className="cart-summary" aria-labelledby={`${uid}-summary`}>
        <h2 id={`${uid}-summary`} className="product-h">{t.summary}</h2>
        <ul className="checkout-items">
          {quote.lines.map((l) => {
            const p = byId.get(l.productId);
            return (
              <li key={`${l.productId}:${l.variantId}`}>
                <span>
                  <bdi>{l.qty}</bdi> × {p?.title}
                  {p?.kind === "single" && p.variantLabels[l.variantId] && <span className="soft"> ({p.variantLabels[l.variantId]})</span>}
                </span>
                <span className="cart-line-price">{agorotText(l.totalAgorot)}</span>
              </li>
            );
          })}
        </ul>
        <Link href={links.cart} className="text-link text-[15px]">{t.editCart}</Link>
        <dl className="cart-sums mt-4">
          <div>
            <dt>{tc.subtotal}</dt>
            <dd>{agorotText(quote.subtotalAgorot)}</dd>
          </div>
          {discount && (
            <div className="cart-discount">
              <dt>{discount.source === "coupon" ? `${tc.discount} · ${coupon}` : (book.settings?.promoLabel ?? tc.discount)}</dt>
              <dd><bdi>−{agorotText(discount.amountAgorot)}</bdi></dd>
            </div>
          )}
          <div>
            <dt>{tc.delivery}</dt>
            <dd className={deliveryFee == null ? "soft font-normal" : undefined}>{deliveryFee == null ? tc.deliveryLater : deliveryFee === 0 ? t.pickupFree : agorotText(deliveryFee)}</dd>
          </div>
          <div className="cart-total">
            <dt>{tc.total}</dt>
            <dd>{total}</dd>
          </div>
        </dl>
        {terms && quote.couponUnmet && <p className="soft text-[14px] mt-2">{tc.couponUnmet}</p>}
        {terms && !quote.couponUnmet && discount?.source !== "coupon" && <p className="soft text-[14px] mt-2">{fill(tc.couponNotBetter, { promo: book.settings?.promoLabel ?? tc.discount })}</p>}

        {error && (
          <div className="checkout-error" role="alert">
            <p>{t.errors[ERROR_TEXT[error]]}</p>
            {(error === "cart" || error === "coupon") && <Link href={links.cart} className="text-link">{t.editCart}</Link>}
            {(error === "too_many" || error === "closed" || error === "error" || error === "outside") && (
              <a href={links.whatsapp} target="_blank" rel="noopener" className="text-link">{t.closedCta}</a>
            )}
          </div>
        )}
        <button type="submit" className="btn-primary cart-checkout" disabled={sending || outside}>
          {sending ? t.sending : fill(payment === "online" ? t.submitOnline : t.submit, { total })}
        </button>
        <p className="soft text-[13px] mt-3">{tc.estimate}</p>
      </aside>
    </form>
  );
}

function Field({ id, label, hint, error, errId, children }: { id: string; label: string; hint?: string; error: string | null; errId: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className="cart-coupon-label">{label}</label>
      {children}
      {hint && !error && <p className="soft text-[13px] mt-1">{hint}</p>}
      {error && <p id={errId} className="field-error">{error}</p>}
    </div>
  );
}

function Recipient({ uid, t, show, errId, describe }: { uid: string; t: T; show: (f: CheckoutField) => boolean; errId: (f: string) => string; describe: (f: CheckoutField) => string | undefined }) {
  const [on, setOn] = useState(false);
  return (
    <div className="mt-3">
      <label className="choice">
        <input type="checkbox" name="other" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>{t.otherRecipient}</span>
      </label>
      {on && (
        <div className="mt-3">
          <Field id={`${uid}-rname`} label={t.recipientName} error={show("recipientName") ? t.errors.recipientName : null} errId={errId("recipientName")}>
            <input id={`${uid}-rname`} name="recipientName" maxLength={80} className="cart-input" aria-invalid={show("recipientName")} aria-describedby={describe("recipientName")} />
          </Field>
          <Field id={`${uid}-rphone`} label={t.recipientPhone} error={show("recipientPhone") ? t.errors.recipientPhone : null} errId={errId("recipientPhone")}>
            <input id={`${uid}-rphone`} name="recipientPhone" type="tel" inputMode="tel" maxLength={20} dir="ltr" className="cart-input" aria-invalid={show("recipientPhone")} aria-describedby={describe("recipientPhone")} />
          </Field>
        </div>
      )}
    </div>
  );
}

/** A sentence with links in its blanks: "I agree to the {terms}" → text, link, text */
function Sentence({ text, parts }: { text: string; parts: Record<string, React.ReactNode> }) {
  return (
    <>
      {text.split(/(\{\w+\})/).map((piece, i) => {
        const name = /^\{(\w+)\}$/.exec(piece)?.[1];
        return name && name in parts ? <span key={i}>{parts[name]}</span> : <span key={i}>{piece}</span>;
      })}
    </>
  );
}
