import type { Region } from "./store";
import { clamp01, smootherstep, stage, STAGES } from "./timeline";

// How the cake is framed, shared by the page and the scene. No three.js here: the page's own bundle
// uses it too (HeroCanvas measures where the cake has room, and paints the loading background with
// the studio's light exactly where the scene will draw it).

/** The lens's vertical field of view, in degrees */
export const FOV = 30;
/** The stand's plate radius: the cake's widest point */
export const PLATE = 1.32;
/** Half the height to keep in frame, from the stand's foot: the finished cake, and the exploded stack */
export const HALF_HEIGHT = { finished: 0.9, exploded: 1.84 };
/** The backdrop's glow: centred on the finished cake's middle, lifted a tenth of the screen */
export const GLOW = { y: 1.1, lift: 0.1 };
/** The smallest free region the framing accepts (fractions of the hero). A sliver would send the
 *  camera so far back that the cake fell behind the far clipping plane. */
export const MIN_REGION = { w: 0.15, h: 0.2 };
/** The farthest the camera stands back (the far plane is at 60); past it the cake just shows larger */
export const MAX_DISTANCE = 40;
/** How far round the cake the scene reaches: the swarm drifting out, the gold flakes, the slice */
export const SCENE_REACH = 12;

// The camera's journey through the assembly, as shots at points of the progress. Each shot is an
// orbit round the cake (azimuth from the front, elevation, in degrees), a zoom (1 = the whole cake
// fills the free part of the screen; below 1 = closer) and where to look, relative to the cake's
// centre. The cake is framed in the free region the page measured by shifting the lens.
export type Shot = { at: number; az: number; el: number; zoom: number; look: [number, number, number] };
export const SHOTS: Shot[] = [
  { at: 0.0, az: -8, el: 11, zoom: 1.0, look: [0, 0, 0] }, // the exploded cake, whole
  { at: 0.06, az: -6, el: 12, zoom: 1.0, look: [0, 0, 0] },
  { at: 0.22, az: 16, el: 14, zoom: 0.97, look: [0, 0, 0] }, // alongside, as the layers land
  { at: 0.38, az: 24, el: 15, zoom: 0.95, look: [0, 0, 0] },
  { at: 0.5, az: 10, el: 17, zoom: 0.95, look: [0, 0, 0] }, // the coat
  { at: 0.6, az: 4, el: 24, zoom: 0.88, look: [0, 0.22, 0.05] }, // over the top edge, as the border is piped
  { at: 0.67, az: 2, el: 8, zoom: 0.84, look: [0, -0.22, 0.3] }, // closer on the ribbon and the bow
  { at: 0.76, az: -3, el: 9, zoom: 0.86, look: [0, -0.05, 0.2] }, // the letters and the gold leaf
  { at: 0.88, az: -10, el: 14, zoom: 1.12, look: [0, 0, 0] }, // the complete cake, in its ring of sweets
  { at: 0.95, az: 36, el: 17, zoom: 0.98, look: [0.3, 0, 0.2] }, // onto the slice
  { at: 1.0, az: 30, el: 18, zoom: 1.02, look: [0.25, 0, 0.15] },
];

const TAN = Math.tan((FOV / 2) * (Math.PI / 180));
/** The exploded stack's flight into place: from the first layer's step to the last layer's */
const EXPLODED = [STAGES.layer0[0], STAGES.layer2[1]] as const;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);

/** A moment's framing: the orbit (degrees), the zoom, where to look relative to the cake's centre,
 *  and what has to fit (up from the stand's foot, and either side of the axis) */
export type Framing = { az: number; el: number; zoom: number; look: [number, number, number]; halfH: number; halfW: number };
export const framing = (): Framing => ({ az: 0, el: 0, zoom: 1, look: [0, 0, 0], halfH: 1, halfW: 1 });

/** The framing at a moment of the assembly, eased between the shots either side (written into `out`) */
export function shotAt(progress: number, out: Framing): Framing {
  const p = clamp01(finite(progress, 0)); // the scrub stays in 0–1; anything else holds at the ends
  let k = 0;
  while (k < SHOTS.length - 2 && p > SHOTS[k + 1].at) k++;
  const a = SHOTS[k];
  const b = SHOTS[k + 1];
  const t = smootherstep(clamp01((p - a.at) / (b.at - a.at)));
  out.az = lerp(a.az, b.az, t);
  out.el = lerp(a.el, b.el, t);
  out.zoom = lerp(a.zoom, b.zoom, t);
  for (let i = 0; i < 3; i++) out.look[i] = lerp(a.look[i], b.look[i], t);
  // what has to fit: the exploded stack, then the finished cake; the lifted slice widens it
  const explode = 1 - smootherstep(stage(p, EXPLODED));
  out.halfH = lerp(HALF_HEIGHT.finished, HALF_HEIGHT.exploded, explode);
  out.halfW = PLATE + 0.45 * smootherstep(stage(p, STAGES.slice));
  return out;
}

/** A free region the framing can trust: finite, inside the hero, and never a sliver */
export function saneRegion(r: Region): Region {
  const w = Math.min(1, Math.max(MIN_REGION.w, finite(r.w, 0.36)));
  const h = Math.min(1, Math.max(MIN_REGION.h, finite(r.h, 0.76)));
  const x = Math.min(1 - w, Math.max(0, finite(r.x, 0.08)));
  const y = Math.min(1 - h, Math.max(0, finite(r.y, 0.12)));
  return { x, y, w, h };
}

