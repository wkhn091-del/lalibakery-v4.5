import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLATE_TOP } from "./cakeParts";
import { sceneClock } from "./clock";
import { microSurfaceTexture, patchMaterial } from "./materials";
import { hero3d } from "./store";
import { stage, STAGES } from "./timeline";

// Version 7's sweets, restored exactly (its shapes, materials, counts, motion and pointer
// behaviour), ported to TypeScript. Only their inputs are wired to this scene: the page's scroll
// speed, the ring they form round the complete cake, and the lens shift.
//
// The living environment around the cake, in three depths:
//   • the swarm, orbiting the cake (or gathered into a ring round its waist)
//   • gold leaf falling slowly through the scene, and liquid-gold droplets
//   • a foreground layer attached to the camera: a few pieces drifting close to the lens, which
//     the depth of field turns into soft bokeh at the frame's edges
// Desktop pointers part the swarm. One instanced mesh per shape: every piece of one kind costs a
// single draw call (eleven for the whole swarm, macarons' five parts included). Per frame, nothing
// is allocated: every value lives in objects made once, so the scroll never feeds the garbage
// collector (whose pauses land as dropped frames).

const TAU = Math.PI * 2;
const rand = (n: number) => {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
};
const smooth = (x: number) => x * x * (3 - 2 * x);
const MACARON_COLORS = [
  { shell: "#eaa5ad", filling: "#fff1e6" },
  { shell: "#f3e1c2", filling: "#f8dcdc" },
  { shell: "#8c5a4b", filling: "#4a2a24" },
  { shell: "#f6cfd0", filling: "#fff6ee" },
];
type Species = "macaron" | "pearl" | "berry" | "curl" | "heart" | "strawberry" | "flake" | "droplet";
type Channel = "swarm" | "hearts" | "strawberries" | "gold";
const CHANNEL: Record<Species, Channel> = { macaron: "swarm", pearl: "swarm", berry: "swarm", curl: "swarm", heart: "hearts", strawberry: "strawberries", flake: "gold", droplet: "gold" };
const ORBIT: Partial<Record<Species, number>> = { strawberry: 1.22, droplet: 0.92, heart: 1.05 }; // how far out each kind orbits (× swarm radius)
const FOREGROUND: Species[] = ["strawberry", "macaron", "flake", "macaron", "flake"]; // pieces that drift past the lens

// ─── Shapes ─────────────────────────────────────────────────────────────────────────
function macaronParts() {
  const shell = new THREE.SphereGeometry(1, 40, 14, 0, TAU, 0, Math.PI / 2);
  shell.scale(1, 0.46, 1);
  const foot = new THREE.TorusGeometry(0.9, 0.09, 10, 48);
  foot.rotateX(Math.PI / 2);
  return { shell, foot, filling: new THREE.CylinderGeometry(0.84, 0.84, 0.3, 40) };
}

/** A gold raspberry: bumps grown at evenly spread points on a sphere */
function berryGeometry() {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 5));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const bumps = Array.from({ length: 46 }, (_, i) => {
    const y = 1 - (i / 45) * 2;
    const r = Math.sqrt(1 - y * y);
    return new THREE.Vector3(Math.cos(i * golden) * r, y, Math.sin(i * golden) * r);
  });
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let nearest = 9;
    for (const b of bumps) nearest = Math.min(nearest, v.distanceTo(b));
    v.multiplyScalar(0.84 + 0.18 * smooth(1 - Math.min(1, nearest / 0.3)));
    p.setXYZ(i, v.x, v.y * 1.08, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A chocolate shaving rolled into a loose spiral */
function curlGeometry() {
  const segs = 90;
  const positions: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * 1.7 * TAU;
    const r = 0.16 + 0.1 * (i / segs);
    for (let j = 0; j <= 1; j++) positions.push(Math.cos(a) * r, (j - 0.5) * 0.55 * (0.92 + 0.08 * Math.sin(i * 0.35)), Math.sin(a) * r);
  }
  const index: number[] = [];
  for (let i = 0; i < segs; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A plump extruded heart, about one unit tall */
function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: true, bevelSegments: 8, steps: 1, bevelSize: 2.2, bevelThickness: 2.8, curveSegments: 24 });
  g.center();
  g.rotateZ(Math.PI);
  g.scale(1 / 22, 1 / 22, 1 / 22);
  return g;
}

