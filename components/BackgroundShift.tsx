"use client";
import { gsap, ScrollTrigger, useGSAP, MQ } from "@/lib/gsap";

// המהלך הגלובלי: surface -> surface-deep במנגנון -> surface בהוכחה.
// מזיזים משתני CSS ולא את body ישירות, כך שכל טקסט משני וקו דק מתהפך יחד.
export default function BackgroundShift() {
  useGSAP(() => {
    const section = document.getElementById("mechanism");
    if (!section) return;
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    const light = { "--bg": v("--surface"), "--fg": v("--ink"), "--fg-soft": v("--ink-soft") };
    const dark = { "--bg": v("--surface-deep"), "--fg": v("--ink-inv"), "--fg-soft": v("--ink-inv-soft") };

    const mm = gsap.matchMedia();
    mm.add(MQ.motion, () => {
      ScrollTrigger.create({
        trigger: section,
        start: "top 60%",
        end: "bottom 40%",
        onToggle: ({ isActive }) =>
          gsap.to(root, { ...(isActive ? dark : light), duration: 0.6, ease: "power2.inOut", overwrite: true }),
      });
      return () => gsap.set(root, light);
    });
  });
  return null;
}
