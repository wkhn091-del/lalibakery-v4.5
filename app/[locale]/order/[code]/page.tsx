import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ShopHeader from "@/components/shop/ShopHeader";
import { PayButton, RefreshWhilePaying } from "@/components/shop/OrderActions";
import Footer from "@/components/sections/Footer";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { linksOf } from "@/lib/content/contact";
import { localePath } from "@/lib/i18n/config";
import { messages } from "@/lib/i18n/messages";
import { routeLocale } from "@/lib/i18n/route";
import { canOpenOrder, type GuestOrder, orderByCode } from "@/lib/orders/server";
import { agorotText } from "@/lib/price";
import { fill } from "@/lib/text";
import { getSettings } from "@/sanity/content";

export async function generateMetadata({ params }: PageProps<"/[locale]/order/[code]">): Promise<Metadata> {
  const locale = await routeLocale(params);
  const { business } = await getSettings(false);
  return { title: `${messages(locale).order.metaTitle} | ${business.name}`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/*
  A guest's order: opened only with the signed link from the checkout (lib/orders/token.ts), which
  is the guest's authorization, checked here on the server before anything is read. Rendered per
  request and never cached (next.config.ts sends no-store and no-referrer for these addresses, so
  the link's key doesn't leak to other sites). It shows the order, how it's paid, and lets an
  unpaid online order be paid.
*/
export default async function OrderPage({ params, searchParams }: PageProps<"/[locale]/order/[code]">) {
  const locale = await routeLocale(params);
  await connection();
  const { code } = await params;
  const query = await searchParams;
  const token = first(query.t) ?? "";
  const settings = await getSettings();
  const t = messages(locale).order;
  const links = linksOf(settings.business);
  const upper = decodeURIComponent(code).toUpperCase();

  let order: GuestOrder | null = null;
  if (canOpenOrder(upper, token)) {
    try {
      order = await orderByCode(upper);
    } catch (error) {
      console.error("[order] read failed:", error);
    }
  }
  const whatsapp = `${links.whatsapp}?text=${encodeURIComponent(fill(t.whatsappText, { code: order?.public_code ?? upper.slice(0, 11) }))}`;

  return (
    <>
      <ShopHeader locale={locale} name={settings.business.name} />
      <main id="main" tabIndex={-1} className="shop-page">
        <div className="wrap max-w-[860px]">
          {order ? (
            <OrderView order={order} locale={locale} token={token} justPaid={first(query.paid) === "1"} t={t} />
          ) : (
            <div className="catalog-none">
              <p>{t.invalid}</p>
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 items-center">
            <a href={whatsapp} target="_blank" rel="noopener" className="text-link product-ask mt-0">
              <WhatsAppIcon />
              {t.whatsapp}
            </a>
            <Link href={localePath(locale, "/products")} className="text-link">{t.back}</Link>
          </div>
        </div>
      </main>
      <Footer settings={settings} links={links} />
    </>
  );
}

function OrderView({ order: o, locale, token, justPaid, t }: { order: GuestOrder; locale: string; token: string; justPaid: boolean; t: ReturnType<typeof messages>["order"] }) {
  const dateText = o.needed_date ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${o.needed_date}T00:00:00Z`)) : "";
  const held = o.slot_held_until ? new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(o.slot_held_until)) : "";
  const holding = o.status === "pending_payment" && !!o.slot_held_until && Date.parse(o.slot_held_until) > Date.now();
  const paid = o.payment_status === "paid";

  let message: string;
  if (o.status === "cancelled") message = o.cancelled_reason === "payment_timeout" ? t.expired : t.cancelled;
  else if (paid) message = t.thanksPaid;
  else if (o.payment_method === "online") message = justPaid ? t.paying : holding ? t.waiting : t.expired;
  else message = t.thanks;

  return (
    <>
      <h1 className="t-h2">{fill(t.title, { code: o.public_code })}</h1>
      <p className="t-lead mt-4" role="status">{message}</p>
      {!paid && o.payment_method !== "online" && o.status !== "cancelled" && <p className="soft mt-2">{t.manual}</p>}
      {holding && !paid && (
        <>
          {justPaid && <RefreshWhilePaying />}
          <p className="soft mt-2">{fill(t.holdUntil, { time: held })}</p>
          {o.total_agorot != null && <PayButton locale={locale} code={o.public_code} token={token} label={fill(t.pay, { total: agorotText(o.total_agorot) })} failed={t.payFailed} expired={t.expired} />}
        </>
      )}

      <dl className="order-facts mt-8">
        <div>
          <dt>{t.status}</dt>
          <dd>{t.statuses[o.status]}</dd>
        </div>
        <div>
          <dt>{t.paidLabel}</dt>
          <dd>{t.paid[o.payment_status]}</dd>
        </div>
        {o.needed_date && (
          <div>
            <dt>{t.when}</dt>
            <dd>
              {o.fulfilment === "delivery" ? fill(t.deliveryOn, { city: o.delivery_city ?? "", date: dateText }) : fill(t.pickupOn, { date: dateText })}
              {o.window_from && o.window_to && <span className="soft block">{fill(t.between, { from: o.window_from.slice(0, 5), to: o.window_to.slice(0, 5) })}</span>}
            </dd>
          </div>
        )}
      </dl>

      {o.order_items.length > 0 && (
        <section className="mt-8" aria-labelledby="order-items">
          <h2 id="order-items" className="product-h">{t.items}</h2>
          <ul className="checkout-items">
            {o.order_items.map((i) => (
              <li key={i.line_no}>
                <span>
                  <bdi>{i.quantity}</bdi> × {i.title}
                  {i.kind === "single" && i.variant_label !== "—" && <span className="soft"> ({i.variant_label})</span>}
                </span>
                <span className="cart-line-price">{agorotText(i.unit_price_agorot * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="cart-sums mt-4">
            <div>
              <dt>{t.subtotal}</dt>
              <dd>{agorotText(o.subtotal_agorot ?? 0)}</dd>
            </div>
            {o.discount_agorot > 0 && (
              <div className="cart-discount">
                <dt>{t.discount}</dt>
                <dd><bdi>−{agorotText(o.discount_agorot)}</bdi></dd>
              </div>
            )}
            {o.fulfilment === "delivery" && (
              <div>
                <dt>{t.delivery}</dt>
                <dd>{o.shipping_agorot ? agorotText(o.shipping_agorot) : t.free}</dd>
              </div>
            )}
            <div className="cart-total">
              <dt>{t.total}</dt>
              <dd>{agorotText(o.total_agorot ?? 0)}</dd>
            </div>
          </dl>
        </section>
      )}
      <p className="soft mt-6 text-[14px]">{t.keep}</p>
    </>
  );
}