/** A strawberry: a turned body (tip down), seven sepals folded over the shoulders, a stem */
function strawberryParts() {
  const outline: [number, number][] = [
    [0, -1],
    [0.1, -0.93],
    [0.25, -0.78],
    [0.42, -0.52],
    [0.57, -0.18],
    [0.63, 0.08],
    [0.62, 0.3],
    [0.55, 0.48],
    [0.4, 0.6],
    [0.2, 0.66],
    [0, 0.62],
  ];
  const pts = new THREE.SplineCurve(outline.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(40);
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  const body = new THREE.LatheGeometry(pts, 44);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const sepal = new THREE.SphereGeometry(1, 10, 6);
    sepal.scale(0.11, 0.025, 0.36);
    sepal.translate(0, 0, 0.3);
    sepal.rotateX(0.38); // folded down over the shoulder
    sepal.rotateY((k / 7) * TAU + 0.2);
    sepal.translate(0, 0.63, 0);
    parts.push(sepal);
  }
  const stem = new THREE.CylinderGeometry(0.028, 0.04, 0.26, 8);
  stem.translate(0, 0.78, 0);
  parts.push(stem);
  const calyx = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return { body, calyx };
}

/** The strawberry's skin, painted in the browser: red deepening toward the top, golden seeds
 *  in shallow dimples (colour map + bump map, laid out on the lathe's UVs) */
function strawberryTextures() {
  const W = 512;
  const H = 256;
  const colour = document.createElement("canvas");
  const height = document.createElement("canvas");
  colour.width = height.width = W;
  colour.height = height.height = H;
  const c = colour.getContext("2d")!;
  const h = height.getContext("2d")!;
  const grad = c.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, "#dc2a3c");
  grad.addColorStop(0.7, "#b8132b");
  grad.addColorStop(1, "#8c1822");
  c.fillStyle = grad;
  c.fillRect(0, 0, W, H);
  h.fillStyle = "#808080";
  h.fillRect(0, 0, W, H);
  const rows = 12;
  const cols = 18;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k <= cols; k++) {
      const x = ((k + (r % 2) * 0.5) / cols) * W;
      const y = H - (0.08 + (r / (rows - 1)) * 0.8) * H;
      const dimple = h.createRadialGradient(x, y, 0, x, y, 9);
      dimple.addColorStop(0, "#303030");
      dimple.addColorStop(1, "rgba(128,128,128,0)");
      h.fillStyle = dimple;
      h.fillRect(x - 10, y - 10, 20, 20);
      c.fillStyle = "#f1d27a";
      c.beginPath();
      c.ellipse(x, y, 2.4, 4, 0, 0, TAU);
      c.fill();
      h.fillStyle = "#d0d0d0";
      h.beginPath();
      h.ellipse(x, y, 2.2, 3.6, 0, 0, TAU);
      h.fill();
    }
  }
  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(height);
  return { map, bump };
}

/** A drop of liquid gold: round below, drawn to a point above */
function dropletGeometry() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push(new THREE.Vector2(0.5 * Math.sin(Math.PI * Math.pow(t, 0.85)) * Math.pow(1 - t, 0.35), -0.5 + t * 1.45));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, 28);
}

/** A torn flake of gold leaf */
function flakeGeometry() {
  const outline = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * TAU;
    const r = 0.55 + rand(i + 300) * 0.5;
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.8);
  });
  return new THREE.ShapeGeometry(new THREE.Shape(outline));
}

