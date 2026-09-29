"use client";
import { useEffect, useState } from "react";
import type { Hours, SiteSettings } from "@/lib/content/types";
import { clean } from "@/lib/stega";
import { fill } from "@/lib/text";

type Props = {
  /** the opening hours ("הגדרות כלליות") */
  hours: Hours[];
  /** the status line's wording, with {close}, {open}, {when} and {day} for the times and days */
  text: SiteSettings["openStatus"];
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// מחושב לפי שעון ישראל, לא לפי השעון של המכשיר.
function computeStatus(hours: Hours[], text: Props["text"], now = new Date()) {
  const hoursFor = (day: number) => hours.find((h) => h.days.includes(day));
  // in the Studio's preview the times carry invisible characters (lib/stega.ts); the sums need them bare
  const time = (t: string) => clean(t).trim();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));

  const today = hoursFor(day);
  const open = time(today?.open ?? "");
  const close = time(today?.close ?? "");
  if (open && close && minutes >= toMin(open) && minutes < toMin(close)) {
    return { open: true, text: fill(text.openUntil, { close }) };
  }
  if (open && minutes < toMin(open)) {
    return { open: false, text: fill(text.opensToday, { open }) };
  }
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    const next = time(hoursFor(d)?.open ?? "");
    if (next) {
      const when = i === 1 ? text.tomorrow : fill(text.onDay, { day: text.days[d] ?? "" });
      return { open: false, text: fill(text.opensLater, { when, open: next }) };
    }
  }
  return null;
}

export default function OpenStatus({ hours, text }: Props) {
  const [status, setStatus] = useState<ReturnType<typeof computeStatus>>(null);
  useEffect(() => {
    const update = () => setStatus(computeStatus(hours, text));
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [hours, text]);
  if (!status) return <p className="open-status" aria-hidden="true">&nbsp;</p>;
  return (
    <p className="open-status" data-open={status.open ? "" : undefined}>
      <span className="open-dot" aria-hidden="true" />
      {status.text}
    </p>
  );
}
