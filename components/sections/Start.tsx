/*
 1. איפה הקורא: רוצה, אבל חושש שזה יהיה תהליך מסורבל.
 2. "כן אבל": "כמה זה מסובך להזמין?"
 3. הסקשן: שלושה צעדים, מי עושה מה ומתי. כאן מספור מותר, זה באמת רצף. מתחתיהם כפתור לדף ההזמנה.
 4. ביציאה: "זה רק הודעה אחת".
 5. יזכור: הצעד הראשון לוקח דקה, בדף ההזמנה, בלי להקליד הודעה.
*/
"use client";
import { useRef } from "react";
import { keyOf } from "@/lib/content/keys";
import type { HomeContent } from "@/lib/content/types";
import { gsap, ScrollTrigger, useGSAP, MQ } from "@/lib/gsap";
import { ORDER_PAGE } from "@/lib/routes";

export default function Start({ c }: { c: HomeContent["start"] }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const list = el.querySelector(".start-list")!;
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        list.classList.remove("no-motion");
        gsap.fromTo(
          el.querySelector(".start-fill"),
          { scaleY: 0 },
          { scaleY: 1, ease: "none", transformOrigin: "top", scrollTrigger: { trigger: list, start: "top 60%", end: "bottom 60%", scrub: 1 } }
        );
        el.querySelectorAll(".start-step").forEach((s) =>
          ScrollTrigger.create({
            trigger: s,
            start: "top 60%",
            onEnter: () => s.classList.add("is-passed"),
            onLeaveBack: () => s.classList.remove("is-passed"),
          })
        );
        return () => list.classList.add("no-motion");
      });
    },
    { scope: root }
  );

  return (
    <section ref={root} className="section band-blush" aria-labelledby="start-title">
      <div className="wrap">
        <h2 id="start-title" className="t-h2">{c.title}</h2>
        <ol className="start-list no-motion mt-14 max-w-[44rem]">
          <span className="start-track" aria-hidden="true" />
          <span className="start-fill" aria-hidden="true" />
          {c.steps.map((s, i) => (
            <li key={keyOf(s, i)} className="start-step">
              <span className="start-dot" aria-hidden="true">{i + 1}</span>
              <p className="t-caption soft">{s.who}</p>
              <p className="t-lead mt-2">{s.what}</p>
              <p className="t-caption soft mt-2">{s.when}</p>
            </li>
          ))}
        </ol>
        {/* כפתור ההזמנה, בסגנון היחיד שמסמן "הזמנה" באתר, במרכז, מתחת לרשימה ובאותו רוחב שלה */}
        <div id="start-cta" className="mt-14 flex max-w-[44rem] justify-center">
          <a href={ORDER_PAGE} className="btn-primary">
            {c.cta}
          </a>
        </div>
      </div>
    </section>
  );
}
