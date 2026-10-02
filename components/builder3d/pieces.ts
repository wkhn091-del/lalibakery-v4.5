// The builder preview's geometry, procedural like the hero's (no model files to download).
// Scene units are about 10 cm; y is up, the cake stands on y = 0 and faces +z (the camera).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

export function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
/** merged into one geometry, normals recomputed (the parts are made non-indexed so any mix merges) */
function merge(parts: THREE.BufferGeometry[]) {
  const out = mergeGeometries(parts.map((p) => {
    const f = flat(p);
    f.deleteAttribute("uv");
    return f;
  }))!;
  out.computeVertexNormals();
  return out;
}

// ─── Base shapes ─────────────────────────────────────────────────────────────────────

/** the rounding of a round cake's top edge */
export const roundEdge = (radius: number) => Math.min(0.07, radius * 0.08);

/** a slice taken out: the angles (round the y axis, 0 toward the camera) it's cut between */
export type Wedge = { from: number; to: number };
const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/**
 * A frosted round cake: straight side, a softly rounded top edge, slightly uneven like a hand-smoothed
 * coat. With a wedge, that slice is left out (its cut faces are drawn by cutFaces).
 */
export function roundCakeGeometry(radius: number, height: number, wedge?: Wedge) {
  const e = roundEdge(radius);
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(radius - 0.01, 0), new THREE.Vector2(radius, 0.012)];
  for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector2(radius, 0.02 + ((height - e - 0.02) * i) / 6));
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - e + Math.cos(a) * e, height - e + Math.sin(a) * e));
  }
  pts.push(new THREE.Vector2(0, height));
  const length = wedge ? Math.PI * 2 - (wedge.to - wedge.from) : Math.PI * 2;
  const g = new THREE.LatheGeometry(pts, Math.round((96 * length) / (Math.PI * 2)), wedge?.to ?? 0, length);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 0.02) continue;
    const a = Math.atan2(x, z);
    // straight where it's cut, so the coat meets the cut faces
    const fade = wedge ? THREE.MathUtils.smoothstep(Math.min(angleGap(a, wedge.from), angleGap(a, wedge.to)), 0, 0.3) : 1;
    const k = 1 + fade * (0.004 * Math.sin(a * 5 + pos.getY(i) * 3) + 0.003 * Math.sin(a * 11));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** The board under the cake, a little wider than it */
export const boardGeometry = (radius: number) => new THREE.CylinderGeometry(radius, radius, 0.04, 96).translate(0, -0.02, 0);
export const rectBoardGeometry = (w: number, d: number) => new RoundedBoxGeometry(w, 0.04, d, 2, 0.02).translate(0, -0.02, 0);

export const TRAY_EDGE = 0.04;

/**
 * A sheet cake in its tray shape, its top edges softly rounded, with a square piece cut out of its
 * front right corner: everything past x and z (the cut faces are drawn by cutFaces).
 */
export function trayGeometry(w: number, d: number, h: number, notch: { x: number; z: number }) {
  const r = 0.06;
  // the outline as it lies on the board; the shape's y is the world's -z
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, d / 2 * -1);
  s.lineTo(w / 2 - r, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, notch.z);
  s.lineTo(notch.x, notch.z);
  s.lineTo(notch.x, d / 2);
  s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const flipped = new THREE.Shape(s.getPoints(6).map((p) => new THREE.Vector2(p.x, -p.y)));
  const g = new THREE.ExtrudeGeometry(flipped, { depth: h - 2 * TRAY_EDGE, curveSegments: 6, bevelEnabled: true, bevelThickness: TRAY_EDGE, bevelSize: TRAY_EDGE, bevelOffset: -TRAY_EDGE, bevelSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, TRAY_EDGE, 0);
  g.computeVertexNormals();
  return g;
}

// ─── Inside the cake ─────────────────────────────────────────────────────────────────

