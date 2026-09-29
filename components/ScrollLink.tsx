"use client";
import type { ReactNode, MouseEvent } from "react";

type LenisLike = { scrollTo: (t: Element | number, o?: object) => void };

// קישור עוגן שגולל חלק דרך Lenis, ובלי Lenis (הפחתת תנועה) קופץ רגיל.
// קישור לדף אחר ("/custom-cake") הוא קישור רגיל: הדפדפן עובר לדף, בלי גלילה.
export default function ScrollLink({ href, className, children, onNavigate }: { href: string; className?: string; children: ReactNode; onNavigate?: () => void }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!href.startsWith("#")) return;
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (href === "#top") {
      e.preventDefault();
      if (lenis) lenis.scrollTo(0, { duration: 1.2 });
      else window.scrollTo(0, 0);
      onNavigate?.();
      return;
    }
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: -24, duration: 1.2 });
    else target.scrollIntoView();
    history.replaceState(null, "", href);
    onNavigate?.();
  };
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
