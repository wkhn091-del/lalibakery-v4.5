/*
 1. איפה הקורא: מרגיש מובן, אבל חושב "ניסיתי כבר הכל".
 2. "כן אבל": "אז למה שזה יעבוד הפעם?"
 3. הסקשן: מוחק אחת אחת את מה שניסה, ומשאיר את הסיבה האמיתית: אף אחד לא שאל על האירוע.
 4. ביציאה: זה לא היה באשמתו. הייתה חסרה שאלה אחת.
 5. יזכור: "אף אחד לא התחיל מהשאלה מה האירוע שלכם".
 ומיד אחרי: השאלה עצמה. כל אירוע פותח את דף ההזמנה (בונה העוגה).
*/
"use client";
import { useRef } from "react";
import type { HomeContent } from "@/lib/content/types";
import { gsap, useGSAP, MQ, EASE_OUT } from "@/lib/gsap";
import { ORDER_PAGE } from "@/lib/routes";

export default function Failed({ c }: { c: HomeContent["failed"] }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MQ.motion, () => {
        root.current!.querySelectorAll<HTMLElement>(".failed-row").forEach((row) => {
          const text = row.querySelector(".failed-text");
          gsap
            .timeline({ scrollTrigger: { trigger: row, start: "top 72%", toggleActions: "play none none reverse" } })
            // RTL: הקו נמתח מימין. background-size ולא scaleX, כדי שכל שורה נמחקת גם כשהטקסט נשבר במובייל.
            .fromTo(text, { backgroundSize: "0% 2px" }, { backgroundSize: "100% 2px", duration: 0.5, ease: "power2.inOut" })
            .to(row, { opacity: 0.35, duration: 0.5 }, "<0.1");
        });
        const end = root.current!.querySelector(".failed-end")!;
        gsap.fromTo(
          end,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, ease: EASE_OUT, scrollTrigger: { trigger: end, start: "top 82%", toggleActions: "play none none reverse" } }
        );
      });
    },
    { scope: root }
  );

  return (
    <section ref={root} className="section" aria-labelledby="failed-title">
      <div className="wrap">
        <h2 id="failed-title" className="t-h2">{c.title}</h2>
        <ul className="mt-12 max-w-[52rem]">
          {c.items.map((item, i) => (
            <li key={i} className="failed-row hairline">
              <span className="failed-text">
                {item}
              </span>
            </li>
          ))}
        </ul>
        <div className="failed-end mt-16">
          <p className="t-h2 max-w-[22em]">{c.conclusion}</p>
          <p className="t-lead mt-10">{c.question}</p>
          <div className="chips mt-5">
            {c.events.map((e, i) => (
              <a key={i} href={ORDER_PAGE} className="chip chip-lg">
                {e}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