/** one face of the cut: where its inner edge stands, the way across it to the coat, the way it faces */
export type CutFace = { origin: THREE.Vector3; along: THREE.Vector3; facing: THREE.Vector3; width: number };
export type CutPart = "coat" | "sponge" | "cream" | "filling";

const COAT = 0.045;
const CRUMB_SCALE = 1.6;

/**
 * The layers seen where the cake is cut, as one geometry for each of what they're made of: each sponge layer,
 * between each two layers a band of cream with the filling inside its ring (or cream all through),
 * and the coat over the top and down the outside. `edge` rounds the coat's top outer corner.
 */
/** `fills[i]`: the gap after sponge layer i has a filling (the cake has fills.length + 1 layers). The filling of each gap comes back on its own, so each can take its own colour */
export function cutFaces(faces: CutFace[], height: number, fills: boolean[], edge: number): CutGeometries {
  const layers = fills.length + 1;
  const parts: Record<CutPart, THREE.BufferGeometry[]> = { coat: [], sponge: [], cream: [], filling: [] };
  const gaps: THREE.BufferGeometry[][] = fills.map(() => []);
  const sponges: THREE.BufferGeometry[][] = Array.from({ length: layers }, () => []);
  for (const face of faces) {
    const W = face.width;
    const local: [CutPart, THREE.BufferGeometry, number][] = [];
    // the number: which gap a filling is in, or which layer a sponge is
    const rect = (part: CutPart, x0: number, x1: number, y0: number, y1: number, lift: number, gap = -1) => {
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;
      const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, lift);
      local.push([part, g, gap]);
    };
    rect("coat", W - COAT, W, 0, height - edge, 0.0005);
    rect("coat", 0, W - edge, height - COAT, height, 0.0005);
    if (edge > 0) local.push(["coat", new THREE.CircleGeometry(edge, 10, 0, Math.PI / 2).translate(W - edge, height - edge, 0.0005), -1]);
    const inner = height - COAT;
    const s = inner / (layers + (layers - 1) * 0.24);
    const c = s * 0.24;
    const ring = (W - COAT) * 0.74;
    let y = 0;
    for (let i = 0; i < layers; i++) {
      rect("sponge", 0, W - COAT, y, y + s, 0.002, i);
      y += s;
      if (i === layers - 1) break;
      if (fills[i]) {
        rect("filling", 0, ring, y, y + c, 0.002, i);
        rect("cream", ring, W - COAT, y, y + c, 0.002);
      } else rect("cream", 0, W - COAT, y, y + c, 0.002);
      y += c;
    }
    const basis = new THREE.Matrix4().makeBasis(face.along, new THREE.Vector3(0, 1, 0), face.facing).setPosition(face.origin);
    const mirrored = basis.determinant() < 0;
    for (const [part, g, gap] of local) {
      const f = flat(g);
      // the crumb follows where it is on the face, not each band's own corners
      const pos = f.attributes.position as THREE.BufferAttribute;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) uv.set([pos.getX(i) * CRUMB_SCALE, pos.getY(i) * CRUMB_SCALE], i * 2);
      f.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      f.applyMatrix4(basis);
      // a mirroring basis turns the triangles' front away: wind them back
      if (mirrored) {
        for (let i = 0; i < pos.count; i += 3) {
          for (const attr of [f.attributes.position, f.attributes.uv] as THREE.BufferAttribute[]) {
            const n = attr.itemSize;
            const a = Array.from(attr.array.slice((i + 1) * n, (i + 2) * n));
            attr.array.copyWithin((i + 1) * n, (i + 2) * n, (i + 3) * n);
            (attr.array as Float32Array).set(a, (i + 2) * n);
          }
        }
      }
      f.deleteAttribute("normal");
      if (gap >= 0) (part === "sponge" ? sponges : gaps)[gap].push(f);
      else parts[part].push(f);
    }
  }
  const merged = (list: THREE.BufferGeometry[]) => {
    if (!list.length) return null;
    const g = mergeGeometries(list)!;
    g.computeVertexNormals();
    list.forEach((x) => x.dispose());
    return g;
  };
  return { coat: merged(parts.coat), sponges: sponges.map(merged), cream: merged(parts.cream), fillings: gaps.map(merged) };
}
export type CutGeometries = { coat: THREE.BufferGeometry | null; sponges: (THREE.BufferGeometry | null)[]; cream: THREE.BufferGeometry | null; fillings: (THREE.BufferGeometry | null)[] };

