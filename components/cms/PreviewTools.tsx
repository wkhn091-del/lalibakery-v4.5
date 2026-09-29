"use client";
/*
  The Studio's preview: click-to-edit on the real site. Loaded only in draft mode (./PreviewEditing.tsx),
  which only the Studio can turn on (app/api/draft-mode/enable); visitors never download any of this.

  In draft mode every text on the page carries an invisible link to its field (stega,
  lib/stega.ts). next-sanity's <VisualEditing> finds them and draws the outlines: a click opens
  that field in the Studio, next to the page. When the owner types, the Studio says so, and the
  page re-renders from the server with the draft (router.refresh: drafts are read uncached,
  sanity/fetch.ts). The client state stays as it is: the scroll position, the 3D cake, a half-built
  order in the cake builder.

  (next-sanity's default refresh would call revalidatePath("/", "layout") on every keystroke,
  marking every published page stale for no reason; this one only re-renders the page being edited.)
*/
import { VisualEditing } from "next-sanity/visual-editing";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ScrollTrigger } from "@/lib/gsap";

/** changes arrive per keystroke; one refresh for a burst of them */
const DEBOUNCE_MS = 250;
/** a refresh the Studio waits on is reported done after this long, whatever happened */
const GIVE_UP_MS = 10_000;

export default function PreviewTools() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | undefined>(undefined);
  const waiting = useRef<(() => void)[]>([]);

  // once the page has re-rendered: texts change length and lines wrap, so the scroll animations
  // measure the page again; then the Studio is told the refresh is done
  useEffect(() => {
    if (pending) return;
    const frame = requestAnimationFrame(() => {
      if (!waiting.current.length) return;
      ScrollTrigger.refresh();
      waiting.current.splice(0).forEach((done) => done());
    });
    return () => cancelAnimationFrame(frame);
  }, [pending]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // the same function every render: the overlays aren't set up again
  const refresh = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        window.setTimeout(resolve, GIVE_UP_MS);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => startTransition(() => router.refresh()), DEBOUNCE_MS);
      }),
    [router],
  );

  return (
    <>
      <VisualEditing refresh={refresh} />
      <ExitPreview />
    </>
  );
}

/**
 * Outside the Studio (a preview link opened in its own tab), a way back to the published site.
 * Inside the Studio's frame there's no need: the Studio has its own controls.
 */
function ExitPreview() {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(window.self === window.top && !window.opener), []);
  if (!standalone) return null;
  return (
    <a
      href="/api/draft-mode/disable"
      dir="rtl"
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483000,
        padding: "8px 16px",
        borderRadius: 999,
        background: "#2B2421",
        color: "#FCF8F5",
        font: "500 14px/1.2 system-ui, sans-serif",
        textDecoration: "none",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
      }}
    >
      תצוגה מקדימה של טיוטות · יציאה
    </a>
  );
}
