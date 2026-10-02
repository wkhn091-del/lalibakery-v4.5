"use client";
import { useEffect, useState } from "react";
import WhatsAppIcon from "./WhatsAppIcon";

// מופיע אחרי ה-hero. נעלם כשה-hero, הכפתור של "איך מתחילים", הסגירה או כרטיס יצירת הקשר על המסך,
// כדי שלא יהיו שני CTA זה ליד זה.
/** href: WhatsApp (lib/content/contact.ts). label: "הגדרות כלליות", הכפתור הצף */
export default function FloatingCta({ href, label }: { href: string; label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ids = ["hero", "proof-cta", "start-cta", "closing", "contact"];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const visible = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target, e.isIntersecting));
      setShow(![...visible.values()].some(Boolean));
    });
    els.forEach((el) => {
      visible.set(el, false);
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return (
    <a
      className="float-cta"
      href={href}
      target="_blank"
      rel="noopener"
      data-show={show ? "" : undefined}
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
    >
      <WhatsAppIcon size={22} />
      <span>{label}</span>
    </a>
  );
}