// ─── Materials ──────────────────────────────────────────────────────────────────────
function makeMaterials() {
  const micro = microSurfaceTexture();
  const berrySkin = strawberryTextures();
  const gold = { color: "#dcb166", metalness: 1 };
  return {
    shell: patchMaterial(
      new THREE.MeshPhysicalMaterial({
        roughness: 0.62,
        sheen: 0.4,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color("#ffffff"),
        normalMap: micro,
        normalScale: new THREE.Vector2(0.28, 0.28),
      }),
      { subsurface: { color: "#ffe4df", scale: 0.35 } },
    ),
    foot: new THREE.MeshStandardMaterial({ roughness: 0.85, normalMap: micro, normalScale: new THREE.Vector2(0.8, 0.8) }),
    filling: patchMaterial(new THREE.MeshPhysicalMaterial({ roughness: 0.45 }), { subsurface: { color: "#fff0e0", scale: 0.7, ambient: 0.08 } }),
    pearl: new THREE.MeshStandardMaterial({ ...gold, color: "#e2bb6d", roughness: 0.18, envMapIntensity: 1.8 }),
    berry: new THREE.MeshStandardMaterial({ ...gold, roughness: 0.3, envMapIntensity: 1.8 }),
    curl: new THREE.MeshPhysicalMaterial({ color: "#4a2417", roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
    heart: patchMaterial(new THREE.MeshPhysicalMaterial({ color: "#f2a3b3", roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.3 }), {
      subsurface: { color: "#ffc4d0", scale: 0.5 },
    }),
    strawberry: patchMaterial(
      new THREE.MeshPhysicalMaterial({ map: berrySkin.map, bumpMap: berrySkin.bump, bumpScale: 1.4, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.22 }),
      { subsurface: { color: "#ff5a4a", scale: 0.9, power: 2.5, ambient: 0.06 } },
    ),
    calyx: patchMaterial(new THREE.MeshPhysicalMaterial({ color: "#3f7d3a", roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color("#bfe3a8") }), {
      subsurface: { color: "#9adf7a", scale: 0.4 },
    }),
    // thin leaf: never falls into brown
    flake: new THREE.MeshStandardMaterial({ ...gold, roughness: 0.42, envMapIntensity: 2.6, emissive: new THREE.Color("#e3b96a"), emissiveIntensity: 0.32, side: THREE.DoubleSide }),
    droplet: new THREE.MeshPhysicalMaterial({ ...gold, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.4, emissive: new THREE.Color("#dcb166"), emissiveIntensity: 0.06 }),
  };
}

// Version 7's defaults (its settings panel), unchanged
const SWARM = { macarons: 8, pearls: 18, berries: 6, curls: 7, hearts: 7, strawberries: 8, flakes: 26, droplets: 8, radius: 2.4, ringRadius: 2.15 };

// What Version 7 read from its scene store, from this scene's: every family present from the start
// (fading in over one second once the scene is live), gathering into a ring round the complete
// cake. Written into one object per mount rather than returned fresh each frame.
type Live = { appear: number; presence: Record<Channel, number>; foreground: number; ring: number };
function live(L: Live, dt: number) {
  L.appear = sceneClock.live ? Math.min(1, L.appear + dt) : 0;
  const present = L.appear * L.appear * (3 - 2 * L.appear);
  L.presence.swarm = L.presence.hearts = L.presence.strawberries = L.presence.gold = L.foreground = present;
  L.ring = stage(hero3d.progress, STAGES.complete) * (1 - stage(hero3d.progress, STAGES.slice));
}

type Item = {
  species: Species;
  /** Its instance in its kind's mesh (the order the pieces were added in) */
  index: number;
  angle: number;
  radius: number;
  height: number;
  phase: number;
  speed: number;
  tiltX: number;
  tiltZ: number;
  scale: number;
  jitter: number;
  push: THREE.Vector3;
  slot?: number;
  fg?: boolean;
  fx?: number;
  fy?: number;
  depth?: number;
};
const MESHES = ["shell", "foot", "filling", "pearl", "berry", "curl", "heart", "strawberry", "calyx", "flake", "droplet"] as const;
type Meshes = Partial<Record<(typeof MESHES)[number], THREE.InstancedMesh>>;

export default function FloatingSweets({ quality = "high" }: { quality?: "low" | "high" }) {
  const n = SWARM;
  const reduce = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const time = useRef(0);
  const refs = useRef<Meshes>({});
  const low = quality === "low";
  const L = useMemo<Live>(() => ({ appear: 0, presence: { swarm: 0, hearts: 0, strawberries: 0, gold: 0 }, foreground: 0, ring: 0 }), []);

  const geometry = useMemo(() => {
    const berry = strawberryParts();
    return {
      ...macaronParts(),
      pearl: new THREE.SphereGeometry(1, 22, 16),
      berry: berryGeometry(),
      curl: curlGeometry(),
      heart: heartGeometry(),
      strawberry: berry.body,
      calyx: berry.calyx,
      flake: flakeGeometry(),
      droplet: dropletGeometry(),
    };
  }, []);
  useEffect(() => () => Object.values(geometry).forEach((g) => g.dispose()), [geometry]);

  const materials = useMemo(() => makeMaterials(), []);
  useEffect(
    () => () =>
      Object.values(materials).forEach((mat) => {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        (mat as THREE.MeshStandardMaterial).bumpMap?.dispose();
        mat.dispose();
      }),
    [materials],
  );

  // Every piece: kind, orbit, ring slot, or (foreground) a place near the lens.
  // Phones get about half as many pieces and no foreground layer.
  const items = useMemo(() => {
    const scaleCount = (c: number) => Math.round(c * (low ? 0.55 : 1));
    const list: Item[] = [];
    const next: Partial<Record<Species, number>> = {}; // each kind's next free instance
    const add = (species: Species, count: number, [lo, hi]: [number, number], extra: Partial<Item> = {}) => {
      for (let i = 0; i < count; i++) {
        const k = list.length;
        const index = next[species] ?? 0;
        next[species] = index + 1;
        list.push({
          species,
          index,
          angle: rand(k) * TAU,
          radius: 0.72 + rand(k + 10) * 0.55,
          height: -0.55 + rand(k + 20) * 1.5,
          phase: rand(k + 30) * TAU,
          speed: 0.55 + rand(k + 40) * 0.6,
          tiltX: (rand(k + 50) - 0.5) * 1.4,
          tiltZ: (rand(k + 60) - 0.5) * 1.4,
          scale: lo + rand(k + 70) * (hi - lo),
          jitter: rand(k + 80),
          push: new THREE.Vector3(),
          ...extra,
        });
      }
    };
    add("macaron", scaleCount(n.macarons), [0.12, 0.18]);
    add("pearl", scaleCount(n.pearls), [0.028, 0.06]);
    add("berry", scaleCount(n.berries), [0.07, 0.1]);
    add("curl", scaleCount(n.curls), [0.2, 0.28]);
    add("heart", scaleCount(n.hearts), [0.14, 0.22]);
    add("strawberry", scaleCount(n.strawberries), [0.1, 0.14]);
    add("flake", scaleCount(n.flakes), [0.035, 0.07]);
    add("droplet", scaleCount(n.droplets), [0.05, 0.08]);
    if (!low) {
      FOREGROUND.forEach((species, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const depth = 0.8 + rand(i + 520) * 0.7; // well in front of whatever is in focus
        const [lo, hi] = species === "flake" ? [0.03, 0.04] : [0.05, 0.065]; // × depth: about a fifth of the frame tall
        add(species, 1, [lo * depth, hi * depth], {
          fg: true,
          fx: side * (0.8 + rand(i + 500) * 0.25), // at the left or right edge, partly out of frame
          fy: (rand(i + 510) - 0.5) * 1.2,
          depth,
        });
      });
    }
    const ringers = list.filter((it) => !it.fg && CHANNEL[it.species] === "swarm").sort((a, b) => a.jitter - b.jitter);
    ringers.forEach((it, i) => (it.slot = i / ringers.length));
    return list;
  }, [n.macarons, n.pearls, n.berries, n.curls, n.hearts, n.strawberries, n.flakes, n.droplets, low]);

  const counts = useMemo(() => items.reduce<Partial<Record<Species, number>>>((acc, it) => ({ ...acc, [it.species]: (acc[it.species] ?? 0) + 1 }), {}), [items]);

  // Macaron colours are per instance (two shells, two feet, one filling each)
  useLayoutEffect(() => {
    const r = refs.current;
    if (!r.shell || !r.foot || !r.filling || !counts.macaron) return;
    const color = new THREE.Color();
    for (let i = 0; i < counts.macaron; i++) {
      const pal = MACARON_COLORS[i % MACARON_COLORS.length];
      color.set(pal.shell);
      r.shell.setColorAt(i * 2, color);
      r.shell.setColorAt(i * 2 + 1, color);
      color.multiplyScalar(0.94);
      r.foot.setColorAt(i * 2, color);
      r.foot.setColorAt(i * 2 + 1, color);
      r.filling.setColorAt(i, color.set(pal.filling));
    }
    for (const mesh of [r.shell, r.foot, r.filling]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [counts.macaron]);

  const pointerOn = useMemo(() => !reduce && window.matchMedia("(pointer: fine)").matches, [reduce]);
  const tmp = useMemo(
    () => ({
      base: new THREE.Matrix4(),
      part: new THREE.Matrix4(),
      out: new THREE.Matrix4(),
      zero: new THREE.Matrix4().makeScale(0, 0, 0),
      flip: new THREE.Matrix4().makeRotationX(Math.PI),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
      p: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      v: new THREE.Vector3(),
      c: new THREE.Vector3(),
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
    }),
    [],
  );

  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera; // already moved this frame (CameraRig runs first)
    const dt = sceneClock.dt; // the display's own step (clock.ts): even orbits
    live(L, dt);
    const r = refs.current;
    // scrolling stirs the air (visitors who prefer reduced motion: the sweets hold still)
    if (!reduce) time.current += dt * (1 + Math.min(2.5, Math.abs(hero3d.velocity) * 0.002));
    const T = time.current;
    const presence = L.presence;
    const ring = smooth(Math.min(1, Math.max(0, L.ring)));
    const centerY = PLATE_TOP + 0.5; // round the middle of the cake
    const ringY = PLATE_TOP + 0.55;
    const widen = 1.12; // this cake is a little wider than Version 7's
    const { base, part, out, zero, flip, q, e, p, a, b, v, c, ray, ndc } = tmp;

    // Foreground: sizes of the visible frame at a given depth, and where the lens shift moved it
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const aspect = size.width / size.height;
    if (pointerOn) ray.setFromCamera(ndc.set(hero3d.pointer.x, hero3d.pointer.y), cam);
    const blend = 1 - Math.exp(-6 * dt);

    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const i = it.index;
      const amount = it.fg ? L.foreground : presence[CHANNEL[it.species]];
      if (amount < 0.005) {
        writeMatrix(r, it.species, i, zero, zero, out, part, flip);
        continue;
      }
      let size3 = it.scale * Math.min(1, amount * 1.15);
      if (it.fg) {
        // camera space: near the frame's left/right edge, drifting slowly
        const halfH = it.depth! * tanHalf;
        const halfW = halfH * aspect;
        p.set(
          (it.fx! - 2 * hero3d.frame.x) * halfW + Math.sin(T * 0.23 + it.phase) * halfW * 0.08,
          (it.fy! - 2 * hero3d.frame.y) * halfH + Math.sin(T * 0.31 + it.phase) * halfH * 0.1,
          -it.depth!,
        ).applyMatrix4(cam.matrixWorld);
      } else if (it.species === "flake") {
        // gold leaf falling like slow snow, drifting round the cake
        const fall = (T * (0.07 + it.speed * 0.05) + it.phase) % 1;
        const ang = it.angle + T * 0.05 * it.speed;
        const rad = n.radius * (0.55 + it.radius * 0.75) * widen * (1 + (1 - amount) * 1.2);
        p.set(Math.cos(ang) * rad, centerY + 1.9 - fall * 3.2, Math.sin(ang) * rad);
        size3 *= smooth(Math.min(1, fall * 6, (1 - fall) * 6)); // fades in at the top, out at the bottom
      } else {
        // home 1: a free, slightly bobbing orbit (drifting outward as the pieces fade)
        const ang = it.angle + T * 0.07 * it.speed;
        const rad = n.radius * it.radius * (ORBIT[it.species] ?? 1) * widen * (1 + (1 - amount) * 1.6);
        a.set(Math.cos(ang) * rad, centerY + it.height + Math.sin(T * it.speed + it.phase) * 0.07, Math.sin(ang) * rad);
        // home 2: a slot in the ring round the cake's waist
        if (it.slot !== undefined && ring > 0) {
          const ra = it.slot * TAU + T * 0.11;
          const rr = n.ringRadius * widen;
          b.set(Math.cos(ra) * rr, ringY + (it.jitter - 0.5) * 0.34 + Math.sin(T * 0.8 + it.phase) * 0.04, Math.sin(ra) * rr);
          p.lerpVectors(a, b, ring);
        } else p.copy(a);
      }
      // desktop: pieces glide out of the pointer's way
      if (pointerOn && !it.fg) {
        c.copy(p).sub(ray.ray.origin);
        const along = c.dot(ray.ray.direction);
        v.copy(ray.ray.direction).multiplyScalar(along).add(ray.ray.origin); // closest point on the pointer ray
        const d = p.distanceTo(v);
        const R = 0.85;
        if (d < R && along > 0)
          c.copy(p)
            .sub(v)
            .normalize()
            .multiplyScalar((1 - d / R) ** 2 * 0.6);
        else c.set(0, 0, 0);
        it.push.lerp(c, blend);
        p.add(it.push);
      }
      const flutter = it.species === "flake" ? Math.sin(T * 2.2 + it.phase) * 0.9 : 0;
      e.set(it.tiltX + Math.sin(T * 0.45 + it.phase) * 0.2 + flutter, T * 0.3 * it.speed + it.phase, it.tiltZ + flutter * 0.5);
      base.compose(p, q.setFromEuler(e), v.set(size3, size3, size3));
      writeMatrix(r, it.species, i, base, null, out, part, flip);
    }
    for (let k = 0; k < MESHES.length; k++) {
      const mesh = r[MESHES[k]];
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const bind = (key: keyof Meshes) => (mesh: THREE.InstancedMesh | null) => {
    if (mesh) refs.current[key] = mesh;
    else delete refs.current[key];
  };
  const shadows = quality === "high"; // as in Version 7: the swarm casts its shadows on capable devices
  const mesh = (key: keyof Meshes, geo: THREE.BufferGeometry, mat: THREE.Material, count: number) =>
    count > 0 ? <instancedMesh key={key} ref={bind(key)} args={[geo, mat, count]} frustumCulled={false} castShadow={shadows} /> : null;
  const mac = counts.macaron ?? 0;

  return (
    <group>
      {mesh("shell", geometry.shell, materials.shell, mac * 2)}
      {mesh("foot", geometry.foot, materials.foot, mac * 2)}
      {mesh("filling", geometry.filling, materials.filling, mac)}
      {mesh("pearl", geometry.pearl, materials.pearl, counts.pearl ?? 0)}
      {mesh("berry", geometry.berry, materials.berry, counts.berry ?? 0)}
      {mesh("curl", geometry.curl, materials.curl, counts.curl ?? 0)}
      {mesh("heart", geometry.heart, materials.heart, counts.heart ?? 0)}
      {mesh("strawberry", geometry.strawberry, materials.strawberry, counts.strawberry ?? 0)}
      {mesh("calyx", geometry.calyx, materials.calyx, counts.strawberry ?? 0)}
      {mesh("flake", geometry.flake, materials.flake, counts.flake ?? 0)}
      {mesh("droplet", geometry.droplet, materials.droplet, counts.droplet ?? 0)}
    </group>
  );
}

/** Writes one piece's matrices into its instanced meshes (macarons and strawberries have parts) */
function writeMatrix(r: Meshes, species: Species, i: number, base: THREE.Matrix4, zero: THREE.Matrix4 | null, out: THREE.Matrix4, part: THREE.Matrix4, flip: THREE.Matrix4) {
  const m = zero ?? base;
  if (species === "macaron") {
    if (!r.shell || !r.foot || !r.filling) return;
    if (zero) {
      r.shell.setMatrixAt(i * 2, m);
      r.shell.setMatrixAt(i * 2 + 1, m);
      r.foot.setMatrixAt(i * 2, m);
      r.foot.setMatrixAt(i * 2 + 1, m);
      r.filling.setMatrixAt(i, m);
      return;
    }
    r.shell.setMatrixAt(i * 2, out.multiplyMatrices(base, part.makeTranslation(0, 0.15, 0)));
    r.shell.setMatrixAt(i * 2 + 1, out.multiplyMatrices(base, part.makeTranslation(0, -0.15, 0)).multiply(flip));
    r.foot.setMatrixAt(i * 2, out.multiplyMatrices(base, part.makeTranslation(0, 0.16, 0)));
    r.foot.setMatrixAt(i * 2 + 1, out.multiplyMatrices(base, part.makeTranslation(0, -0.16, 0)));
    r.filling.setMatrixAt(i, base);
  } else if (species === "strawberry") {
    r.strawberry?.setMatrixAt(i, m);
    r.calyx?.setMatrixAt(i, m);
  } else r[species]?.setMatrixAt(i, m);
}
