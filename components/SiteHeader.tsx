"use client";
import { useEffect, useState } from "react";
import { keyOf } from "@/lib/content/keys";
import type { SiteSettings } from "@/lib/content/types";
import { ORDER_PAGE } from "@/lib/routes";
import { fill } from "@/lib/text";
import ScrollLink from "./ScrollLink";
import CartLink from "./shop/CartLink";
import { PhoneIcon } from "./Icons";

// מופיע אחרי ה-hero. נעלם כשגוללים למטה (כדי לא להסתיר תוכן) וחוזר כשגוללים למעלה.
// הטקסטים: "הגדרות כלליות" (כותרת, שם העסק, הטלפון); tel: הקישור לחיוג (lib/content/contact.ts)
export default function SiteHeader({ header, name, phone, tel, cart }: { header: SiteSettings["header"]; name: string; phone: string; tel: string; cart: { href: string; label: string; labelWithCount: string } }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero");
    let pastHero = false;
    let lastY = window.scrollY;
    const io = new IntersectionObserver(([e]) => {
      pastHero = !e.isIntersecting;
      if (!pastHero) setShow(false);
    });
    if (hero) io.observe(hero);
    const onScroll = () => {
      const y = window.scrollY;
      if (!pastHero) { lastY = y; return; }
      if (y < lastY - 6) setShow(true);
      else if (y > lastY + 6) setShow(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <header className="site-header" data-show={show ? "" : undefined} inert={!show}>
      <div className="wrap site-header-inner">
        <ScrollLink href="#top" className="brand-link">
          <img src="/brand/logo.svg" alt="" width={40} height={40} className="brand-mark" />
          <span className="brand-name">{name}</span>
        </ScrollLink>
        <nav aria-label={header.navLabel} className="site-nav">
          {header.nav.map((n, i) => (
            <ScrollLink key={keyOf(n, i)} href={n.href} className="nav-link">{n.label}</ScrollLink>
          ))}
        </nav>
        <div className="header-actions">
          <CartLink {...cart} />
          <ScrollLink href={ORDER_PAGE} className="nav-link nav-order">{header.order}</ScrollLink>
          <a href={tel} className="header-phone" aria-label={fill(header.call, { phone })}>
            <PhoneIcon />
            <span className="header-phone-text">{phone}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
