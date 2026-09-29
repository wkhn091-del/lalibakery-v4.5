"use client";
import { Component, lazy, type ReactNode, type RefObject, Suspense, useCallback, useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { ScrollTrigger } from "@/lib/gsap";
import { measureRegion, studioLight } from "./framing";
import { hero3d } from "./store";
import { COMPLETE } from "./timeline";

// three.js and everything the scene draws: a bundle of its own, downloaded only by a browser that can run it
const HeroScene = lazy(() => import("./HeroScene"));

type Props = { stage: RefObject<HTMLElement | null>; copy: RefObject<HTMLElement | null>; header: RefObject<HTMLElement | null> };

/** The scene needs WebGL 2: old devices, some locked-down browsers and browsers with hardware
 *  acceleration switched off don't have it */
function hasWebGL2() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // only asking: give it straight back
    return !!gl;
  } catch {
    return false;
  }
}

/** If the scene throws (or its bundle doesn't arrive), only the scene steps aside, never the page */
class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[hero3d] the 3D hero couldn't run; showing the photo instead", error);
    // the photo hides the crash from the visitor, so it's reported (Sentry, once configured)
    Sentry.captureException(error, { tags: { area: "hero3d" } });
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The hero's 3D background. Where it can't run (no WebGL 2, its bundle didn't arrive, the scene
 * failed, or the graphics context is gone for good) the hero goes back to exactly what it was
 * before: its photo, and on desktops the card pinned for 80% of a screen (globals.css, data-3d="off").
 */
export default function HeroCanvas({ stage, copy, header }: Props) {
  const [on, setOn] = useState(false); // nothing on the server: decided in the browser
  // When the hero mounted (this component mounts with it): the headline's reveal starts then, and
  // the scene's warm-up waits for it to finish, on the first visit and on every return to the page
  const [mountedAt] = useState(() => performance.now());

  const fallBack = useCallback(() => {
    setOn(false);
    const section = stage.current?.closest<HTMLElement>(".hero");
    if (!stage.current || !section || section.hasAttribute("data-3d")) return;
    const y = window.scrollY;
    const top = section.offsetTop;
    const screen = stage.current.offsetHeight;
    const before = section.offsetHeight;
    section.setAttribute("data-3d", "off");
    const after = section.offsetHeight;
    // The section just got shorter: keep what's on screen where it is (past the hero, the same
    // content; inside it, the stage still filling the screen)
    if (after < before && y > top) {
      const to = y - top >= before - screen ? y - (before - after) : Math.min(y, top + after - screen);
      const lenis = (window as unknown as { __lenis?: { scrollTo(to: number, o: { immediate: boolean; force: boolean }): void } }).__lenis;
      if (lenis) lenis.scrollTo(to, { immediate: true, force: true });
      else window.scrollTo(0, to);
    }
    ScrollTrigger.refresh();
  }, [stage]);

  useEffect(() => {
    const webgl2 = hasWebGL2();
    Sentry.setTag("hero3d", webgl2 ? "webgl2" : "no-webgl2"); // context for any later report
    if (webgl2) setOn(true);
    else fallBack();
  }, [fallBack]);

  // Where the cake has room, re-measured whenever the layout changes (and once the web fonts are
  // in). And the studio's light, for the CSS background that stands in until the first frame
  // (globals.css, .hero-media): painted just where the scene will draw it, so the scene fades in
  // over its own colours.
  useEffect(() => {
    const el = stage.current;
    if (!on || !el) return;
    // the scene opens on the exploded cake, or (reduced motion) on the finished one
    const opening = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? COMPLETE : 0;
    const measure = () => {
      hero3d.region = measureRegion(el, copy.current, header.current);
      const { glow, floor } = studioLight(hero3d.region, el.offsetWidth / Math.max(1, el.offsetHeight), opening);
      const at = (v: number) => `${(v * 100).toFixed(2)}%`;
      el.style.setProperty("--studio-glow-x", at(glow.x));
      el.style.setProperty("--studio-glow-y", at(glow.y));
      el.style.setProperty("--studio-floor-x", at(floor.x));
      el.style.setProperty("--studio-floor-y", at(floor.y));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (copy.current) ro.observe(copy.current);
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    const settled = setTimeout(measure, 2000); // once the headline's reveal has finished
    return () => {
      alive = false;
      clearTimeout(settled);
      ro.disconnect();
    };
  }, [on, stage, copy, header]);

  if (!on) return null;
  return (
    <Guard onError={fallBack}>
      <Suspense fallback={null}>
        <HeroScene stage={stage} onFail={fallBack} heroMountedAt={mountedAt} />
      </Suspense>
    </Guard>
  );
}
