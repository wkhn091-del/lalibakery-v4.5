/*
 1. איפה הקורא: קיבל תשובות. מחליט.
 2. "כן אבל": "מה קורה אחרי שאני שולח?"
 3. הסקשן: מחזיר את ההבטחה מהכותרת, מוביל לדף ההזמנה (בונה העוגה), ואומר מה קורה אחרי.
 4. ביציאה: צעד קטן וברור.
 5. יזכור: "מתחילה בהודעה אחת".
*/
"use client";
import { useEffect, useRef } from "react";
import type { HomeContent } from "@/lib/content/types";
import { gsap, useGSAP, maskReveal, MQ } from "@/lib/gsap";
import { ORDER_PAGE } from "@/lib/routes";
import MaskLines from "../MaskLines";
import ScrollLink from "../ScrollLink";

export default function Closing({ c }: { c: HomeContent["closing"] }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const mm = gsap.matchMedia();

      // אותו mask reveal כמו ב-hero, אותו תזמון.
      mm.add(MQ.motion, () => {
        maskReveal(el.querySelectorAll(".mask-line > span"), {
          scrollTrigger: { trigger: el, start: "top 70%", once: true },
        });
      });

      // כפתור מגנטי: עד 6px לכיוון הסמן.
      mm.add(MQ.finePointer, () => {
        const zone = el.querySelector<HTMLElement>(".magnet-zone")!;
        const btn = zone.querySelector<HTMLElement>(".btn-primary")!;
        const xTo = gsap.quickTo(btn, "x", { duration: 0.4, ease: "power3.out" });
        const yTo = gsap.quickTo(btn, "y", { duration: 0.4, ease: "power3.out" });
        const move = (e: PointerEvent) => {
          const r = zone.getBoundingClientRect();
          const dx = gsap.utils.clamp(-1, 1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2));
          const dy = gsap.utils.clamp(-1, 1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2));
          xTo(dx * 6);
          yTo(dy * 6);
        };
        const leave = () => {
          xTo(0);
          yTo(0);
        };
        zone.addEventListener("pointermove", move);
        zone.addEventListener("pointerleave", leave);
        return () => {
          zone.removeEventListener("pointermove", move);
          zone.removeEventListener("pointerleave", leave);
        };
      });

    },
    { scope: root }
  );

  // A line added in the Studio's preview isn't part of the reveal set up on load: show it (on the
  // live site the text never changes after the page loads, so this never runs)
  const lineCount = c.lines.length;
  const revealed = useRef(lineCount);
  useEffect(() => {
    if (lineCount === revealed.current) return;
    revealed.current = lineCount;
    gsap.set(root.current!.querySelectorAll(".mask-line > span"), { yPercent: 0 });
  }, [lineCount]);

  return (
    <section id="closing" ref={root} className="section closing" aria-labelledby="closing-title">
      <div className="wrap grid items-center gap-14 lg:grid-cols-[7fr_5fr] lg:gap-20">
        <div>
        <div id="closing-title">
          <MaskLines as="h2" lines={c.lines} className="t-display" />
        </div>
        <div className="mt-12">
          <span className="magnet-zone">
            <ScrollLink href={ORDER_PAGE} className="btn-primary">
              {c.cta}
            </ScrollLink>
          </span>
        </div>
        <p className="soft mt-6 max-w-[44ch]">{c.after}</p>
        </div>
        <div className="portrait-img max-w-[460px]">
          <img src="/images/closing.jpg" alt={c.imageAlt} loading="lazy" />
        </div>
      </div>
    </section>
  );
}
