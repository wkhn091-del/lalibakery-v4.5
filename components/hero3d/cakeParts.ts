import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ─── Dimensions (scene units; about 10 cm each: the stand's plate is 2.6 across) ────────
// scripts/hero3d-textures.py draws the cut face from these numbers: keep the two in step.
export const PLATE_TOP = 0.6;
export const CAKE = { radius: 0.95, layer: 0.26, cream: 0.055, side: 0.045, topCoat: 0.05, fillet: 0.028, lip: 0.007 };
export const STACK_H = CAKE.layer * 3 + CAKE.cream * 2; // sponge and cream, 0.89
export const COAT_R = CAKE.radius + CAKE.side; // the frosted cake's radius
export const COAT_H = STACK_H + CAKE.topCoat; // the frosted cake's (flat) top
export const RIBBON = { radius: COAT_R + 0.008, height: 0.15, y: 0.02 };
/** Bottom of sponge layer i, measured from the plate */
export const layerBottom = (i: number) => i * (CAKE.layer + CAKE.cream);

// The slice: a 40° wedge on the cake's right (angles run from the front, +z, toward +x). Every
// part that crosses it is built in two pieces, the cake and the slice, so the slice can lift out.
export const CUT = { start: 0.75, length: 0.7 };
export type Piece = "cake" | "slice";
export const PIECES: Record<Piece, { start: number; length: number }> = {
  cake: { start: CUT.start + CUT.length, length: Math.PI * 2 - CUT.length },
  slice: { start: CUT.start, length: CUT.length },
};
const MID = CUT.start + CUT.length / 2;
export const SLICE_DIR = new THREE.Vector3(Math.sin(MID), 0, Math.cos(MID));
/** Whether an angle (radians, from the front) falls inside the slice */
export const inSlice = (a: number) => {
  const t = (((a - CUT.start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return t < CUT.length;
};
const segmentsFor = (length: number, full: number) => Math.max(8, Math.round((full * length) / (Math.PI * 2)));

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ─── Unevenness: smooth 3D noise (the same everywhere, so pieces of one layer meet exactly) ───
function hash3(x: number, y: number, z: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}

// ─── The stand ─────────────────────────────────────────────────────────────────────────
// Pedestal outline, as [radius, height] points
const STAND_PROFILE: [number, number][] = [
  [0, 0], [0.58, 0], [0.62, 0.012], [0.625, 0.03], [0.56, 0.052], [0.34, 0.085], [0.17, 0.13], [0.108, 0.18],
  [0.096, 0.32], [0.116, 0.4], [0.165, 0.455], [0.31, 0.505], [0.8, 0.54], [1.22, 0.56], [1.29, 0.574],
  [1.302, 0.592], [1.272, 0.604], [1.2, 0.6], [0, 0.6],
];
export const standGeometry = () => new THREE.LatheGeometry(STAND_PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), 128);

// ─── Sponge ────────────────────────────────────────────────────────────────────────────
/**
 * A sponge layer as a baker makes it, not a machined cylinder: a profile turned around the axis
 * with softly rounded edges, then made uneven from 3D noise baked into the geometry (the side bulges
 * and wavers, the leveled top undulates); the material's displacement map adds the crust's own
 * bumps on top. UVs follow the surface: round the side for the crust, flat across the top for the
 * crumb, as two material groups.
 */
export function spongeGeometry(piece: Piece, seed = 0) {
  const { start, length } = PIECES[piece];
  const r = CAKE.radius;
  const h = CAKE.layer;
  const f = 0.03;
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 4; k++) pts.push(new THREE.Vector2(Math.max(0.0005, (r - f) * (k / 4)), 0));
  for (let i = 1; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - f + Math.cos(a) * f, f + Math.sin(a) * f));
  }
  for (let i = 1; i <= 16; i++) pts.push(new THREE.Vector2(r, f + (i / 16) * (h - 2 * f)));
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - f + Math.cos(a) * f, h - f + Math.sin(a) * f));
  }
  for (let k = 3; k >= 0; k--) pts.push(new THREE.Vector2(Math.max(0.0005, (r - f) * (k / 4)), h));
  const g = new THREE.LatheGeometry(pts, segmentsFor(length, 180), start, length);

  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const rho = Math.hypot(p.x, p.z);
    const theta = Math.atan2(p.x, p.z);
    const cx = Math.cos(theta) * 1.6;
    const cz = Math.sin(theta) * 1.6;
    // side: bulges and wavers (fading out toward the centre of the top and bottom)
    const sideMask = Math.min(1, Math.max(0, (rho - (r - 0.12)) / 0.1));
    const bulge = 0.013 * noise3(cx + seed * 7, p.y * 5, cz) + 0.005 * noise3(cx * 4.3, p.y * 16 + seed, cz * 4.3);
    const scale = rho > 0.0001 ? (rho + bulge * sideMask) / rho : 1;
    p.x *= scale;
    p.z *= scale;
    // leveled top: a gentle undulation; the bottom stays flat (it sits on cream or the board)
    if (p.y > h - f) p.y += 0.007 * noise3(p.x * 3.5 + seed * 5, 11.3, p.z * 3.5) * Math.min(1, (p.y - (h - f)) / f);
    pos.setXYZ(i, p.x, p.y, p.z);
    // crust UVs round the side (7 repeats round), crumb UVs flat across the top
    if (p.y > h - f * 0.6 && rho < r - f * 0.4) uv.setXY(i, (p.x / r) * 1.1 + 0.5, (p.z / r) * 1.1 + 0.5);
    else uv.setXY(i, ((theta + Math.PI) / (Math.PI * 2)) * 7, (p.y / 0.26) * 0.34);
  }
  g.computeVertexNormals();

  // Two material groups: the leveled top (crumb) and everything else (crust)
  const index = g.index!.array;
  const crust: number[] = [];
  const crumb: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cr = (Math.hypot(pos.getX(a), pos.getZ(a)) + Math.hypot(pos.getX(b), pos.getZ(b)) + Math.hypot(pos.getX(c), pos.getZ(c))) / 3;
    (cy > h - f * 0.6 && cr < r - f * 0.4 ? crumb : crust).push(a, b, c);
  }
  g.setIndex([...crust, ...crumb]);
  g.clearGroups();
  g.addGroup(0, crust.length, 0);
  g.addGroup(crust.length, crumb.length, 1);
  return g;
}

