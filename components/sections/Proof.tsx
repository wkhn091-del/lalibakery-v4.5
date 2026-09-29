/*
 1. איפה הקורא: התהליך נשמע טוב, אבל "תראו לי".
 2. "כן אבל": "יש לך עוגות שנראות כמו מה שאני רוצה?"
 3. הסקשן: שורה של עוגות אמיתיות, כל אחת עם השם והאירוע שלה, ואחריה רשימת האירועים.
 4. ביציאה: "היא כבר עשתה בדיוק את הסוג שאני צריך".
 5. יזכור: העוגה שדומה הכי הרבה לאירוע שלו.
*/
"use client";
import { useRef } from "react";
import type { HomeContent } from "@/lib/content/types";
import { gsap, ScrollTrigger, useGSAP, MQ } from "@/lib/gsap";

function Shell() {
  return (
    <svg className="shell" viewBox="0 0 22 12" aria-hidden="true">
      <path d="M21 2 a10 9 0 0 1 -20 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** עוגה בגלריה. מה-CMS מגיעים גם גדלים (srcSet), מידות ותמונה מטושטשת להצגה עד שהצילום נטען */
export type ProofItem = {
  key?: string;
  src: string;
  alt: string;
  caption: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
  lqip?: string;
};

/** c: "דף הבית", הגלריה. items: העוגות מה-CMS (sanity/data.ts: getGallery), או הגלריה המובנית (content.ts) */
export default function Proof({ c, items }: { c: HomeContent["proof"]; items: ProofItem[] }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const mm = gsap.matchMedia();

      // ספירה פעם אחת בכניסה, 1.2s. רק למספרים אמיתיים.
      mm.add(MQ.motion, () => {
        el.querySelectorAll<HTMLElement>("[data-count]").forEach((n) => {
          const to = Number(n.dataset.count);
          const obj = { v: 0 };
          gsap.to(obj, {
            v: to,
            duration: 1.2,
            ease: "power2.out",
            scrollTrigger: { trigger: n, start: "top 85%", once: true },
            onUpdate: () => (n.textContent = Math.round(obj.v).toLocaleString("he-IL")),
          });
        });

        // מרקיז שמגיב למהירות ולכיוון הגלילה
        const inner = el.querySelector(".marquee-inner")!;
        const loop = gsap.fromTo(inner, { xPercent: -50 }, { xPercent: 0, duration: 40, ease: "none", repeat: -1 });
        loop.totalTime(loop.duration() * 100);
        let base = 1;
        let boost = 1;
        const st = ScrollTrigger.create({
          trigger: el.querySelector(".marquee"),
          start: "top bottom",
          end: "bottom top",
          onUpdate: (self) => {
            base = self.direction;
            boost = gsap.utils.clamp(1, 5, 1 + Math.abs(self.getVelocity()) / 400);
          },
        });
        const tick = () => {
          boost += (1 - boost) * 0.04;
          const target = base * boost;
          loop.timeScale(loop.timeScale() + (target - loop.timeScale()) * 0.12);
        };
        gsap.ticker.add(tick);
        return () => {
          gsap.ticker.remove(tick);
          st.kill();
        };
      });

      // גלילה אופקית. RTL: העודף נמצא משמאל, לכן זזים ב-x חיובי.
      mm.add(MQ.desktopMotion, () => {
        const track = el.querySelector<HTMLElement>(".proof-grid")!;
        const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
        gsap.to(track, {
          x: () => dist(),
          ease: "none",
          scrollTrigger: {
            trigger: el.querySelector(".proof-pin"),
            start: "top top",
            end: () => "+=" + dist(),
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
      });
    },
    { scope: root }
  );

  return (
    <section id="proof" ref={root} className="section" aria-labelledby="proof-title">
      <div className="wrap">
        <h2 id="proof-title" className="t-h2">{c.title}</h2>
        <p className="t-lead soft mt-5 max-w-[36ch]">{c.lead}</p>
        <dl className="mt-12 flex flex-wrap gap-x-16 gap-y-8">
          {c.stats.map((s, i) => (
            <div key={i}>
              <dd className="t-h2">
                {s.value !== null ? (
                  <>
                    <span data-count={s.value}>{s.value.toLocaleString("he-IL")}</span>
                    {s.suffix}
                  </>
                ) : (
                  <span className="stat-todo soft hairline">{s.todo}</span>
                )}
              </dd>
              <dt className="soft mt-2">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="proof-pin mt-12 lg:mt-0">
        <ul className="proof-grid" role="list">
          {items.map((it) => (
            <li key={it.key ?? it.src} className="proof-card">
              <figure>
                <div className="proof-img">
                  <img
                    src={it.src}
                    srcSet={it.srcSet}
                    sizes={it.sizes}
                    width={it.width}
                    height={it.height}
                    alt={it.alt}
                    loading="lazy"
                    style={it.lqip ? { backgroundImage: `url(${it.lqip})`, backgroundSize: "cover" } : undefined}
                  />
                </div>
                <figcaption className="t-caption soft mt-3">{it.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>

      <div className="marquee hairline mt-16 lg:mt-0" aria-label={c.occasionsLabel}>
        <div className="marquee-inner">
          {[0, 1].map((k) => (
            <div key={k} className="marquee-set" aria-hidden={k === 1}>
              {c.occasions.map((o, i) => (
                <span key={i} className="marquee-item">
                  {o}
                  <Shell />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
