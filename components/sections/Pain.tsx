/*
 1. איפה הקורא: ראה עוגה יפה, אבל כבר נכווה בעבר.
 2. "כן אבל": "גם בפעם הקודמת התמונה הייתה יפה".
 3. הסקשן: אומר בקול את מה שקרה לו, כולל החלק שלא נעים להודות בו (הפח).
 4. ביציאה: מובן. מישהו יודע בדיוק מה עבר עליו.
 5. יזכור: "ואת רוב העוגה פיניתם לפח".
 התמונה מתחילה באפור ומקבלת צבע יחד עם המילים: הזיכרון הרע מול מה שהיה צריך להיות.
 הדגשת מילים בגלילה מופיעה רק כאן בכל האתר.
*/
"use client";
import { useRef } from "react";
import type { HomeContent } from "@/lib/content/types";
import { gsap, useGSAP, MQ } from "@/lib/gsap";
import { splitStega } from "@/lib/stega";

export default function Pain({ c }: { c: HomeContent["pain"] }) {
  const root = useRef<HTMLElement>(null);
  // The paragraph is lit word by word. In the Studio's preview its link to the CMS field
  // (invisible, lib/stega.ts) is put back once after the words, so a click anywhere on the
  // paragraph opens it; on the live site `encoded` is empty.
  const { cleaned, encoded } = splitStega(c.paragraph);
  const words = cleaned.split(" ");

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        const p = root.current!.querySelector(".pain-text")!;
        gsap.fromTo(
          p.querySelectorAll(".w"),
          { opacity: 0.18 },
          { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: p, start: "top 70%", end: "bottom 45%", scrub: 1 } }
        );
      });
      const img = root.current!.querySelector(".pain-img img")!;
      // דסקטופ: אותו טריגר כמו המילים. מובייל: התמונה מתחת לטקסט, אז היא הטריגר של עצמה.
      mm.add(MQ.desktopMotion, () => {
        gsap.fromTo(img, { filter: "grayscale(1)" }, { filter: "grayscale(0)", ease: "none",
          scrollTrigger: { trigger: root.current!.querySelector(".pain-text"), start: "top 70%", end: "bottom 45%", scrub: 1 } });
      });
      mm.add("(max-width: 1023px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(img, { filter: "grayscale(1)" }, { filter: "grayscale(0)", ease: "none",
          scrollTrigger: { trigger: img, start: "top 85%", end: "center 50%", scrub: 1 } });
      });
    },
    { scope: root }
  );

  return (
    <section ref={root} className="section" aria-label={c.label}>
      <div className="wrap grid items-center gap-12 lg:grid-cols-[7fr_5fr] lg:gap-20">
        <p className="pain-text">
          {words.map((w, i) => (
            <span key={i} className="w">
              {w}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
          {encoded}
        </p>
        <figure className="pain-figure">
          <div className="pain-img">
            <img src="/images/pain.jpg" alt={c.imageAlt} loading="lazy" />
          </div>
          <figcaption className="t-caption soft mt-3">{c.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