/** The cream between layers: set slightly back from the sponge, a soft bulging edge that wavers
 *  where it was spread by hand, a gently uneven top. UVs run round the disc, so the buttercream
 *  strokes on the top circle it like a filling spread on a turntable. */
export function creamGeometry(piece: Piece) {
  const { start, length } = PIECES[piece];
  const rc = CAKE.radius - 0.02;
  const h = CAKE.cream;
  const pts = [new THREE.Vector2(0.0005, 0), new THREE.Vector2(rc - 0.012, 0)];
  for (let i = 1; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    pts.push(new THREE.Vector2(rc - 0.012 + Math.cos(a) * 0.017, h / 2 + Math.sin(a) * (h / 2)));
  }
  for (let k = 5; k >= 0; k--) pts.push(new THREE.Vector2(Math.max(0.0005, (rc - 0.02) * (k / 6)), h));
  const g = new THREE.LatheGeometry(pts, segmentsFor(length, 200), start, length);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const rho = Math.hypot(p.x, p.z);
    const theta = Math.atan2(p.x, p.z);
    const edge = Math.min(1, Math.max(0, (rho - (rc - 0.1)) / 0.08));
    const wobble = 0.012 * noise3(Math.cos(theta) * 2.2, 3.7, Math.sin(theta) * 2.2) + 0.004 * noise3(Math.cos(theta) * 9, 1.3, Math.sin(theta) * 9);
    const scale = rho > 0.0001 ? (rho + wobble * edge) / rho : 1;
    p.x *= scale;
    p.z *= scale;
    if (p.y > h * 0.6) p.y += 0.004 * noise3(p.x * 4, 7.1, p.z * 4);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

// ─── Buttercream coat ─────────────────────────────────────────────────────────────────
/** The coat's outline: straight sides, a crisp top edge with the slight lip a scraper leaves
 *  (the "crown"), then the flat top */
function coatProfile() {
  const f = CAKE.fillet;
  const lip = CAKE.lip;
  const pts: THREE.Vector2[] = [new THREE.Vector2(COAT_R, 0), new THREE.Vector2(COAT_R, COAT_H + lip - f)];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector2(COAT_R - f + Math.cos(a) * f, COAT_H + lip - f + Math.sin(a) * f));
  }
  // from the lip's crest, down into the flat top
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector2(COAT_R - f - t * 0.07, COAT_H + lip * (1 - t * t * (3 - 2 * t))));
  }
  pts.push(new THREE.Vector2(0, COAT_H));
  return pts;
}
export const COAT_TOP_RADIUS = COAT_R - CAKE.fillet - 0.07; // where the flat top begins
export function coatGeometry(piece: Piece) {
  const { start, length } = PIECES[piece];
  return new THREE.LatheGeometry(coatProfile(), segmentsFor(length, 200), start, length);
}