/** The sponge's crumb: fine pores and specks, white so it takes the base's colour */
export function crumbTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, 256, 256);
  const rnd = rng(23);
  for (let i = 0; i < 2600; i++) {
    const r = 0.4 + rnd() ** 3 * 2.6;
    const dark = rnd() < 0.8;
    x.fillStyle = dark ? `rgba(70,45,25,${0.08 + rnd() * 0.22})` : `rgba(255,250,240,${0.3 + rnd() * 0.4})`;
    x.beginPath();
    x.ellipse(rnd() * 256, rnd() * 256, r * (0.8 + rnd() * 0.6), r, rnd() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The outline of the number or letters, centred on the origin in the xy plane (height = size) */
export function figureShapes(font: Font, visual: string, size: number) {
  const shapes = font.generateShapes(visual, size);
  const box = new THREE.Box2();
  shapes.forEach((s) => s.getPoints(8).forEach((p) => box.expandByPoint(p)));
  const c = box.getCenter(new THREE.Vector2());
  const moved = shapes.map((s) => {
    const m = new THREE.Shape(s.getPoints(10).map((p) => p.clone().sub(c)));
    m.holes = s.holes.map((h) => new THREE.Path(h.getPoints(10).map((p) => p.clone().sub(c))));
    return m;
  });
  return { shapes: moved, width: box.max.x - box.min.x, height: box.max.y - box.min.y };
}

/** One shortbread layer of a number cake: the outline extruded upward, edges softly bevelled */
export function figureLayerGeometry(shapes: THREE.Shape[], depth: number) {
  const g = new THREE.ExtrudeGeometry(shapes, { depth, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 3 });
  g.rotateX(-Math.PI / 2); // the outline lies flat, its top toward the back, the extrusion upward
  g.translate(0, 0.025, 0);
  g.computeVertexNormals();
  return g;
}

const inPolygon = (p: THREE.Vector2, poly: THREE.Vector2[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** Points inside the outline, on a staggered grid, far enough from its edges for a dollop of cream */
export function insidePoints(shapes: THREE.Shape[], spacing: number, margin: number): THREE.Vector2[] {
  const outlines = shapes.map((s) => ({ shape: s.getPoints(12), holes: s.holes.map((h) => h.getPoints(12)) }));
  const box = new THREE.Box2();
  outlines.forEach((o) => o.shape.forEach((p) => box.expandByPoint(p)));
  const inside = (p: THREE.Vector2) => outlines.some((o) => inPolygon(p, o.shape) && !o.holes.some((h) => inPolygon(p, h)));
  const probes = Array.from({ length: 8 }, (_, k) => new THREE.Vector2(Math.cos((k / 8) * Math.PI * 2) * margin, Math.sin((k / 8) * Math.PI * 2) * margin));
  const out: THREE.Vector2[] = [];
  const row = spacing * 0.87;
  for (let y = box.min.y, r = 0; y <= box.max.y; y += row, r++) {
    for (let x = box.min.x + (r % 2 ? spacing / 2 : 0); x <= box.max.x; x += spacing) {
      const p = new THREE.Vector2(x, y);
      if (inside(p) && probes.every((d) => inside(p.clone().add(d)))) out.push(p);
    }
  }
  return out;
}

/** A piped kiss of cream from a star tip: a ridged drop with a pulled-up point */
export function kissGeometry(detail = 24) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= detail; i++) {
    const t = i / detail;
    const r = Math.pow(Math.sin(Math.PI * Math.min(1, 0.5 + t * 0.5)), 0.7) * (1 - t) ** 0.55;
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * 1.25));
  }
  const g = new THREE.LatheGeometry(pts, 48);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(x, z) + pos.getY(i) * 1.4;
    const k = 1 + 0.12 * Math.cos(8 * a);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A cupcake's pleated paper liner, open at the top */
export function linerGeometry() {
  const g = new THREE.CylinderGeometry(0.33, 0.26, 0.36, 96, 1, true);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = 1 + 0.035 * Math.cos(Math.atan2(x, z) * 24);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.translate(0, 0.18, 0);
  g.computeVertexNormals();
  return g;
}

/** The cupcake itself, domed over the liner */
export const cupcakeDomeGeometry = () => new THREE.SphereGeometry(0.34, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, 0.34, 0);

/** A swirl of frosting piped round and up, narrowing to a point */
export function swirlGeometry() {
  const turns = 2.6;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const a = t * turns * Math.PI * 2;
    const r = 0.24 * (1 - t) + 0.015;
    pts.push(new THREE.Vector3(Math.sin(a) * r, 0.42 + t * 0.32, Math.cos(a) * r));
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.085, 14, false);
  const pos = tube.attributes.position as THREE.BufferAttribute;
  // thinner toward the top, as the pressure eases off
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y - 0.42) / 0.32;
    const s = 1 - Math.max(0, Math.min(1, t)) * 0.45;
    pos.setX(i, pos.getX(i) * (0.92 + 0.08 * s));
    pos.setZ(i, pos.getZ(i) * (0.92 + 0.08 * s));
  }
  const tip = new THREE.SphereGeometry(0.06, 16, 10).translate(0, 0.76, 0);
  return merge([tube, tip]);
}

