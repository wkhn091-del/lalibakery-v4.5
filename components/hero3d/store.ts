// The 3D hero's shared state. The page writes it (scroll progress, visibility, pointer, where the
// cake has room on screen); the 3D scene reads it every frame. Plain values, so neither side
// re-renders React to talk to the other, and no three.js here: Hero.tsx imports this file, and
// three.js must stay out of the page's main bundle.

import { INSCRIPTION } from "./config";

/** A rectangle on screen, as fractions of the hero (x, y from the top-left) */
export type Region = { x: number; y: number; w: number; h: number };

export const hero3d = {
  /** How far the assembly has come, 0–1. Played by a timed GSAP tween in Hero.tsx once the scene is ready. */
  progress: 0,
  /** How fast the page is scrolling, px/s (it stirs the floating sweets) */
  velocity: 0,
  /** The first frame has been drawn */
  ready: false,
  /** The hero is on screen (the canvas stops drawing when it isn't) */
  visible: true,
  /** Pointer position, −1…1, for a touch of parallax (desktops) */
  pointer: { x: 0, y: 0 },
  /** Where the cake has room: clear of the headline and the logo. Measured from the layout. */
  region: { x: 0.08, y: 0.12, w: 0.36, h: 0.76 } as Region,
  /** The lens shift actually applied (Version 7's convention: 0.2 = subject 20% right of centre) */
  frame: { x: 0, y: 0 },
  /** Where the lens focuses (the camera's look-at point), in scene units */
  focus: { x: 0, y: 1.1, z: 0 },
  /** A camera cut: the next frame jumps straight to its shot instead of gliding there. Set by the
   *  warm-up (HeroScene.tsx); the camera clears it. */
  cut: false,
};

/*
  The inscription on the cake. The page sets it (Hero.tsx, from "דף הבית" in the CMS) before the
  scene first renders, so the warm-up rehearses the right letters; the letters subscribe to it
  (CakeAssembly.tsx), so a new inscription typed in the Studio's preview redraws them alone, never
  the scene around them.
*/
let inscription = INSCRIPTION;
const inscribers = new Set<() => void>();
export const inscriptionStore = {
  get: () => inscription,
  subscribe(listener: () => void) {
    inscribers.add(listener);
    return () => {
      inscribers.delete(listener);
    };
  },
};
export function setInscription(text: string): void {
  if (!text || text === inscription) return;
  inscription = text;
  inscribers.forEach((listener) => listener());
}

const waiting = new Set<() => void>();

/** Runs `fn` once the scene has drawn its first frame (at once if it already has) */
export function onHero3DReady(fn: () => void): () => void {
  if (hero3d.ready) fn();
  else waiting.add(fn);
  return () => {
    waiting.delete(fn);
  };
}

export function markHero3DReady(): void {
  if (hero3d.ready) return;
  hero3d.ready = true;
  waiting.forEach((fn) => fn());
  waiting.clear();
}
