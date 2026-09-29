// The scene's own clock, and whether its frames are real yet. Every part that moves reads it; only
// the scene uses it (the page talks to the scene through store.ts).
//
// Why not R3F's own delta: R3F measures it with performance.now() when the scene's turn comes in
// the frame, after the page's own frame work has run (Lenis, ScrollTrigger and the scrubs go first,
// for a varying 1–3 ms while the page scrolls). So its steps come out uneven even at a steady frame
// rate, and so does the motion built on them: the camera's glide, the sweets' orbits, the trail of
// light. This clock reads the browser's frame clock instead (document.timeline): the moment the
// frame being drawn is due on screen, the same for every callback in that frame and in step with
// the display. Steps measured that way are even, and the motion is too.
//
// A pause is never a step: when the canvas starts drawing again (the hero back on screen), HeroScene
// starts a new count (last = −1), and a gap of over half a second (a hidden tab) counts as one frame.
// Otherwise the first frame back would jump everything forward by the time it was away.

export const sceneClock = {
  /** Seconds since the previous frame; at most 0.1, and one frame's worth after a pause */
  dt: 1 / 60,
  /** Seconds of motion so far: the steps added up, so it never jumps after a pause */
  time: 0,
  /** The last step was a pause (the tab hidden), not a frame */
  gap: false,
  /** The warm-up is over: every frame from now on is real, and meant to be seen (HeroScene) */
  live: false,
  /** The frame clock's reading at the previous frame, in ms; −1 starts a new count */
  last: -1,
};

/** Steps the clock by one frame. The scene's first frame callback calls it (HeroScene's Driver);
 *  `fallback` is R3F's delta, for a browser without a frame clock. */
export function tickSceneClock(fallback: number): void {
  const now = document.timeline?.currentTime;
  let step: number;
  if (typeof now === "number") {
    step = sceneClock.last < 0 ? 1 / 60 : Math.max(0, now - sceneClock.last) / 1000;
    sceneClock.last = now;
  } else step = fallback;
  sceneClock.gap = step > 0.5;
  sceneClock.dt = sceneClock.gap ? 1 / 60 : Math.min(0.1, step);
  sceneClock.time += sceneClock.dt;
}