/** A rosette from a star tip, about 1.5 cm across: a low spiral wound in from the outside, ridged */
export function rosetteGeometry() {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const a = t * 1.8 * Math.PI * 2;
    const r = 0.05 * (1 - t) + 0.006;
    pts.push(new THREE.Vector3(Math.sin(a) * r, 0.018 + t * 0.022, Math.cos(a) * r));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.021, 10, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = 1 + 0.06 * Math.cos(8 * Math.atan2(x, z));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A drip's stem, one unit long hanging down from y = 0 (scaled to its length), and the round drop at its end */
export const dripStemGeometry = () => new THREE.CylinderGeometry(0.026, 0.03, 1, 12, 1).translate(0, -0.5, 0);
export const dripDropGeometry = () => new THREE.SphereGeometry(0.036, 16, 10).scale(1, 1.25, 1);

// ─── Add-on pieces ───────────────────────────────────────────────────────────────────

/** A rose: petals in a tightening spiral round a closed bud */
export function roseGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const bud = new THREE.SphereGeometry(0.32, 16, 12).scale(1, 1.15, 1).translate(0, 0.42, 0);
  parts.push(bud);
  for (let k = 0; k < 11; k++) {
    const ring = k / 11;
    const petal = new THREE.SphereGeometry(0.5, 14, 10, -0.9, 1.8, 0.2, 1.6);
    petal.scale(0.55 + ring * 0.7, 0.7 + ring * 0.2, 0.55 + ring * 0.7);
    petal.rotateX(-0.25 - ring * 0.5);
    petal.translate(0, 0.35 - ring * 0.1, 0);
    petal.rotateY(k * 2.4);
    parts.push(petal);
  }
  return merge(parts);
}

/** A leaf, pointed, curving down from its stem */
export function leafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.35, 0.25, 0, 1);
  shape.quadraticCurveTo(-0.35, 0.25, 0, 0);
  const g = new THREE.ShapeGeometry(shape, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -0.25 * pos.getY(i) ** 2 + 0.06 * Math.abs(pos.getX(i)));
  g.rotateX(-Math.PI / 2 + 0.35);
  g.computeVertexNormals();
  return g;
}

