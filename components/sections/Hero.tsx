/*
 1. איפה הקורא: יש לו אירוע בקרוב והוא מחפש אצל מי להזמין עוגה.
 2. "כן אבל": כל אופה מציג תמונות יפות. מה שונה כאן?
 3. הסקשן: מראה עוגה אמיתית במסך מלא, ומבטיח תוצאה כפולה: נראית טוב וגם טעימה.
 4. ביציאה: "זה נראה בדיוק בסגנון שרציתי".
 5. יזכור: "העוגה שכולם יצלמו, וגם יבקשו עוד פרוסה".
*/
"use client";
import { useEffect, useRef } from "react";
import type { HomeContent } from "@/lib/content/types";
import { gsap, useGSAP, maskReveal, MQ, EASE_OUT, STAGGER } from "@/lib/gsap";
import { ORDER_PAGE } from "@/lib/routes";
// הרקע: עוגה בתלת־ממד שמרכיבה את עצמה בזמן הגלילה (components/hero3d). הסצנה נטענת בחבילה נפרדת,
// רק בדפדפן שיכול להריץ אותה; עד שהפריים הראשון מוכן רואים את צבעי הסטודיו שלה.
import HeroCanvas from "../hero3d/HeroCanvas";
import { hero3d, setInscription } from "../hero3d/store";
import { COMPLETE } from "../hero3d/timeline";
import MaskLines from "../MaskLines";
import WhatsAppIcon from "../WhatsAppIcon";

/** c: "דף הבית", hero. wordmark and logoAlt: "הגדרות כלליות" (the business) */
export default function Hero({ c, wordmark, logoAlt }: { c: HomeContent["hero"]; wordmark: string; logoAlt: string }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);

  // the inscription on the 3D cake: set before the scene first renders (it loads after this runs)
  useEffect(() => setInscription(c.inscription), [c.inscription]);

  useGSAP(
    () => {
      const el = root.current!;
      const media = el.querySelector(".hero-media")!;
      const img = el.querySelector(".hero-media img")!;
      const mm = gsap.matchMedia();

      mm.add(MQ.motion, () => {
        maskReveal(el.querySelectorAll(".mask-line > span"), { delay: 0.15 });
        gsap.fromTo(
          el.querySelectorAll(".hero-fade"),
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, ease: EASE_OUT, stagger: STAGGER, delay: 0.55 }
        );
      });

      // כיווץ clip-path + פרלקס עדין על המדיה. דסקטופ בלבד.
      // (ה-pin הוחלף ב-sticky על .hero-stage: הסקשן גבוה יותר כדי לתת לעוגה זמן להיבנות.)
      mm.add(MQ.desktopMotion, () => {
        gsap.fromTo(
          media,
          { clipPath: "inset(0% 0% 0% 0% round 0px)" },
          {
            clipPath: "inset(6% 10% 6% 10% round 28px)",
            ease: "none",
            scrollTrigger: { trigger: el, start: "top top", end: "+=80%", scrub: 1 },
          }
        );
        gsap.fromTo(img, { y: 0 }, { y: 40, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "+=80%", scrub: 1 } });
      });

      // העוגה נבנית לפי הגלילה: כל עוד הבמה נעוצה, ההתקדמות עולה מ-0 ל-1 (אנימציה לא מתנגנת לבד).
      mm.add(MQ.motion, () => {
        gsap.fromTo(
          hero3d,
          { progress: 0 },
          {
            progress: 1,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.9,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                hero3d.velocity = self.getVelocity();
              },
            },
          }
        );
      });
      // מי שביקש פחות תנועה רואה את העוגה השלמה, בלי הרכבה
      mm.add(MQ.reduce, () => {
        hero3d.progress = COMPLETE;
      });
    },
    { scope: root }
  );

  // A line added in the Studio's preview arrives after the reveal has played: show it like the
  // others (on the live site the text never changes after the page loads, so this never runs)
  const lineCount = c.lines.length;
  const revealed = useRef(lineCount);
  useEffect(() => {
    if (lineCount === revealed.current) return;
    revealed.current = lineCount;
    gsap.set(root.current!.querySelectorAll(".mask-line > span"), { yPercent: 0 });
  }, [lineCount]);

  return (
    <section id="hero" ref={root} className="hero" aria-label={wordmark}>
      <span id="top" />
      <div className="hero-stage" ref={stage}>
        <div className="hero-media">
          {/* גיבוי: מוצגת רק בלי JS, בלי WebGL, או אם התלת־ממד נכשל (ולכן בעדיפות הורדה נמוכה) */}
          <picture>
            <source media="(max-width: 767px)" srcSet="/images/hero-mobile.jpg" />
            <img className="hero-poster" src="/images/hero.jpg" alt={c.imageAlt} fetchPriority="low" />
          </picture>
          <HeroCanvas stage={stage} copy={copy} header={header} />
          <div className="hero-scrim" />
        </div>

        <header className="hero-header" ref={header}>
          <img className="hero-logo" src="/brand/logo.svg" alt={logoAlt} width={96} height={96} />
        </header>

        <div className="hero-copy" ref={copy}>
          <MaskLines as="h1" lines={c.lines} className="t-display" />
          <p className="t-lead hero-sub hero-fade">{c.sub}</p>
          <div className="hero-actions hero-fade">
            <a className="btn-primary" href={ORDER_PAGE}>
              <WhatsAppIcon />
              {c.cta}
            </a>
            <span className="t-caption hero-trust">{c.trust}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
