"use client";
import { Component, lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { MQ } from "@/lib/gsap";
import type { CakeSpec } from "@/lib/order/preview";

// three.js and the scene: a bundle of their own, downloaded only by a browser that can draw them
const BuilderScene = lazy(() => import("./BuilderScene"));

function hasWebGL2() {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** If the scene throws (or its bundle doesn't arrive), only the picture steps aside: the written summary stays */
class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[builder3d] the 3D preview couldn't run", error);    Sentry.captureException(error, { tags: { area: "builder3d" } });
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MQ.reduce);
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

type Props = { spec: CakeSpec | null; text: { label: string; hint: string; note: string }; className?: string };

/**
 * The cake as it's being built, in 3D: every choice (size, cream, colours, words, add-ons) shows
 * on it as it's made. An illustration beside the written summary, never instead of it: where 3D
 * can't run, nothing is shown and the summary says it all.
 */
export default function BuilderPreview({ spec, text, className }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(false);
  const still = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ok = hasWebGL2();
    Sentry.setTag("builder3d", ok ? "webgl2" : "no-webgl2");
    setSupported(ok);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [supported, spec === null]);

  // a new draft object on every keystroke, the same cake: the scene redraws only when the cake changes
  const key = spec ? JSON.stringify(spec) : "";
  const stable = useMemo(() => spec, [key]);

  if (!stable || supported === false || failed) return null;
  return (
    <div className={className}>
      <div
        ref={box}
        role="img"
        aria-label={text.label}
        className="relative h-[var(--preview-h,300px)] w-full overflow-hidden rounded-[20px] bg-[radial-gradient(120%_90%_at_50%_30%,#fdf3f3_0%,#f6e2e2_55%,#efd3d3_100%)]"
      >
        {supported && (
          <Guard onError={() => setFailed(true)}>
            <Suspense fallback={<div className="absolute inset-0 animate-pulse bg-white/20" />}>
              <BuilderScene spec={stable} active={active} still={still} />
            </Suspense>
          </Guard>
        )}
        <p aria-hidden className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[13px] text-ink-soft">
          {text.hint}
        </p>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-ink-soft">{text.note}</p>
    </div>
  );
}