/** A sugar floret: five rounded petals and a centre (flowers made of sugar paste) */
export function floretGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const petal = new THREE.SphereGeometry(1, 12, 8).scale(0.42, 0.14, 0.3).translate(0.48, 0.05, 0).rotateZ(0.22).rotateY((k / 5) * Math.PI * 2);
    parts.push(petal);
  }
  parts.push(new THREE.SphereGeometry(0.22, 12, 8).translate(0, 0.16, 0));
  return merge(parts);
}

/** A torn flake of gold leaf, in its xy plane, facing +z */
export function goldLeafGeometry() {
  const rnd = rng(41);
  const around = 16;
  const edge = Array.from({ length: around }, () => 0.62 + rnd() * 0.5);
  const positions: number[] = [0, 0, 0];
  const index: number[] = [];
  for (let r = 1; r <= 3; r++) {
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      const rad = (r / 3) * edge[k];
      positions.push(Math.cos(a) * rad, Math.sin(a) * rad * 0.8, 0.06 * Math.sin(a * 3 + r) * (r / 3));
    }
  }
  for (let k = 0; k < around; k++) index.push(0, 1 + k, 1 + ((k + 1) % around));
  for (let r = 1; r < 3; r++) {
    for (let k = 0; k < around; k++) {
      const a = 1 + (r - 1) * around + k;
      const b = 1 + (r - 1) * around + ((k + 1) % around);
      index.push(a, a + around, b, b, a + around, b + around);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A macaron, about 4 cm across: two domed shells with their ruffled feet, and the filling between */
export function macaronGeometry() {
  const r = 0.2;
  const shell = (up: boolean) => {
    const dome = new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1);
    const foot = new THREE.CylinderGeometry(r * 0.99, r * 0.94, 0.035, 28, 1, true);
    const pos = foot.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + 0.03 * Math.sin(Math.atan2(pos.getX(i), pos.getZ(i)) * 22);
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    foot.translate(0, -0.0175, 0);
    const g = merge([dome, foot]);
    if (!up) g.rotateX(Math.PI);
    return g.translate(0, up ? 0.105 : 0.0125, 0);
  };
  const shells = merge([shell(true), shell(false)]);
  const filling = new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.045, 28).translate(0, 0.0575, 0);
  return { shells, filling };
}

/** A strawberry, pointing up, with its green calyx at the bottom (it lies on its side on the cake) */
export function strawberryGeometry() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(Math.max(0.002, Math.sin(Math.PI * (0.15 + t * 0.85)) * 0.1 * (1 - t * 0.35)), t * 0.24));
  }
  const berry = new THREE.LatheGeometry(pts, 24);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    parts.push(new THREE.ConeGeometry(0.022, 0.09, 4).rotateZ(Math.PI / 2 + 0.5).translate(0.04, 0.01, 0).rotateY((k / 6) * Math.PI * 2));
  }
  return { berry, calyx: merge(parts) };
}

/** A raspberry: a cone of drupelets */
export function raspberryGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 5; row++) {
    const n = 8 - row;
    const ring = 0.06 * Math.sin(Math.PI * (0.25 + (row / 5) * 0.65));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + row * 0.4;
      parts.push(new THREE.SphereGeometry(0.022, 8, 6).translate(Math.sin(a) * ring, 0.02 + row * 0.025, Math.cos(a) * ring));
    }
  }
  return merge(parts);
}

export const blueberryGeometry = () => new THREE.SphereGeometry(0.055, 18, 12).scale(1, 0.88, 1);

/** A topper's text, upright and centred, in the 3D font */
export function topperTextGeometry(font: Font, visual: string, maxWidth: number) {
  const make = (size: number) => new TextGeometry(visual, { font, size, depth: 0.025, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 2 });
  let g = make(0.22);
  g.computeBoundingBox();
  const w = g.boundingBox!.max.x - g.boundingBox!.min.x;
  if (w > maxWidth) {
    g.dispose();
    g = make((0.22 * maxWidth) / w);
    g.computeBoundingBox();
  }
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -0.0125);
  return g;
}