/** Height of the cake's outline at a distance from the centre (for the cut face) */
function outlineHeight(x: number) {
  const f = CAKE.fillet;
  const lip = CAKE.lip;
  if (x <= COAT_TOP_RADIUS) return COAT_H;
  if (x <= COAT_R - f) {
    const t = (COAT_R - f - x) / 0.07;
    return COAT_H + lip * (1 - t * t * (3 - 2 * t));
  }
  const dx = x - (COAT_R - f);
  return COAT_H + lip - f + Math.sqrt(Math.max(0, f * f - dx * dx));
}

/**
 * A face across the cut, showing the inside: a dense grid shaped to the cake's outline, so the
 * crumb's displacement map can give it real relief. `facing` = +1: the face looks toward
 * increasing angle (the side of the gap for the cake's face at the cut's start); −1 the other way.
 * UVs: u = distance from the centre / COAT_R, v = height / COAT_H (as the texture is drawn).
 */
export function cutFaceGeometry(angle: number, facing: 1 | -1, segments = 72) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const nx = segments;
  const ny = segments;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx) * COAT_R;
      const y = (j / ny) * outlineHeight(x);
      positions.push(x, y, 0);
      uvs.push(x / COAT_R, y / COAT_H);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      if (facing === -1) index.push(a, b, d, a, d, c); // normal +z locally → −tangent after turning
      else index.push(a, d, b, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.rotateY(angle - Math.PI / 2); // local +x → the radius at `angle`
  return g;
}

// ─── Gold satin ribbon ─────────────────────────────────────────────────────────────────
/** The band round the base; its triangles run in angle order, so drawRange wraps it on */
export function ribbonBandGeometry(piece: Piece) {
  const { start, length } = PIECES[piece];
  const g = new THREE.CylinderGeometry(RIBBON.radius, RIBBON.radius, RIBBON.height, segmentsFor(length, 160), 1, true, start, length);
  g.translate(0, RIBBON.y + RIBBON.height / 2, 0);
  return g;
}

