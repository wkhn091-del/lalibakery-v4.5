/*
 1. איפה הקורא: ראה עוגות, משוכנע באיכות. עכשיו שואל מה בדיוק כלול.
 2. "כן אבל": "ומה אם משהו לא יהיה כמו שסיכמנו?"
 3. הסקשן: רשימת תוצאות, כל אחת עם הרכיב שמאפשר אותה. בלי תנועה, כדי לתת למוח לנשום.
 4. ביציאה: ברור מה מקבלים.
 5. יזכור: "אפס הפתעות ביום האירוע".
*/
import { keyOf } from "@/lib/content/keys";
import type { HomeContent } from "@/lib/content/types";

export default function Deliverables({ c }: { c: HomeContent["deliverables"] }) {
  return (
    <section className="section" aria-labelledby="deliv-title">
      <div className="wrap grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-24">
        <div>
          <div className="lg:sticky lg:top-[12vh]">
            <h2 id="deliv-title" className="t-h2">{c.title}</h2>
            <figure className="mt-10 max-w-[420px]">
              <div className="portrait-img">
                <img src="/images/deliverables.jpg" alt={c.imageAlt} loading="lazy" />
              </div>
              <figcaption className="t-caption soft mt-3">{c.caption}</figcaption>
            </figure>
          </div>
        </div>
        <ul>
          {c.items.map((it, i) => (
            <li key={keyOf(it, i)} className="deliv-item hairline">
              <p className="t-lead" style={{ fontWeight: 500 }}>{it.outcome}</p>
              <p className="soft mt-1">({it.part})</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