/** How far the camera stands so that `halfH` (up from the stand's foot) and `halfW` (either side of
 *  the axis) fit the free region, with air; closer by `zoom`. Never past MAX_DISTANCE. */
export function shotDistance(region: Region, aspect: number, halfH: number, halfW: number, zoom: number) {
  const w = Math.max(MIN_REGION.w, finite(region.w, 0.36));
  const h = Math.max(MIN_REGION.h, finite(region.h, 0.76));
  const a = Math.max(0.2, finite(aspect, 1));
  const fitH = (halfH * 1.08) / (h * TAN);
  const fitW = (halfW * (a < 1 ? 1.2 : 1.12)) / (w * TAN * a); // narrow screens need the air
  return Math.min(MAX_DISTANCE, (Math.max(fitH, fitW) + PLATE * 0.55) * zoom);
}

/**
 * Where the studio's light falls on screen at a moment of the assembly, as fractions of the hero
 * from its top-left: the backdrop's glow behind the cake, and the floor light round the stand's
 * foot (exact for the shots that look at the cake's axis: the opening one, and the complete cake
 * that reduced motion opens on).
 */
export function studioLight(region: Region, aspect: number, p: number) {
  const r = saneRegion(region);
  const f = shotAt(p, framing());
  const distance = shotDistance(r, aspect, f.halfH, f.halfW, f.zoom);
  const el = f.el * (Math.PI / 180);
  const drop = (below: number) => (below * Math.cos(el)) / ((distance + below * Math.sin(el)) * 2 * TAN);
  const x = r.x + r.w / 2;
  const y = r.y + r.h / 2;
  const lookY = f.halfH + f.look[1];
  return { glow: { x, y: y + drop(lookY - GLOW.y) - GLOW.lift }, floor: { x, y: y + drop(lookY) } };
}

type Box = { l: number; t: number; r: number; b: number }; // fractions of the hero

/** Everything the cake must stay clear of: each line of the headline block, its button, the logo */
function obstacles(hero: DOMRect, copy: HTMLElement | null, header: HTMLElement | null): Box[] {
  const out: Box[] = [];
  const W = Math.max(1, hero.width);
  const H = Math.max(1, hero.height);
  const add = (r: DOMRect) => {
    if (r.width > 0 && r.height > 0)
      out.push({ l: (r.left - hero.left) / W, t: (r.top - hero.top) / H, r: (r.right - hero.left) / W, b: (r.bottom - hero.top) / H });
  };
  if (copy) {
    const range = document.createRange();
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) add(r);
    }
    copy.querySelectorAll("a, button").forEach((el) => add(el.getBoundingClientRect()));
  }
  header?.querySelectorAll("img, a, button").forEach((el) => add(el.getBoundingClientRect()));
  return out;
}

/**
 * Where the cake has room: the roomiest rectangle clear of the words and the logo, measured from
 * the page's own layout. Beside the headline on wide screens, above it on phones; inside the card
 * the hero shrinks into on desktops. Never an empty, inverted or sliver region.
 */
export function measureRegion(el: HTMLElement, copy: HTMLElement | null, header: HTMLElement | null): Region {
  const s = el.getBoundingClientRect();
  const W = Math.max(1, s.width);
  const H = Math.max(1, s.height);
  const card = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches;
  const inset = card ? { x: 0.1, y: 0.06 } : { x: 0.02, y: 0.02 };
  const area = { l: inset.x + 0.015, t: inset.y + 0.02, r: 1 - inset.x - 0.015, b: 1 - inset.y - 0.03 };
  const padX = 20 / W;
  const padY = 16 / H;
  const obs = obstacles(s, copy, header).map((o) => ({ l: o.l - padX, t: o.t - padY, r: o.r + padX, b: o.b + padY }));
  // how large the cake would show here: finished about 2.7 wide and 2.3 tall, exploded about 3.8 tall
  const fit = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return 0;
    const finished = Math.min((w * W) / 2.7, (h * H) / 2.3);
    const exploded = Math.min((w * W) / 2.7, (h * H) / 3.8);
    return 0.6 * finished + 0.4 * exploded;
  };

  const spans: [number, number][] = [[area.l, area.r]];
  for (const o of obs) {
    if (o.l > area.l) spans.push([area.l, Math.min(o.l, area.r)]);
    if (o.r < area.r) spans.push([Math.max(o.r, area.l), area.r]);
  }
  let best: Region = { x: area.l, y: area.t, w: area.r - area.l, h: area.b - area.t }; // nothing fits: the whole hero
  let bestScore = 0;
  for (const [x0, x1] of spans) {
    if (x1 - x0 < MIN_REGION.w) continue; // too narrow to frame the cake in
    const blocking = obs.filter((o) => o.l < x1 && o.r > x0).sort((a, b) => a.t - b.t);
    let y = area.t;
    const gaps: [number, number][] = [];
    for (const o of blocking) {
      const end = Math.min(o.t, area.b);
      if (end - y >= MIN_REGION.h) gaps.push([y, end]); // never an empty, inverted or sliver gap
      y = Math.max(y, o.b);
    }
    if (area.b - y >= MIN_REGION.h) gaps.push([y, area.b]);
    for (const [y0, y1] of gaps) {
      const score = fit(x1 - x0, y1 - y0);
      if (score > bestScore) {
        bestScore = score;
        best = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
    }
  }
  return saneRegion(best);
}