// A flattened tube: a round tube squashed along an axis (per ring), so it reads as ribbon with a
// soft, rounded edge rather than as rope
function flatTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radius: number, closed: boolean, squash: number, axisFor: (centre: THREE.Vector3, out: THREE.Vector3) => void) {
  const g = new THREE.TubeGeometry(curve, segments, radius, 10, closed);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const axis = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    curve.getPointAt(i / segments, centre);
    axisFor(centre, axis);
    for (let j = 0; j <= 10; j++) {
      const k = i * 11 + j;
      v.fromBufferAttribute(pos, k).sub(centre);
      v.addScaledVector(axis, -v.dot(axis) * squash);
      v.add(centre);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** The ribbon of buttercream that spirals up round the sponge stack; drawRange grows it */
export function spiralGeometry() {
  const turns = 2.6;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 260; i++) {
    const t = i / 260;
    const a = t * turns * Math.PI * 2 + 0.4;
    const r = COAT_R + 0.035;
    points.push(new THREE.Vector3(Math.sin(a) * r, 0.06 + t * (COAT_H - 0.13), Math.cos(a) * r));
  }
  return flatTube(new THREE.CatmullRomCurve3(points), 520, 0.058, false, 0.62, (c, out) => out.set(c.x, 0, c.z).normalize());
}

/** The bow: two puffy satin loops, two tails and a knot, merged into one mesh */
export function bowGeometry() {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const loop = (s: number) =>
    new THREE.CatmullRomCurve3([V(0, 0, 0.03), V(0.1 * s, 0.09, 0.06), V(0.27 * s, 0.14, 0.05), V(0.38 * s, 0.06, 0.01), V(0.35 * s, -0.05, 0.01), V(0.2 * s, -0.07, 0.04), V(0.06 * s, -0.025, 0.05)], true);
  const tail = (s: number) => new THREE.CatmullRomCurve3([V(0.02 * s, -0.02, 0.05), V(0.08 * s, -0.13, 0.06), V(0.13 * s, -0.25, 0.04), V(0.18 * s, -0.36, 0.01)]);
  const depth = (_c: THREE.Vector3, out: THREE.Vector3) => out.set(0, 0, 1);
  const parts: THREE.BufferGeometry[] = [
    flatTube(loop(-1), 90, 0.05, true, 0.6, depth),
    flatTube(loop(1), 90, 0.05, true, 0.6, depth),
    flatTube(tail(-1), 40, 0.042, false, 0.72, depth),
    flatTube(tail(1), 40, 0.042, false, 0.72, depth),
  ];
  const knot = new THREE.SphereGeometry(1, 20, 14);
  knot.scale(0.075, 0.068, 0.05);
  knot.translate(0, 0, 0.055);
  parts.push(knot);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

// ─── Piped shell border ──────────────────────────────────────────────────────────────
// A star-tip shell, as a pastry bag lays it: a plump head tapering to a long tail, six ridges
// from the star nozzle turning slightly along it, and a flattened base where it sits on the cake.
// Built along +x (head at 0, tail at `length`), +y up, +z outward from the cake.
export const SHELL = { length: 0.2, radius: 0.064 };
export function shellGeometry(detail = 30) {
  const along = detail;
  const around = detail;
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const s = Math.pow(t, 0.6);
    const R = SHELL.radius * Math.pow(Math.sin(Math.PI * s), 0.85) * (1 - 0.12 * t);
    for (let j = 0; j <= around; j++) {
      const phi = (j / around) * Math.PI * 2;
      const ridge = 1 + 0.13 * Math.cos(6 * phi + t * 2.2);
      let y = Math.sin(phi) * R * ridge;
      const z = Math.cos(phi) * R * ridge;
      if (y < 0) y *= 0.35; // flattened where it rests on the cake
      positions.push(t * SHELL.length, y + R * 0.3, z);
    }
  }
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * (around + 1) + j;
      const b = a + around + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export type Placed = { matrix: THREE.Matrix4; angle: number; order: number; slice: boolean };

/** The shells round the top edge, head to tail, each covering the tail before it, with the small
 *  irregularities of a hand-piped border */
export function pipingLayout(): Placed[] {
  const rnd = rng(23);
  const rp = COAT_R - 0.07;
  const spacing = SHELL.length * 0.6;
  const count = Math.round((Math.PI * 2 * rp) / spacing);
  const out: Placed[] = [];
  const basis = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.2 + (rnd() - 0.5) * 0.01;
    const radial = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    basis.makeBasis(tangent, new THREE.Vector3(0, 1, 0), radial);
    const s = 0.94 + rnd() * 0.12;
    const m = new THREE.Matrix4()
      .makeTranslation(radial.x * (rp + (rnd() - 0.5) * 0.006), COAT_H + CAKE.lip * 0.5, radial.z * (rp + (rnd() - 0.5) * 0.006))
      .multiply(basis)
      .multiply(new THREE.Matrix4().makeRotationX((rnd() - 0.5) * 0.12))
      .multiply(new THREE.Matrix4().makeScale(s, s * (0.95 + rnd() * 0.1), s));
    out.push({ matrix: m, angle: a + (SHELL.length * 0.4) / rp, order: i / count, slice: inSlice(a + (SHELL.length * 0.4) / rp) });
  }
  return out;
}

// ─── Gold leaf on the frosting ────────────────────────────────────────────────────────
/** A torn, crumpled flake of gold leaf, lying in its local xy plane, facing +z */
export function goldLeafGeometry() {
  const rings = 4;
  const around = 18;
  const rnd = rng(41);
  const edge = Array.from({ length: around }, () => 0.62 + rnd() * 0.5);
  const positions: number[] = [0, 0, 0];
  const index: number[] = [];
  for (let r = 1; r <= rings; r++) {
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      const rad = (r / rings) * edge[k];
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad * 0.8;
      const z = 0.09 * noise3(x * 3.1, y * 3.1, 0.5) + 0.05 * noise3(x * 7, y * 7, 3.3); // crumples
      positions.push(x, y, z);
    }
  }
  for (let k = 0; k < around; k++) index.push(0, 1 + k, 1 + ((k + 1) % around));
  for (let r = 1; r < rings; r++) {
    for (let k = 0; k < around; k++) {
      const a = 1 + (r - 1) * around + k;
      const b = 1 + (r - 1) * around + ((k + 1) % around);
      const c = a + around;
      const d = b + around;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Where the flakes sit: on the side above the letters all round, a few between the ribbon and
 *  the letters away from the front, pressed flat against the frosting */
export function goldLeafLayout(): Placed[] {
  const rnd = rng(47);
  const out: Placed[] = [];
  const total = 30;
  for (let i = 0; i < total; i++) {
    const upper = i < 22;
    let a = rnd() * Math.PI * 2;
    if (!upper && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.75) a += Math.PI; // keep clear of the letters
    const y = upper ? 0.68 + rnd() * 0.19 : 0.21 + rnd() * 0.1;
    const radial = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const basis = new THREE.Matrix4().makeBasis(tangent, new THREE.Vector3(0, 1, 0), radial);
    const s = 0.022 + rnd() ** 1.5 * 0.035;
    const m = new THREE.Matrix4()
      .makeTranslation(radial.x * (COAT_R + 0.002), y, radial.z * (COAT_R + 0.002))
      .multiply(basis)
      .multiply(new THREE.Matrix4().makeRotationZ(rnd() * Math.PI * 2))
      .multiply(new THREE.Matrix4().makeScale(s, s, s * 0.6));
    out.push({ matrix: m, angle: a, order: rnd(), slice: inSlice(a) });
  }
  return out;
}

// ─── Baby's breath ─────────────────────────────────────────────────────────────────────
/** One floret: five tiny petals round a centre (a few millimetres across on the real thing) */
export function floretGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const petal = new THREE.IcosahedronGeometry(1, 0);
    petal.scale(0.42, 0.2, 0.3);
    petal.translate(0.5, 0.08, 0);
    petal.rotateZ(0.25);
    petal.rotateY((k / 5) * Math.PI * 2);
    parts.push(petal.index ? petal.toNonIndexed() : petal);
  }
  const centre = new THREE.IcosahedronGeometry(0.28, 0);
  centre.translate(0, 0.2, 0);
  parts.push(centre.index ? centre.toNonIndexed() : centre);
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

export type Bloom = { p: THREE.Vector3; s: number; delay: number; tilt: number; spin: number };
/** Baby's breath round the base: florets in airy clumps, each with a size and a bloom delay (by
 *  angle, so the ring blooms in a wave); green specks are the stems showing between */
export function flowerLayout(): { florets: Bloom[]; stems: Bloom[] } {
  const rnd = rng(11);
  const florets: Bloom[] = [];
  const stems: Bloom[] = [];
  const clumps = 70;
  for (let c = 0; c < clumps; c++) {
    const a = (c / clumps) * Math.PI * 2 + rnd() * 0.05;
    const cr = COAT_R + 0.085 + rnd() * 0.07;
    const cy = 0.05 + rnd() * 0.05;
    const centre = new THREE.Vector3(Math.sin(a) * cr, cy, Math.cos(a) * cr);
    const delay = (((a + Math.PI) % (Math.PI * 2)) / (Math.PI * 2)) * 0.75 + rnd() * 0.1;
    for (let k = 0; k < 7; k++) {
      const u = rnd() * Math.PI * 2;
      const v = Math.acos(2 * rnd() - 1);
      const rr = 0.03 + rnd() * 0.065;
      const p = centre.clone().add(new THREE.Vector3(Math.sin(v) * Math.cos(u) * rr, Math.abs(Math.cos(v)) * rr * 0.9, Math.sin(v) * Math.sin(u) * rr));
      florets.push({ p, s: 0.016 + rnd() * 0.014, delay: delay + rnd() * 0.05, tilt: (rnd() - 0.5) * 1.2, spin: rnd() * Math.PI * 2 });
    }
    stems.push({ p: centre.clone().setY(cy - 0.02), s: 0.009, delay, tilt: 0, spin: 0 });
  }
  return { florets, stems };
}
