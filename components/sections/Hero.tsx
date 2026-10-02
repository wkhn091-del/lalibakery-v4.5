/*
 1. איפה הקורא: יש לו אירוע בקרוב והוא מחפש אצל מי להזמין עוגה.
 2. "כן אבל": כל אופה מציג תמונות יפות. מה שונה כאן?
 3. הסקשן: מראה עוגה אמיתית במסך מלא, ומבטיח תוצאה כפולה: נראית טוב וגם טעימה.
 4. ביציאה: "זה נראה בדיוק בסגנון שרציתי".
 5. יזכור: "העוגה שכולם יצלמו, וגם יבקשו עוד פרוסה".
*/
"use client";
import { useEffect, useRef, useState } from "react";
import type { HomeContent } from "@/lib/content/types";
import { gsap, useGSAP, maskReveal, MQ, EASE_OUT, STAGGER } from "@/lib/gsap";
import { ORDER_PAGE } from "@/lib/routes";
// הרקע: עוגה בתלת־ממד שמרכיבה את עצמה לבד, כמו סרטון (components/hero3d). הסצנה נטענת בחבילה נפרדת,
// רק בדפדפן שיכול להריץ אותה; עד שהפריים הראשון מוכן רואים את צבעי הסטודיו שלה.
import HeroCanvas from "../hero3d/HeroCanvas";
import { hero3d, onHero3DReady, setInscription } from "../hero3d/store";
import { COMPLETE } from "../hero3d/timeline";

/** כמה זמן העוגה נבנית מול העיניים (כמו מזיגת היין בטנא משקאות, 5.5 שניות), נשארת שלמה, ומתפרקת */
const ASSEMBLY_SECONDS = 6;
const HOLD_SECONDS = 6;
const UNDO_SECONDS = 2;
import MaskLines from "../MaskLines";
import { PauseIcon, PlayIcon } from "../Icons";

/** c: "דף הבית", hero. wordmark and logoAlt: "הגדרות כלליות" (the business) */
export default function Hero({ c, wordmark, logoAlt }: { c: HomeContent["hero"]; wordmark: string; logoAlt: string }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  // the cake builds itself over and over: anything moving that long needs a way to stop it (WCAG 2.2.2)
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const resume = useRef<(() => void) | null>(null);
  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    resume.current?.();
  };

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

      // העוגה נבנית לבד ברגע שהסצנה מוכנה, בלי לחייב גלילה: גלילה ארוכה כדי לראות אנימציה מעייפת ומבריחה
      // כמו סרטון בלולאה: נבנית, נשארת שלמה כמה שניות, מתפרקת ונבנית שוב. מתנגנת רק כשה-hero על המסך
      // והלשונית פתוחה, כך שהלקוח תמיד רואה אותה מההתחלה, ולא נעילה של הגלילה.
      mm.add(MQ.motion, () => {
        hero3d.progress = 0;
        const loop = gsap
          .timeline({ paused: true, repeat: -1, repeatDelay: 0.4 })
          .to(hero3d, { progress: 1, duration: ASSEMBLY_SECONDS, ease: "power1.inOut" })
          .to(hero3d, { progress: 1, duration: HOLD_SECONDS })
          .to(hero3d, { progress: 0, duration: UNDO_SECONDS, ease: "power2.inOut" });
        let ready = false;
        let onScreen = false;
        const update = () => (ready && onScreen && !pausedRef.current && document.visibilityState === "visible" ? loop.play() : loop.pause());
        resume.current = update;
        const stop = onHero3DReady(() => {
          ready = true;
          update();
        });
        const seen = new IntersectionObserver(([entry]) => {
          onScreen = !!entry?.isIntersecting;
          update();
        }, { threshold: 0.35 });
        seen.observe(el);
        document.addEventListener("visibilitychange", update);
        return () => {
          resume.current = null;
          stop();
          seen.disconnect();
          document.removeEventListener("visibilitychange", update);
          loop.kill();
        };
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
            <a className="btn-primary" href={ORDER_PAGE} aria-describedby={c.ctaNote ? "hero-cta-note" : undefined}>
              {c.cta}
            </a>
            <span className="t-caption hero-trust">{c.trust}</span>
            {c.ctaNote && (
              <span id="hero-cta-note" className="t-caption hero-trust hero-note">
                {c.ctaNote}
              </span>
            )}
          </div>
        </div>

        <button type="button" className="hero-pause" aria-pressed={paused} onClick={togglePause}>
          {paused ? <PlayIcon /> : <PauseIcon />}
          <span>{paused ? c.play : c.pause}</span>
        </button>
      </div>
    </section>
  );
}
