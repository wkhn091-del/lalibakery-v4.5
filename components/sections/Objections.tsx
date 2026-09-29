/*
 1. איפה הקורא: כמעט מוכן, נשארו שאלות פרקטיות.
 2. "כן אבל": מחיר, זמן, כשרות.
 3. הסקשן: עונה ישירות, בשאלות כפי שהוא היה שואל אותן. בלי תנועת גלילה.
 4. ביציאה: אין יותר סיבה לחכות.
 5. יזכור: שהתשובות היו ישירות.
*/
"use client";
import { useState } from "react";
import { keyOf } from "@/lib/content/keys";
import type { HomeContent } from "@/lib/content/types";
import WhatsAppIcon from "../WhatsAppIcon";

function Item({ q, a, id }: { q: string; a: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="faq-item hairline" data-open={open ? "" : undefined}>
      <button className="faq-q" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <span className="faq-icon" aria-hidden="true" />
      </button>
      <div id={id} className="panel" data-open={open ? "" : undefined} role="region">
        <div>
          <p className="soft pb-7 measure">{a}</p>
        </div>
      </div>
    </li>
  );
}

/** c: "דף הבית", שאלות. phone as shown, and the WhatsApp and call links (lib/content/contact.ts) */
export default function Objections({ c, phone, whatsapp, tel }: { c: HomeContent["faq"]; phone: string; whatsapp: string; tel: string }) {
  return (
    <section id="faq" className="section" aria-labelledby="faq-title">
      <div className="wrap grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-24">
        <div>
          <h2 id="faq-title" className="t-h2">{c.title}</h2>
          <div className="contact-card mt-10">
            <p className="t-lead" style={{ fontWeight: 500 }}>{c.contact.title}</p>
            <p className="soft mt-1">{c.contact.text}</p>
            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <a className="text-link" href={whatsapp} target="_blank" rel="noopener">
                <WhatsAppIcon />
                {c.contact.whatsapp}
              </a>
              <a className="text-link" href={tel}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
                </svg>
                {phone}
              </a>
            </div>
          </div>
        </div>
        <ul>
          {c.items.map((it, i) => (
            <Item key={keyOf(it, i)} q={it.q} a={it.a} id={`faq-${i}`} />
          ))}
        </ul>
      </div>
    </section>
  );
}
