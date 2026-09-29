"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

// מערכת התנועה. ערכים מהמפרט, בלי חריגות.
export const EASE_OUT = "expo.out"; //      cubic-bezier(0.22, 1, 0.36, 1)
export const EASE_IO = "power2.inOut"; //   cubic-bezier(0.65, 0, 0.35, 1)
export const STAGGER = 0.07;
export const SCRUB = 1;

export const MQ = {
  motion: "(prefers-reduced-motion: no-preference)",
  reduce: "(prefers-reduced-motion: reduce)",
  desktopMotion: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
  finePointer: "(pointer: fine) and (prefers-reduced-motion: no-preference)",
};

// mask reveal משותף ל-hero ולסגירה. אותו תזמון בדיוק.
export function maskReveal(lines: Element[] | NodeListOf<Element>, vars: gsap.TweenVars = {}) {
  return gsap.fromTo(
    lines,
    { y: 0, yPercent: 110 },
    { y: 0, yPercent: 0, duration: 0.9, ease: EASE_OUT, stagger: 0.08, ...vars }
  );
}

export { gsap, ScrollTrigger, useGSAP };
