// The Anatomy of a Cake, on one progress value 0 → 1, scrubbed by the page's scroll (GSAP
// ScrollTrigger in Hero.tsx). Each step owns a window of it; the camera and every part of the
// cake read these same windows, so they stay in sync. Change a window here and everything follows.
export type Window = readonly [number, number];

export const STAGES = {
  // 0 – 0.06: the exploded cake, its parts hovering apart above the stand
  layer0: [0.06, 0.16], // the parts fly into place: the first sponge layer…
  cream0: [0.14, 0.19], //  cream
  layer1: [0.17, 0.27], //  the second layer
  cream1: [0.25, 0.3], //   cream
  layer2: [0.28, 0.38], //  the third layer
  spiral: [0.38, 0.48], // a ribbon of buttercream spirals up around the stack…
  coat: [0.41, 0.51], //   …and is smoothed into a coat
  top: [0.5, 0.55], //     the top fills in
  spiralFade: [0.49, 0.55],
  piping: [0.55, 0.63], // a piped shell border runs round the top edge
  ribbon: [0.6, 0.67], // gold satin wraps the base…
  bow: [0.65, 0.7], //    …and ties into a bow
  letters: [0.69, 0.76], // gold letters, one by one
  goldLeaf: [0.72, 0.79], // flakes of gold leaf
  flowers: [0.74, 0.82], // baby's breath blooms round the base
  sparkle: [0.8, 0.86], // a trail of light circles the cake
  complete: [0.83, 0.88], // the complete cake: the sweets gather into a ring around it
  slice: [0.9, 0.98], // a slice is lifted out ("…and ask for another slice")
} as const satisfies Record<string, Window>;

/** What visitors who prefer reduced motion see: the complete cake, no assembly */
export const COMPLETE = 0.88;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Progress through a stage window, 0–1 (read by index: called many times a frame, and a
 *  destructured parameter can allocate an iterator until the engine optimises it away) */
export const stage = (p: number, w: Window) => clamp01((p - w[0]) / (w[1] - w[0]));
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack = (t: number, s = 1.70158) => (t <= 0 ? 0 : 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2);
