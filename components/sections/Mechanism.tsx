/*
 1. איפה הקורא: מבין שהבעיה הייתה בתהליך, רוצה לראות תהליך אחר.
 2. "כן אבל": "כולם אומרים שהם מקשיבים. מה קורה בפועל?"
 3. הסקשן: ארבעה שלבים שנערמים זה על זה כמו שכבות של עוגה, וקו זילוף זהוב שנבנה איתם.
 4. ביציאה: ביטחון. יש שלב אישור, אין הפתעות.
 5. יזכור: קו הזילוף הזהוב. זה הרגע האחד של האתר.
 רקע כהה מגיע מ-BackgroundShift. sticky ולא pin, כדי שלא יישבר במובייל.
*/
"use client";
import { useEffect, useRef, useState } from "react";
import { keyOf } from "@/lib/content/keys";
import type { HomeContent } from "@/lib/content/types";
import { gsap, useGSAP, MQ } from "@/lib/gsap";
import { fill } from "@/lib/text";

// the photos, in order; a fifth step (added in the CMS) starts them over
const PHOTOS = ["/images/mechanism-01.jpg", "/images/mechanism-02.jpg", "/images/mechanism-03.jpg", "/images/mechanism-04.jpg"];

const SHELL = 48; // רוחב צדף אחד ביחידות viewBox

// עיטור צדפים כמו בשולי העוגות. נבנה מימין לשמאל, כמו כיוון הקריאה.
function scallopPath(count: number) {
  const w = count * SHELL;
  let d = `M${w},6`;
  for (let i = 0; i < count; i++) d += ` a${SHELL / 2},18 0 0 1 -${SHELL},0`;
  return { d, w };
}

export default function Mechanism({ c }: { c: HomeContent["mechanism"] }) {
  const root = useRef<HTMLElement>(null);
  const scallopRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(24);
  const { d, w } = scallopPath(count);

  // מספר הצדפים נגזר מהרוחב, כדי שהם לא יימתחו במובייל.
  useEffect(() => {
    const el = scallopRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCount(Math.max(7, Math.round(e.contentRect.width / 52))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useGSAP(
    () => {
      const el = root.current!;
      const panels = gsap.utils.toArray<HTMLElement>(".step", el);
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        panels.forEach((panel, i) => {
          if (i === panels.length - 1) return;
          // opacity על הכרטיס עצמו היה חושף את הכרטיס שמתחתיו. מעמעמים בשכבה אטומה במקום.
          gsap
            .timeline({ scrollTrigger: { trigger: panels[i + 1], start: "top bottom", end: "top 10%", scrub: 1 } })
            .to(panel, { scale: 0.94, ease: "none" }, 0)
            .to(panel.querySelector(".step-dim"), { opacity: 0.5, ease: "none" }, 0);
        });
        gsap.fromTo(
          el.querySelector(".pipe"),
          { attr: { "stroke-dashoffset": 1 } },
          { attr: { "stroke-dashoffset": 0 }, ease: "none", scrollTrigger: { trigger: el.querySelector(".stack"), start: "top 10%", end: "bottom bottom", scrub: 1 } }
        );
      });
    },
    { scope: root, dependencies: [count] }
  );

  return (
    <section id="mechanism" ref={root} className="section" aria-labelledby="mech-title">
      <div className="wrap">
        <h2 id="mech-title" className="t-h2">{c.title}</h2>
        <p className="t-lead soft measure mt-5 max-w-[36ch]">{c.lead}</p>

        <div className="stack mt-16">
          <div className="scallop" ref={scallopRef} aria-hidden="true">
            <svg viewBox={`0 0 ${w} 30`} preserveAspectRatio="none">
              <path className="guide" d={d} fill="none" strokeWidth="2" />
              <path className="pipe" d={d} fill="none" strokeWidth="2.5" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset="0" />
            </svg>
          </div>

          {c.steps.map((s, i) => (
            <article key={keyOf(s, i)} className="step" style={{ ["--i" as string]: i }}>
              <div>
                <p className="t-caption" style={{ color: "var(--ink-inv-soft)" }}>
                  {fill(c.stepLabel, { n: i + 1, total: c.steps.length })}
                </p>
                <h3 className="step-title mt-4">{s.title}</h3>
                <p className="t-lead mt-6 max-w-[34ch]">{s.what}</p>
                <p className="mt-4 max-w-[40ch]" style={{ color: "var(--ink-inv-soft)" }}>{s.why}</p>
                {s.note ? (
                  <p className="t-caption mt-4" style={{ color: "var(--ink-inv-soft)" }}>{s.note}</p>
                ) : null}
              </div>
              <div className="step-media">
                <img src={PHOTOS[i % PHOTOS.length]} alt={s.alt} loading="lazy" />
              </div>
              <span className="step-dim" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