/** A heart, for a topper with no words yet */
export function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.14);
  s.bezierCurveTo(-0.05, -0.08, -0.17, -0.02, -0.17, 0.06);
  s.bezierCurveTo(-0.17, 0.13, -0.09, 0.17, 0, 0.1);
  s.bezierCurveTo(0.09, 0.17, 0.17, 0.13, 0.17, 0.06);
  s.bezierCurveTo(0.17, -0.02, 0.05, -0.08, 0, -0.14);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0.14, -0.0125);
  return g;
}

/** A sugar-paste teddy bear, sitting, about 8 cm tall */
export function bearGeometry() {
  const body = merge([
    new THREE.SphereGeometry(0.17, 20, 14).scale(1, 1.1, 0.9).translate(0, 0.17, 0),
    new THREE.SphereGeometry(0.06, 12, 8).translate(-0.11, 0.06, 0.1),
    new THREE.SphereGeometry(0.06, 12, 8).translate(0.11, 0.06, 0.1),
    new THREE.SphereGeometry(0.05, 12, 8).scale(1, 1.4, 1).translate(-0.16, 0.22, 0.05),
    new THREE.SphereGeometry(0.05, 12, 8).scale(1, 1.4, 1).translate(0.16, 0.22, 0.05),
    new THREE.SphereGeometry(0.14, 20, 14).translate(0, 0.43, 0),
    new THREE.SphereGeometry(0.05, 12, 8).translate(-0.1, 0.55, 0),
    new THREE.SphereGeometry(0.05, 12, 8).translate(0.1, 0.55, 0),
  ]);
  const muzzle = new THREE.SphereGeometry(0.06, 14, 10).scale(1, 0.75, 0.8).translate(0, 0.4, 0.12);
  const eyes = merge([
    new THREE.SphereGeometry(0.016, 8, 6).translate(-0.05, 0.47, 0.125),
    new THREE.SphereGeometry(0.016, 8, 6).translate(0.05, 0.47, 0.125),
    new THREE.SphereGeometry(0.02, 8, 6).scale(1.2, 0.8, 1).translate(0, 0.42, 0.175),
  ]);
  return { body, muzzle, eyes };
}

/** A candle, 7 cm, its spiral stripe painted in vertex colours */
export function candleGeometry(stripe: THREE.Color, base: THREE.Color) {
  const g = new THREE.CylinderGeometry(0.035, 0.035, 0.7, 14, 24).translate(0, 0.35, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    const c = Math.sin(a + pos.getY(i) * 22) > 0.3 ? stripe : base;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A flame: a drop pointing up, its base at the origin */
export function flameGeometry() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(Math.max(0.0005, Math.sin(Math.PI * Math.min(1, t * 1.6)) * 0.04 * (1 - t) ** 0.6), t * 0.17));
  }
  return new THREE.LatheGeometry(pts, 12);
}

/** A number candle's digits, upright, standing on y = 0 */
export function numberCandleGeometry(font: Font, digits: string) {
  const g = new TextGeometry(digits, { font, size: 0.42, depth: 0.08, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 3 });
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -0.04);
  return { geometry: g, height: b.max.y - b.min.y };
}

/** An edible print: the photo's place, drawn as a soft picture frame (the real photo is sent by WhatsApp) */
export function printTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const sky = x.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#f7dfe3");
  sky.addColorStop(1, "#fbefe6");
  x.fillStyle = sky;
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = "#e9b9c0";
  x.beginPath();
  x.moveTo(20, 210);
  x.lineTo(95, 120);
  x.lineTo(150, 180);
  x.lineTo(185, 145);
  x.lineTo(236, 210);
  x.closePath();
  x.fill();
  x.fillStyle = "#f3c98f";
  x.beginPath();
  x.arc(185, 80, 24, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round shadow under the cake */
export function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(60,30,30,0.42)");
  g.addColorStop(0.55, "rgba(60,30,30,0.16)");
  g.addColorStop(1, "rgba(60,30,30,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
