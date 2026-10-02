import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { type Font, FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { type CakeSpec, drawable, extentOf, type PipingStyle, type PreviewAddon, type PreviewShape, visualOrder } from "@/lib/order/preview";
import { shellGeometry } from "../hero3d/cakeParts";
import { patchMaterial } from "../hero3d/materials";
import { easeOutBack } from "../hero3d/timeline";
import { FONT } from "./config";
import {
  bearGeometry,
  blueberryGeometry,
  boardGeometry,
  candleGeometry,
  crumbTexture,
  type CutFace,
  cutFaces,
  cupcakeDomeGeometry,
  dripDropGeometry,
  dripStemGeometry,
  figureLayerGeometry,
  figureShapes,
  flameGeometry,
  floretGeometry,
  goldLeafGeometry,
  heartGeometry,
  insidePoints,
  kissGeometry,
  leafGeometry,
  linerGeometry,
  macaronGeometry,
  numberCandleGeometry,
  printTexture,
  raspberryGeometry,
  rectBoardGeometry,
  rng,
  roseGeometry,
  rosetteGeometry,
  roundCakeGeometry,
  roundEdge,
  shadowTexture,
  strawberryGeometry,
  swirlGeometry,
  topperTextGeometry,
  TRAY_EDGE,
  trayGeometry,
  type Wedge,
} from "./pieces";

if (typeof window !== "undefined") useLoader.preload(FontLoader, FONT);

// ─── Owning GPU resources ──────────────────────────────────────────────────────────────

type Disposable = { dispose(): void };
function disposeAll(x: unknown) {
  if (!x || typeof x !== "object") return;
  if (typeof (x as Disposable).dispose === "function") (x as Disposable).dispose();
  else Object.values(x).forEach(disposeAll);
}
/** made when its inputs change, released (geometries, materials, textures) when replaced or unmounted */
function useOwned<T>(make: () => T, deps: unknown[]): T {
  const value = useMemo(make, deps);
  useEffect(() => () => disposeAll(value), [value]);
  return value;
}

// ─── Materials ─────────────────────────────────────────────────────────────────────────

const GOLD = "#C9A55A";
/** Buttercream: soft sheen, light bleeding through at the edges, the warm wrap of the hero's cream */
const creamMaterial = (hex: string) => {
  const color = new THREE.Color(hex);
  // a white sheen would wash a dark ganache out to pink: the sheen is the cream's own colour, lightened
  const light = color.getHSL({ h: 0, s: 0, l: 0 }).l;
  return patchMaterial(new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, sheen: 0.2 + 0.35 * light, sheenRoughness: 0.5, sheenColor: color.clone().lerp(new THREE.Color("#ffffff"), 0.35 + 0.3 * light) }), {
    wrap: { amount: 0.45, tint: "#ffcfb4" },
    subsurface: { color: "#ffe6d6", scale: 0.35, ambient: 0.04 },
  });
};
const GANACHE = "#4A2C1E";
/** the outside, by what covers it: the colour is the design's, the coating sets the finish */
function coatingMaterial(spec: CakeSpec): THREE.Material {
  switch (spec.coating) {
    case "whipped":
      return new THREE.MeshStandardMaterial({ color: spec.coat, roughness: 0.82 });
    case "ganache":
      // ganache is chocolate: dark unless a colour was chosen for the design
      return new THREE.MeshPhysicalMaterial({ color: spec.coat === spec.cream ? GANACHE : spec.coat, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
    case "fondant":
      return new THREE.MeshPhysicalMaterial({ color: spec.coat, roughness: 0.42, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffffff") });
    case "naked":
      // a thin scrape of cream: the sponge shows through it
      return new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.sponge).lerp(new THREE.Color(spec.coat), 0.45), roughness: 0.9 });
    default:
      return creamMaterial(spec.coat);
  }
}
const glossy = (hex: string) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
const goldMaterial = () => new THREE.MeshStandardMaterial({ color: "#E2BE6A", metalness: 0.85, roughness: 0.32, emissive: "#3a2a08", emissiveIntensity: 0.6 });
const matte = (hex: string, roughness = 0.75) => new THREE.MeshStandardMaterial({ color: hex, roughness });
/** the accent as a material: gold leaf when it's the gold, otherwise a glossy colour */
const accentMaterial = (hex: string) => (hex === GOLD ? goldMaterial() : new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, clearcoat: 0.4 }));

// ─── Where things go ───────────────────────────────────────────────────────────────────

type Ring = { kind: "circle"; r: number; y: number } | { kind: "rect"; w: number; d: number; y: number };
type Side = { kind: "cyl"; r: number; y0: number; y1: number } | { kind: "box"; w: number; d: number; y0: number; y1: number };
/** the flat top, in coordinates from -1 to 1 across it (v = -1 at the back) */
type Top = { y: number; at: (u: number, v: number) => THREE.Vector3; s: number; reach: number; round: boolean };
/**
 * Where a piece is cut out so the layers inside show: a slice from the top round tier (front right,
 * so it turns into view), or a square from a tray's front right corner (past x and z).
 */
type Cut = { kind: "wedge"; r: number; y0: number; y1: number } | { kind: "notch"; x: number; z: number; w: number; d: number; y0: number; y1: number };
const WEDGE: Wedge = { from: 0.3, to: 1.15 };

/** whether something put at p would hang over the cut */
function inCut(cut: Cut | null, p: THREE.Vector3) {
  if (!cut || p.y < cut.y0 - 0.05) return false;
  if (cut.kind === "notch") return p.x > cut.x - 0.08 && p.z > cut.z - 0.08;
  const r = Math.hypot(p.x, p.z);
  if (r > cut.r + 0.1) return false;
  const a = Math.atan2(p.x, p.z);
  const pad = Math.min(0.6, 0.09 / Math.max(r, 0.1));
  return a > WEDGE.from - pad && a < WEDGE.to + pad;
}
type FigureLayout = { shapes: THREE.Shape[]; layer: number; mid: THREE.Vector2[]; top: THREE.Vector2[]; midY: number; topY: number; width: number; depth: number };
type Layout = {
  top: Top | null;
  /** figure and cupcake tops: where one piece each can sit */
  spots: THREE.Vector3[];
  spotScale: number;
  rims: Ring[];
  bases: Ring[];
  sides: Side[];
  cut: Cut | null;
  /** round the cake: `center` is the angle the words are centred on */
  message: { kind: "cyl"; r: number; y: number; arc: number; center: number } | { kind: "flat"; y: number; z: number; width: number } | null;
  topper: THREE.Vector3;
  height: number;
  figure?: FigureLayout;
  cupcakes?: THREE.Vector3[];
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const DOLLOP = 0.12; // a kiss of cream on a number cake: about 2.4 cm across
const KISS_H = 1.25 * DOLLOP;

function discTop(r: number, y: number): Top {
  const R = r - 0.1;
  return { y, at: (u, v) => new THREE.Vector3(u * R, y, v * R), s: clamp(r / 1.05, 0.78, 1.05), reach: R, round: true };
}

function layoutOf(shape: PreviewShape, font: Font): Layout {
  const none = { top: null, spots: [], spotScale: 1, rims: [], bases: [], sides: [], cut: null };
  switch (shape.kind) {
    case "round": {
      const { radius: r, height: h } = shape;
      return {
        ...none,
        top: discTop(r, h),
        rims: [{ kind: "circle", r: r - 0.07, y: h }],
        bases: [{ kind: "circle", r: r + 0.025, y: 0 }],
        sides: [{ kind: "cyl", r, y0: 0, y1: h }],
        cut: { kind: "wedge", r, y0: 0, y1: h },
        // left of the cut
        message: { kind: "cyl", r, y: h * 0.42, arc: 1.45, center: -0.5 },
        topper: discTop(r, h).at(0, -0.6),
        height: h,
      };
    }
    case "tiers": {
      const [a, b] = shape.tiers;
      const h = a.height + b.height;
      return {
        ...none,
        top: discTop(b.radius, h),
        rims: [
          { kind: "circle", r: a.radius - 0.07, y: a.height },
          { kind: "circle", r: b.radius - 0.07, y: h },
        ],
        bases: [
          { kind: "circle", r: a.radius + 0.025, y: 0 },
          { kind: "circle", r: b.radius + 0.025, y: a.height },
        ],
        sides: [
          { kind: "cyl", r: a.radius, y0: 0, y1: a.height },
          { kind: "cyl", r: b.radius, y0: a.height, y1: h },
        ],
        cut: { kind: "wedge", r: b.radius, y0: a.height, y1: h },
        message: { kind: "cyl", r: a.radius, y: a.height * 0.42, arc: 1.5, center: 0 },
        topper: discTop(b.radius, h).at(0, -0.6),
        height: h,
      };
    }
    case "tray": {
      const { width: w, depth: d, height: h } = shape;
      const hw = w / 2 - 0.12;
      const hd = d / 2 - 0.12;
      const top: Top = { y: h, at: (u, v) => new THREE.Vector3(u * hw, h, v * hd), s: clamp(Math.min(w, d) / 2.1, 0.85, 1.1), reach: Math.min(hw, hd), round: false };
      return {
        ...none,
        top,
        rims: [{ kind: "rect", w: w - 0.14, d: d - 0.14, y: h }],
        bases: [{ kind: "rect", w: w + 0.05, d: d + 0.05, y: 0 }],
        sides: [{ kind: "box", w, d, y0: 0, y1: h }],
        // clear of the words, which run across the front
        cut: { kind: "notch", x: w / 2 - w * 0.22, z: d / 2 - d * 0.36, w, d, y0: 0, y1: h },
        message: { kind: "flat", y: h, z: d / 2 - 0.42, width: w * 0.55 },
        topper: top.at(0, -0.62),
        height: h,
      };
    }
    case "figure": {
      const { shapes, width, height: depth } = figureShapes(font, visualOrder(shape.text).join(""), shape.size);
      const layer = shape.layer;
      const midY = layer + 0.05;
      const topY = midY + KISS_H * 0.85 + layer + 0.05;
      const pts = insidePoints(shapes, DOLLOP * 1.45, DOLLOP * 0.3);
      // the outline's y runs toward the back once it lies flat
      const spots = pts.map((p) => new THREE.Vector3(p.x, topY + KISS_H * 0.75, -p.y));
      const back = spots.reduce((b, p) => (p.z < b.z ? p : b), spots[0] ?? new THREE.Vector3(0, topY, 0));
      return {
        ...none,
        spots,
        spotScale: 0.8,
        message: null,
        topper: new THREE.Vector3(back.x, topY, back.z),
        height: topY + KISS_H,
        figure: { shapes, layer, mid: pts, top: pts, midY, topY, width, depth },
      };
    }
    case "cupcakes": {
      const cupcakes = [new THREE.Vector3(0, 0, 0), ...Array.from({ length: 6 }, (_, k) => new THREE.Vector3(Math.sin((k / 6) * Math.PI * 2) * 0.78, 0, Math.cos((k / 6) * Math.PI * 2) * 0.78))];
      return {
        ...none,
        spots: cupcakes.map((c) => c.clone().setY(0.74)),
        spotScale: 0.7,
        message: null,
        topper: new THREE.Vector3(0, 0.74, 0),
        height: 0.8,
        cupcakes,
      };
    }
  }
}

// ─── Placing the add-ons ───────────────────────────────────────────────────────────────

/** one piece: where it sits, how big, which way it faces */
type Site = { p: THREE.Vector3; s: number; yaw: number };

const around = (top: Top, u: number, v: number, offsets: [number, number][], rnd: () => number): Site[] => {
  const c = top.at(u, v);
  return offsets.map(([dx, dz]) => ({ p: c.clone().add(new THREE.Vector3(dx * top.s, 0, dz * top.s)), s: top.s * (0.9 + rnd() * 0.2), yaw: rnd() * Math.PI * 2 }));
};

function topSites(top: Top, a: PreviewAddon, rnd: () => number): Site[] {
  const one = (u: number, v: number, yaw = 0): Site[] => [{ p: top.at(u, v), s: top.s, yaw }];
  switch (a.key) {
    case "flowers":
      return around(top, -0.48, -0.42, [[0, 0], [0.24, 0.1], [-0.12, 0.22], [0.1, -0.2], [-0.24, -0.04]], rnd);
    case "fruit":
      return around(top, 0.6, -0.14, [[0, 0], [0.13, 0.08], [-0.1, 0.12], [0.05, -0.13], [-0.14, -0.06], [0.17, -0.07], [-0.02, 0.2]], rnd);
    case "macarons": {
      // round the edge, front left and back right, leaving the cut open and the flowers' corner
      const arcs: [number, number][] = [
        [-1.75, WEDGE.from - 0.22],
        [WEDGE.to + 0.22, 2.35],
      ];
      const total = arcs.reduce((sum, [f, t]) => sum + t - f, 0);
      const n = a.count;
      const angleAt = (s: number) => {
        for (const [f, t] of arcs) {
          if (s <= t - f) return f + s;
          s -= t - f;
        }
        return arcs.at(-1)![1];
      };
      return Array.from({ length: n }, (_, i) => {
        const ang = angleAt(n === 1 ? total * 0.3 : (i / (n - 1)) * total);
        const p = top.at(Math.sin(ang) * 0.84, Math.cos(ang) * 0.84);
        return { p, s: top.s * Math.min(0.78, (top.reach * 0.84 * total) / Math.max(1, n - 1) / 0.34), yaw: Math.atan2(p.x, p.z) };
      });
    }
    case "sugarFigure":
      return one(-0.42, 0.34, 0.35);
    case "ediblePrint":
      // on a round top, off the cut's point
      return top.round ? one(-0.28, -0.05) : one(0, 0.02);
    case "candles":
      if (a.kind === "number") return one(0.05, -0.28);
      if (a.kind === "sparklers") return [top.at(-0.26, -0.34), top.at(0, -0.42), top.at(0.26, -0.34)].map((p) => ({ p, s: top.s, yaw: 0 }));
      return Array.from({ length: 5 }, (_, i) => ({ p: top.at(-0.34 + i * 0.17, -0.36 + Math.abs(i - 2) * 0.05), s: top.s, yaw: rnd() * Math.PI }));
    default:
      return [];
  }
}

/** how many of the figure's or cupcakes' spots each add-on takes */
function demand(a: PreviewAddon, spots: number): number {
  switch (a.key) {
    case "flowers":
      return 3;
    case "fruit":
      return 5;
    case "macarons":
      return a.count;
    case "sugarFigure":
      return 1;
    case "ediblePrint":
      return Math.min(3, spots);
    case "candles":
      return a.kind === "number" ? 1 : a.kind === "sparklers" ? 2 : 3;
    default:
      return 0;
  }
}

function spotSites(layout: Layout, addons: PreviewAddon[]): Map<string, Site[]> {
  const rnd = rng(7);
  const order = layout.spots.map((p, i) => ({ p, k: rnd(), i })).sort((a, b) => a.k - b.k);
  const out = new Map<string, Site[]>();
  let next = 0;
  for (const a of addons) {
    const n = demand(a, order.length);
    const sites: Site[] = [];
    for (let i = 0; i < n && order.length; i++, next++) {
      const lap = Math.floor(next / order.length);
      const base = order[next % order.length].p;
      // past the first round, the next piece sits beside the one already there
      const p = lap ? base.clone().add(new THREE.Vector3(Math.sin(next * 2.4) * 0.12, 0, Math.cos(next * 2.4) * 0.12)) : base.clone();
      sites.push({ p, s: layout.spotScale, yaw: Math.atan2(p.x, p.z) });
    }
    out.set(a.key, sites);
  }
  return out;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────────────

/** Many copies of one mesh, one draw call */
function Instanced({ geometry, material, matrices }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }) {
  const mesh = useMemo(() => new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length)), [geometry, material, matrices.length]);
  useLayoutEffect(() => {
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [mesh, matrices]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

/** a new piece grows in with a little overshoot, so each addition is seen arriving */
function Pop({ still, children }: { still: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(still ? 1 : 0);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 0.55);
    g.scale.setScalar(Math.max(0.001, easeOutBack(t.current, 2.2)));
  });
  return (
    <group ref={group} scale={still ? 1 : 0.001}>
      {children}
    </group>
  );
}

const basisAt = (p: THREE.Vector3, outward: THREE.Vector3) => {
  const tangent = new THREE.Vector3(outward.z, 0, -outward.x);
  return new THREE.Matrix4().makeBasis(tangent, new THREE.Vector3(0, 1, 0), outward).setPosition(p);
};

/** shells head to tail along a ring: a circle round a round cake, the four edges of a tray */
function ringMatrices(ring: Ring, scale: number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const step = 0.2 * 0.6 * scale;
  const s = new THREE.Matrix4().makeScale(scale, scale, scale);
  if (ring.kind === "circle") {
    const n = Math.round((Math.PI * 2 * ring.r) / step);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const outward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      out.push(basisAt(outward.clone().multiplyScalar(ring.r).setY(ring.y), outward).multiply(s));
    }
    return out;
  }
  const edges: [THREE.Vector3, THREE.Vector3, number][] = [
    [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), ring.w],
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), ring.d],
    [new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), ring.w],
    [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), ring.d],
  ];
  for (const [outward, along, length] of edges) {
    const half = outward.x ? ring.w / 2 : ring.d / 2;
    const n = Math.max(1, Math.floor((length - 0.1) / step));
    for (let i = 0; i < n; i++) {
      const p = outward.clone().multiplyScalar(half).add(along.clone().multiplyScalar(-length / 2 + 0.05 + (i + 0.5) * ((length - 0.1) / n))).setY(ring.y);
      out.push(basisAt(p, outward).multiply(s));
    }
  }
  return out;
}

// ─── The cake ──────────────────────────────────────────────────────────────────────────

export default function Cake({ spec, still }: { spec: CakeSpec; still: boolean }) {
  const font = useLoader(FontLoader, FONT);
  const layout = useMemo(() => layoutOf(spec.shape, font), [spec.shape, font]);
  const coat = useOwned(() => coatingMaterial(spec), [spec.coat, spec.coating, spec.sponge]);
  const sponge = useOwned(() => matte(spec.sponge, 0.85), [spec.sponge]);
  const crumb = useOwned(crumbTexture, []);
  const fillingKey = spec.fillings.join("|");
  const spongeKey = spec.sponges.join("|");
  const inside = useOwned(
    () => ({
      sponges: spec.sponges.map((hex) => new THREE.MeshStandardMaterial({ color: hex, map: crumb, roughness: 0.92 })),
      cream: creamMaterial(spec.cream),
      fillings: spec.fillings.map((hex) => (hex ? new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 }) : null)),
    }),
    [spongeKey, spec.cream, fillingKey, crumb],
  );
  const accent = useOwned(() => accentMaterial(spec.accent), [spec.accent]);
  const gold = useOwned(goldMaterial, []);
  const has = (key: PreviewAddon["key"]) => spec.addons.find((a) => a.key === key);
  const piping = has("piping") as Extract<PreviewAddon, { key: "piping" }> | undefined;
  // a drip with no colour chosen is dark ganache: in the coat's own colour it wouldn't show
  const pipingColor = piping?.color ?? (piping?.style === "drip" ? GANACHE : null);
  const pipingMat = useOwned(() => (pipingColor ? (piping?.style === "drip" ? glossy(pipingColor) : creamMaterial(pipingColor)) : null), [pipingColor, piping?.style]);

  const sites = useMemo(() => {
    const top = layout.top;
    const all = top ? new Map(spec.addons.map((a) => [a.key, topSites(top, a, rng(a.key.length * 13 + 5))])) : spotSites(layout, spec.addons);
    for (const [key, list] of all) all.set(key, list.filter((s) => !inCut(layout.cut, s.p)));
    return all;
  }, [layout, spec.addons]);
  const sitesOf = (a: PreviewAddon): Site[] => sites.get(a.key) ?? [];

  return (
    <group>
      <Shadow shape={spec.shape} />
      <Base spec={spec} layout={layout} coat={coat} sponge={sponge} accent={accent} dollops={pipingMat ?? coat} inside={inside} />
      {layout.cut && <Inside cut={layout.cut} coat={coat} inside={inside} />}
      {spec.addons.map((a) => (
        <Pop key={a.key === "candles" ? `${a.key}-${a.kind}` : a.key} still={still}>
          <Piece addon={a} sites={sitesOf(a)} layout={layout} font={font} gold={gold} coat={coat} piping={pipingMat ?? coat} still={still} />
        </Pop>
      ))}
      {spec.message && layout.message && <Message text={spec.message} at={layout.message} font={font} material={accent} />}
    </group>
  );
}

function Shadow({ shape }: { shape: PreviewShape }) {
  const texture = useOwned(shadowTexture, []);
  const { radius } = extentOf(shape);
  const size = radius * 2.9 + 0.6;
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.045} scale={[size, size, 1]} renderOrder={-1}>
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

const BOARD = "#F7F1EA";

type InsideMaterials = { sponges: THREE.Material[]; cream: THREE.Material; fillings: (THREE.Material | null)[] };

function Base({ spec, layout, coat, sponge, accent, dollops, inside }: { spec: CakeSpec; layout: Layout; coat: THREE.Material; sponge: THREE.Material; accent: THREE.Material; dollops: THREE.Material; inside: InsideMaterials }) {
  const board = useOwned(() => new THREE.MeshPhysicalMaterial({ color: BOARD, roughness: 0.3, clearcoat: 0.6 }), []);
  const shape = spec.shape;
  switch (shape.kind) {
    case "round":
      return <RoundTiers tiers={[{ radius: shape.radius, height: shape.height }]} coat={coat} board={board} />;
    case "tiers":
      return <RoundTiers tiers={shape.tiers} coat={coat} board={board} />;
    case "tray": {
      const cut = layout.cut as Extract<Cut, { kind: "notch" }>;
      return <Tray shape={shape} notch={cut} coat={coat} board={board} />;
    }
    case "figure":
      return <Figure figure={layout.figure!} sponge={sponge} dollops={dollops} cream={inside.cream} filling={inside.fillings.find((f) => f) ?? null} board={board} />;
    case "cupcakes":
      return <Cupcakes at={layout.cupcakes!} coat={coat} sponge={sponge} liner={accent} board={board} />;
  }
}

function RoundTiers({ tiers, coat, board }: { tiers: { radius: number; height: number }[]; coat: THREE.Material; board: THREE.Material }) {
  const key = tiers.map((t) => `${t.radius}:${t.height}`).join("|");
  // the slice comes out of the top tier
  const geos = useOwned(() => tiers.map((t, i) => roundCakeGeometry(t.radius, t.height, i === tiers.length - 1 ? WEDGE : undefined)), [key]);
  const boardGeo = useOwned(() => boardGeometry(tiers[0].radius + 0.22), [tiers[0].radius]);
  let y = 0;
  return (
    <>
      <mesh geometry={boardGeo} material={board} />
      {geos.map((g, i) => {
        const at = y;
        y += tiers[i].height;
        return <mesh key={i} geometry={g} material={coat} position-y={at} />;
      })}
    </>
  );
}

function Tray({ shape, notch, coat, board }: { shape: Extract<PreviewShape, { kind: "tray" }>; notch: { x: number; z: number }; coat: THREE.Material; board: THREE.Material }) {
  const geo = useOwned(() => trayGeometry(shape.width, shape.depth, shape.height, notch), [shape.width, shape.depth, shape.height, notch.x, notch.z]);
  const boardGeo = useOwned(() => rectBoardGeometry(shape.width + 0.4, shape.depth + 0.4), [shape.width, shape.depth]);
  return (
    <>
      <mesh geometry={boardGeo} material={board} />
      <mesh geometry={geo} material={coat} />
    </>
  );
}

/**
 * A number cake: two shortbread layers with kisses of cream between and on top. Between the layers
 * the kisses are the cream chosen, every third swapped for a dab of the filling; on top they take the
 * design's colour.
 */
function Figure({ figure, sponge, dollops, cream, filling, board }: { figure: FigureLayout; sponge: THREE.Material; dollops: THREE.Material; cream: THREE.Material; filling: THREE.Material | null; board: THREE.Material }) {
  const layerGeo = useOwned(() => figureLayerGeometry(figure.shapes, figure.layer), [figure.shapes, figure.layer]);
  const kiss = useOwned(() => kissGeometry(), []);
  const dab = useOwned(() => new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), []);
  const boardGeo = useOwned(() => rectBoardGeometry(figure.width + 0.5, figure.depth + 0.5), [figure.width, figure.depth]);
  const { mid, dabs, top } = useMemo(() => {
    const rnd = rng(3);
    const turn = () => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    const at = (p: THREE.Vector2, y: number, squash: number) => new THREE.Matrix4().compose(new THREE.Vector3(p.x, y, -p.y), turn(), new THREE.Vector3(DOLLOP, DOLLOP * squash, DOLLOP).multiplyScalar(0.92 + rnd() * 0.16));
    const mid: THREE.Matrix4[] = [];
    const dabs: THREE.Matrix4[] = [];
    figure.mid.forEach((p, i) => {
      if (filling && i % 3 === 1) dabs.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, figure.midY, -p.y), turn(), new THREE.Vector3(DOLLOP * 0.85, DOLLOP * 0.7, DOLLOP * 0.85)));
      else mid.push(at(p, figure.midY, 0.85));
    });
    return { mid, dabs, top: figure.top.map((p) => at(p, figure.topY, 1)) };
  }, [figure, filling]);
  return (
    <>
      <mesh geometry={boardGeo} material={board} />
      <mesh geometry={layerGeo} material={sponge} />
      <mesh geometry={layerGeo} material={sponge} position-y={figure.midY + KISS_H * 0.85} />
      <Instanced geometry={kiss} material={cream} matrices={mid} />
      {filling && dabs.length > 0 && <Instanced geometry={dab} material={filling} matrices={dabs} />}
      <Instanced geometry={kiss} material={dollops} matrices={top} />
    </>
  );
}

/** The faces where the slice was cut: the base's sponge, the cream and the filling between the layers, the coat round them */
function Inside({ cut, coat, inside }: { cut: Cut; coat: THREE.Material; inside: InsideMaterials }) {
  const fills = inside.fillings.map((f) => !!f);
  const fillKey = fills.join(",");
  const key = JSON.stringify(cut);
  const geos = useOwned(() => {
    const up = cut.y1 - cut.y0;
    if (cut.kind === "wedge") {
      const along = (a: number) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const origin = new THREE.Vector3(0, cut.y0, 0);
      const faces: CutFace[] = [
        { origin, along: along(WEDGE.to), facing: new THREE.Vector3(-Math.cos(WEDGE.to), 0, Math.sin(WEDGE.to)), width: cut.r },
        { origin, along: along(WEDGE.from), facing: new THREE.Vector3(Math.cos(WEDGE.from), 0, -Math.sin(WEDGE.from)), width: cut.r },
      ];
      return cutFaces(faces, up, fills, roundEdge(cut.r));
    }
    const origin = new THREE.Vector3(cut.x, cut.y0, cut.z);
    const faces: CutFace[] = [
      { origin, along: new THREE.Vector3(1, 0, 0), facing: new THREE.Vector3(0, 0, 1), width: cut.w / 2 - cut.x },
      { origin, along: new THREE.Vector3(0, 0, 1), facing: new THREE.Vector3(1, 0, 0), width: cut.d / 2 - cut.z },
    ];
    return cutFaces(faces, up, fills, TRAY_EDGE);
  }, [key, fillKey]);
  return (
    <>
      {geos.coat && <mesh geometry={geos.coat} material={coat} />}
      {geos.sponges.map((g, i) => {
        const m = inside.sponges[i] ?? inside.sponges[0];
        return g && m ? <mesh key={`s${i}`} geometry={g} material={m} /> : null;
      })}
      {geos.cream && <mesh geometry={geos.cream} material={inside.cream} />}
      {geos.fillings.map((g, i) => {
        const m = inside.fillings[i];
        return g && m ? <mesh key={i} geometry={g} material={m} /> : null;
      })}
    </>
  );
}

function Cupcakes({ at, coat, sponge, liner, board }: { at: THREE.Vector3[]; coat: THREE.Material; sponge: THREE.Material; liner: THREE.Material; board: THREE.Material }) {
  const geos = useOwned(() => ({ liner: linerGeometry(), dome: cupcakeDomeGeometry(), swirl: swirlGeometry(), board: boardGeometry(1.3) }), []);
  const paper = useOwned(() => new THREE.MeshStandardMaterial({ color: (liner as THREE.MeshStandardMaterial).color, roughness: 0.6, metalness: (liner as THREE.MeshStandardMaterial).metalness, side: THREE.DoubleSide }), [liner]);
  const matrices = useMemo(() => at.map((p, i) => new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3), new THREE.Vector3(1, 1, 1))), [at]);
  return (
    <>
      <mesh geometry={geos.board} material={board} />
      <Instanced geometry={geos.liner} material={paper} matrices={matrices} />
      <Instanced geometry={geos.dome} material={sponge} matrices={matrices} />
      <Instanced geometry={geos.swirl} material={coat} matrices={matrices} />
    </>
  );
}

// ─── The add-on pieces ─────────────────────────────────────────────────────────────────

type PieceProps = { addon: PreviewAddon; sites: Site[]; layout: Layout; font: Font; gold: THREE.Material; coat: THREE.Material; piping: THREE.Material; still: boolean };

function Piece(props: PieceProps) {
  const { addon: a } = props;
  switch (a.key) {
    case "piping":
      return <Piping layout={props.layout} material={props.piping} style={a.style} />;
    case "goldLeaf":
      return <GoldLeaf layout={props.layout} material={props.gold} />;
    case "flowers":
      return <Flowers sites={props.sites} color={a.color} fresh={a.fresh} />;
    case "macarons":
      return <Macarons sites={props.sites} color={a.color} />;
    case "fruit":
      return <Fruit sites={props.sites} kind={a.kind} />;
    case "topper":
      return <Topper text={a.text} at={props.layout.topper} reach={props.layout.top?.reach ?? 0.6} font={props.font} material={props.gold} tall={!props.layout.top} />;
    case "sugarFigure":
      return <Bear sites={props.sites} color={a.color} />;
    case "ediblePrint":
      return <EdiblePrint sites={props.sites} layout={props.layout} />;
    case "candles":
      return <Candles sites={props.sites} kind={a.kind} number={a.number} font={props.font} gold={props.gold} still={props.still} />;
  }
}

const RIM_INSET = 0.07; // the rims run this far in from the side (layoutOf)
const posOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m);
const outwardOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
const place = (p: THREE.Vector3, s: number, sy = s) => new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(s, sy, s));

/**
 * The piping, in the style chosen: shells, pearls, rosettes or star kisses along the top edge and
 * round the foot; vintage is shells with swags of pearls hanging on the side; drip runs down from
 * the top edge in drops of different lengths.
 */
function Piping({ layout, material, style }: { layout: Layout; material: THREE.Material; style: PipingStyle }) {
  const geos = useOwned(
    () => ({
      shell: shellGeometry(16),
      pearl: new THREE.SphereGeometry(0.05, 16, 12),
      rosette: rosetteGeometry(),
      kiss: kissGeometry(16).scale(0.055, 0.055, 0.055),
      stem: dripStemGeometry(),
      drop: dripDropGeometry(),
    }),
    [],
  );
  const parts = useMemo(() => {
    const keep = (list: THREE.Matrix4[]) => list.filter((m) => !inCut(layout.cut, posOf(m)));
    const rims = (scale: number) => layout.rims.map((r) => ringMatrices(r, scale));
    const bases = (scale: number) => keep(layout.bases.flatMap((r) => ringMatrices(r, scale)));
    const out: { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[] }[] = [];
    const lift = (list: THREE.Matrix4[], y: number) => list.map((m) => new THREE.Matrix4().makeTranslation(0, y, 0).multiply(m));
    switch (style) {
      case "shells":
        out.push({ geometry: geos.shell, matrices: keep(rims(1).flat()) }, { geometry: geos.shell, matrices: bases(1.1) });
        break;
      case "pearls":
        out.push({ geometry: geos.pearl, matrices: lift(keep(rims(0.85).flat()), 0.03) }, { geometry: geos.pearl, matrices: lift(bases(1), 0.035) });
        break;
      case "rosettes":
        out.push({ geometry: geos.rosette, matrices: keep(rims(1.3).flat()) }, { geometry: geos.shell, matrices: bases(1.1) });
        break;
      case "stars":
        out.push({ geometry: geos.kiss, matrices: keep(rims(1).flat()) }, { geometry: geos.kiss, matrices: bases(1.1) });
        break;
      case "vintage": {
        const swags: THREE.Matrix4[] = [];
        const SPAN = 7;
        for (const ring of rims(1)) {
          for (let i = 0; i + SPAN <= ring.length; i += SPAN) {
            for (let j = 0; j <= SPAN; j += 0.5) {
              const m = ring[Math.min(ring.length - 1, i + Math.floor(j))];
              const p = posOf(m).add(outwardOf(m).multiplyScalar(RIM_INSET + 0.03));
              p.y -= 0.06 + Math.sin((Math.PI * j) / SPAN) * 0.13;
              swags.push(place(p, 0.55));
            }
          }
        }
        out.push({ geometry: geos.shell, matrices: keep(rims(1).flat()) }, { geometry: geos.pearl, matrices: keep(swags) }, { geometry: geos.shell, matrices: bases(1.1) });
        break;
      }
      case "drip": {
        const rnd = rng(29);
        const lip: THREE.Matrix4[] = [];
        const stems: THREE.Matrix4[] = [];
        const drops: THREE.Matrix4[] = [];
        for (const m of rims(0.5).flat()) {
          const edge = posOf(m).add(outwardOf(m).multiplyScalar(RIM_INSET + 0.01));
          lip.push(place(edge, 0.75, 0.5));
          if (rnd() < 0.55) continue;
          const length = 0.08 + rnd() ** 1.6 * 0.3;
          const side = edge.clone().add(outwardOf(m).multiplyScalar(0.008));
          stems.push(place(side, 1, length));
          drops.push(place(side.clone().setY(side.y - length), 1));
        }
        out.push({ geometry: geos.pearl, matrices: keep(lip) }, { geometry: geos.stem, matrices: keep(stems) }, { geometry: geos.drop, matrices: keep(drops) });
        break;
      }
    }
    return out.filter((x) => x.matrices.length);
  }, [layout, style, geos]);
  // on a number cake the cream kisses already are the piping: they take its colour (Cake)
  if (!parts.length) return null;
  return (
    <>
      {parts.map((x, i) => (
        <Instanced key={`${style}-${i}`} geometry={x.geometry} material={material} matrices={x.matrices} />
      ))}
    </>
  );
}

function GoldLeaf({ layout, material }: { layout: Layout; material: THREE.Material }) {
  const flake = useOwned(goldLeafGeometry, []);
  const matrices = useMemo(() => {
    const rnd = rng(47);
    const out: THREE.Matrix4[] = [];
    const flakeAt = (p: THREE.Vector3, outward: THREE.Vector3) => {
      if (inCut(layout.cut, p)) return;
      const s = 0.04 + rnd() ** 1.5 * 0.05;
      out.push(basisAt(p, outward).multiply(new THREE.Matrix4().makeRotationZ(rnd() * Math.PI * 2)).multiply(new THREE.Matrix4().makeScale(s, s, s * 0.6)));
    };
    for (const side of layout.sides) {
      const band = (y0: number, y1: number) => y0 + (y1 - y0) * (0.55 + rnd() * 0.38);
      if (side.kind === "cyl") {
        const n = Math.round(14 * side.r);
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2;
          const outward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
          flakeAt(outward.clone().multiplyScalar(side.r + 0.003).setY(band(side.y0, side.y1)), outward);
        }
      } else {
        const faces: [THREE.Vector3, number, number][] = [
          [new THREE.Vector3(0, 0, 1), side.w, side.d / 2],
          [new THREE.Vector3(0, 0, -1), side.w, side.d / 2],
          [new THREE.Vector3(1, 0, 0), side.d, side.w / 2],
          [new THREE.Vector3(-1, 0, 0), side.d, side.w / 2],
        ];
        for (const [outward, length, half] of faces) {
          const along = new THREE.Vector3(outward.z, 0, -outward.x);
          for (let i = 0; i < Math.round(length * 4); i++) {
            flakeAt(outward.clone().multiplyScalar(half + 0.003).add(along.clone().multiplyScalar((rnd() - 0.5) * (length - 0.2))).setY(band(side.y0, side.y1)), outward);
          }
        }
      }
    }
    // on a number cake and cupcakes: flakes laid on the cream
    const up = new THREE.Vector3(0, 1, 0);
    layout.spots.forEach((p, i) => {
      if (i % 3) return;
      const s = 0.05 + rnd() * 0.04;
      out.push(new THREE.Matrix4().compose(p.clone().add(new THREE.Vector3(0, 0.01, 0)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), up.clone().add(new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).multiplyScalar(0.8)).normalize()), new THREE.Vector3(s, s, s * 0.6)));
    });
    return out;
  }, [layout]);
  return <Instanced geometry={flake} material={material} matrices={matrices} />;
}

function Flowers({ sites, color, fresh }: { sites: Site[]; color: string | null; fresh: boolean }) {
  const geos = useOwned(() => ({ rose: roseGeometry(), leaf: leafGeometry(), floret: floretGeometry() }), []);
  const petal = useOwned(
    () =>
      fresh
        ? new THREE.MeshPhysicalMaterial({ color: color ?? "#F1B6C3", roughness: 0.55, sheen: 1, sheenColor: new THREE.Color("#fff3f5"), sheenRoughness: 0.4, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: color ?? "#FBF6EE", roughness: 0.8, side: THREE.DoubleSide }),
    [color, fresh],
  );
  const leaf = useOwned(() => new THREE.MeshStandardMaterial({ color: fresh ? "#5D8748" : "#9DB38A", roughness: 0.6, side: THREE.DoubleSide }), [fresh]);
  const { roses, leaves, florets } = useMemo(() => {
    const rnd = rng(19);
    const roses: THREE.Matrix4[] = [];
    const leaves: THREE.Matrix4[] = [];
    const florets: THREE.Matrix4[] = [];
    const q = (yaw: number, tilt = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, "YXZ"));
    sites.forEach((site, i) => {
      const big = (i === 0 ? 0.48 : 0.36 + rnd() * 0.08) * site.s;
      roses.push(new THREE.Matrix4().compose(site.p, q(site.yaw, (rnd() - 0.5) * 0.4), new THREE.Vector3(big, big, big)));
      for (let k = 0; k < 2; k++) {
        const yaw = site.yaw + k * Math.PI + rnd() * 0.6;
        const l = 0.24 * site.s;
        leaves.push(new THREE.Matrix4().compose(site.p.clone().add(new THREE.Vector3(Math.sin(yaw) * big * 0.35, 0.02, Math.cos(yaw) * big * 0.35)), q(yaw), new THREE.Vector3(l, l, l)));
      }
      for (let k = 0; k < (fresh ? 2 : 5); k++) {
        const yaw = rnd() * Math.PI * 2;
        const d = big * (0.6 + rnd() * 0.3);
        const f = (0.06 + rnd() * 0.04) * site.s;
        florets.push(new THREE.Matrix4().compose(site.p.clone().add(new THREE.Vector3(Math.sin(yaw) * d, 0.03 + rnd() * 0.05, Math.cos(yaw) * d)), q(yaw, (rnd() - 0.5) * 0.6), new THREE.Vector3(f, f, f)));
      }
    });
    return { roses, leaves, florets };
  }, [sites, fresh]);
  return (
    <>
      <Instanced geometry={geos.rose} material={petal} matrices={roses} />
      <Instanced geometry={geos.leaf} material={leaf} matrices={leaves} />
      <Instanced geometry={geos.floret} material={petal} matrices={florets} />
    </>
  );
}

function Macarons({ sites, color }: { sites: Site[]; color: string | null }) {
  const geos = useOwned(macaronGeometry, []);
  const shell = useOwned(() => new THREE.MeshPhysicalMaterial({ color: color ?? "#E9B7BF", roughness: 0.62, sheen: 0.3 }), [color]);
  const filling = useOwned(() => creamMaterial("#FFF4E6"), []);
  const matrices = useMemo(
    () =>
      sites.map(({ p, s, yaw }) =>
        // standing on its edge, leaning back, its face turned out
        new THREE.Matrix4().compose(p.clone().add(new THREE.Vector3(0, 0.17 * s, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.45, yaw, 0, "YXZ")), new THREE.Vector3(s, s, s)),
      ),
    [sites],
  );
  return (
    <>
      <Instanced geometry={geos.shells} material={shell} matrices={matrices} />
      <Instanced geometry={geos.filling} material={filling} matrices={matrices} />
    </>
  );
}

function Fruit({ sites, kind }: { sites: Site[]; kind: "strawberries" | "berries" | "mixed" }) {
  const geos = useOwned(() => ({ ...strawberryGeometry(), raspberry: raspberryGeometry(), blueberry: blueberryGeometry() }), []);
  const mats = useOwned(
    () => ({
      red: new THREE.MeshPhysicalMaterial({ color: "#C81E33", roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
      green: matte("#4E7B2E", 0.6),
      raspberry: new THREE.MeshPhysicalMaterial({ color: "#B3173F", roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color("#ff8fa8") }),
      blue: new THREE.MeshPhysicalMaterial({ color: "#3A3F6E", roughness: 0.4, sheen: 0.8, sheenColor: new THREE.Color("#b9c2e8"), sheenRoughness: 0.3 }),
    }),
    [],
  );
  const groups = useMemo(() => {
    const out = { strawberry: [] as THREE.Matrix4[], raspberry: [] as THREE.Matrix4[], blueberry: [] as THREE.Matrix4[] };
    sites.forEach(({ p, s, yaw }, i) => {
      const type = kind === "strawberries" ? "strawberry" : kind === "berries" ? (i % 2 ? "raspberry" : "blueberry") : (["strawberry", "blueberry", "raspberry"] as const)[i % 3];
      // a strawberry lies on its side; berries sit upright
      const q = new THREE.Quaternion().setFromEuler(type === "strawberry" ? new THREE.Euler(0, yaw, Math.PI / 2 - 0.25, "YXZ") : new THREE.Euler(0, yaw, 0));
      const lift = type === "strawberry" ? 0.09 : type === "blueberry" ? 0.045 : 0;
      out[type].push(new THREE.Matrix4().compose(p.clone().add(new THREE.Vector3(0, lift * s, 0)), q, new THREE.Vector3(s, s, s)));
    });
    return out;
  }, [sites, kind]);
  return (
    <>
      <Instanced geometry={geos.berry} material={mats.red} matrices={groups.strawberry} />
      <Instanced geometry={geos.calyx} material={mats.green} matrices={groups.strawberry} />
      <Instanced geometry={geos.raspberry} material={mats.raspberry} matrices={groups.raspberry} />
      <Instanced geometry={geos.blueberry} material={mats.blue} matrices={groups.blueberry} />
    </>
  );
}

function Topper({ text, at, reach, font, material, tall }: { text: string; at: THREE.Vector3; reach: number; font: Font; material: THREE.Material; tall: boolean }) {
  const visual = visualOrder(drawable(text, (ch) => !!font.data.glyphs[ch])).join("");
  const geo = useOwned(() => (visual ? topperTextGeometry(font, visual, Math.max(0.7, reach * 1.3)) : heartGeometry()), [visual, font, reach]);
  const stick = useOwned(() => new THREE.CylinderGeometry(0.008, 0.008, 1, 8), []);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const rise = tall ? 0.42 : 0.3;
  const half = Math.max(0.05, (b.max.x - b.min.x) * 0.3);
  return (
    <group position={at}>
      <mesh geometry={geo} material={material} position-y={rise} />
      {[-half, half].map((x) => (
        <mesh key={x} geometry={stick} material={material} position={[x, rise / 2 - 0.05, 0]} scale-y={rise + 0.1} />
      ))}
    </group>
  );
}

function Bear({ sites, color }: { sites: Site[]; color: string | null }) {
  const geos = useOwned(bearGeometry, []);
  const mats = useOwned(() => ({ body: matte(color ?? "#D8B08A", 0.7), muzzle: matte("#F3E2CC", 0.7), eyes: new THREE.MeshStandardMaterial({ color: "#2B1D16", roughness: 0.2 }) }), [color]);
  return (
    <>
      {sites.map(({ p, s, yaw }, i) => (
        <group key={i} position={p} rotation-y={yaw} scale={s}>
          <mesh geometry={geos.body} material={mats.body} />
          <mesh geometry={geos.muzzle} material={mats.muzzle} />
          <mesh geometry={geos.eyes} material={mats.eyes} />
        </group>
      ))}
    </>
  );
}

function EdiblePrint({ sites, layout }: { sites: Site[]; layout: Layout }) {
  const texture = useOwned(printTexture, []);
  const mat = useOwned(() => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45 }), [texture]);
  const top = layout.top;
  // a disc on a round top, a rectangle on a tray, small discs on a number cake or cupcakes
  const rect = !!top && layout.rims[0]?.kind === "rect";
  const size = top ? top.reach * (rect ? 0.62 : 0.4) : 0.13;
  const geo = useOwned(() => (rect ? new THREE.PlaneGeometry(size * 1.4, size) : new THREE.CircleGeometry(size, 48)), [rect, size]);
  return (
    <>
      {sites.map(({ p }, i) => (
        // on a number cake or a cupcake it rests on the cream, tipped toward the front
        <mesh key={i} geometry={geo} material={mat} position={p.clone().add(new THREE.Vector3(0, top ? 0.004 : 0.09, top ? 0 : 0.03))} rotation-x={top ? -Math.PI / 2 : -Math.PI / 2 + 0.6} />
      ))}
    </>
  );
}

function Candles({ sites, kind, number, font, gold, still }: { sites: Site[]; kind: "candles" | "number" | "sparklers"; number: string; font: Font; gold: THREE.Material; still: boolean }) {
  const geos = useOwned(() => ({ candle: candleGeometry(new THREE.Color("#E7A3B1"), new THREE.Color("#FFF8F0")), flame: flameGeometry(), stick: new THREE.CylinderGeometry(0.006, 0.006, 0.6, 6).translate(0, 0.3, 0) }), []);
  const mats = useOwned(
    () => ({
      wax: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
      flame: new THREE.MeshBasicMaterial({ color: "#FFC867", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      spark: new THREE.PointsMaterial({ color: "#F2B33D", size: 0.045, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  const digits = useOwned(() => (kind === "number" && number ? numberCandleGeometry(font, number) : null), [kind, number, font]);
  const flames = useRef<(THREE.Object3D | null)[]>([]);
  const sparks = useOwned(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(sites.length * 40 * 3), 3));
    return g;
  }, [sites.length]);
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime;
    flames.current.forEach((f, i) => f && f.scale.set(1 + 0.08 * Math.sin(t * 17 + i), 1 + 0.18 * Math.sin(t * 23 + i * 2), 1));
    if (kind !== "sparklers") return;
    const pos = sparks.attributes.position as THREE.BufferAttribute;
    sites.forEach(({ p, s }, k) => {
      for (let i = 0; i < 40; i++) {
        const u = Math.random() * Math.PI * 2;
        const r = Math.random() ** 2 * 0.16 * s;
        pos.setXYZ(k * 40 + i, p.x + Math.cos(u) * r, p.y + 0.6 * s + (Math.random() - 0.3) * r, p.z + Math.sin(u) * r);
      }
    });
    pos.needsUpdate = true;
  });
  useLayoutEffect(() => {
    if (kind !== "sparklers") return;
    const pos = sparks.attributes.position as THREE.BufferAttribute;
    const rnd = rng(5);
    sites.forEach(({ p, s }, k) => {
      for (let i = 0; i < 40; i++) {
        const u = rnd() * Math.PI * 2;
        const r = rnd() ** 2 * 0.16 * s;
        pos.setXYZ(k * 40 + i, p.x + Math.cos(u) * r, p.y + 0.6 * s + (rnd() - 0.3) * r, p.z + Math.sin(u) * r);
      }
    });
    pos.needsUpdate = true;
    sparks.computeBoundingSphere();
  }, [kind, sites, sparks]);

  if (kind === "number" && digits) {
    const { p, s } = sites[0] ?? { p: new THREE.Vector3(), s: 1 };
    return (
      <group position={p} scale={s}>
        <mesh geometry={digits.geometry} material={gold} />
        <mesh
          ref={(el) => {
            flames.current[0] = el;
          }}
          geometry={geos.flame}
          material={mats.flame}
          position-y={digits.height + 0.02}
        />
      </group>
    );
  }
  if (kind === "sparklers")
    return (
      <>
        {sites.map(({ p, s }, i) => (
          <mesh key={i} geometry={geos.stick} material={gold} position={p} scale={s} />
        ))}
        <points geometry={sparks} material={mats.spark} />
      </>
    );
  return (
    <>
      {sites.map(({ p, s, yaw }, i) => (
        <group key={i} position={p} rotation-y={yaw} scale={s * 0.62}>
          <mesh geometry={geos.candle} material={mats.wax} />
          <mesh
            ref={(el) => {
              flames.current[i] = el;
            }}
            geometry={geos.flame}
            material={mats.flame}
            position-y={0.72}
          />
        </group>
      ))}
    </>
  );
}

// ─── The inscription ───────────────────────────────────────────────────────────────────

/** The words on the cake: bent round the front of a round cake, or lying on a tray's top */
function Message({ text, at, font, material }: { text: string; at: NonNullable<Layout["message"]>; font: Font; material: THREE.Material }) {
  const geometry = useOwned(() => {
    const chars = visualOrder(drawable(text, (ch) => !!font.data.glyphs[ch]));
    if (!chars.length) return null;
    const options = { font, depth: 0.02, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 2 };
    const advanceAt = (size: number) => (ch: string) => (font.data.glyphs[ch]?.ha ?? font.data.glyphs[" "]?.ha ?? 300) * (size / font.data.resolution) * 1.03;
    const room = at.kind === "cyl" ? at.r * at.arc : at.width;
    const natural = chars.reduce((sum, ch) => sum + advanceAt(1)(ch), 0);
    const size = Math.min(0.2, room / natural);
    const advance = advanceAt(size);
    const total = chars.reduce((sum, ch) => sum + advance(ch), 0);
    const parts: THREE.BufferGeometry[] = [];
    let run = -total / 2;
    for (const ch of chars) {
      const width = advance(ch);
      if (ch.trim()) {
        const g = new TextGeometry(ch, { ...options, size });
        g.translate(run + (width - width / 1.03) / 2, -size * 0.36, 0);
        parts.push(g);
      }
      run += width;
    }
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (const g of parts) {
      const src = g.index ? g.toNonIndexed() : g;
      const pos = src.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (src !== g) src.dispose();
      g.dispose();
    }
    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const pos = merged.attributes.position as THREE.BufferAttribute;
    if (at.kind === "cyl") {
      // round the cake: x becomes an angle on the cylinder, z the distance out from it
      const R = at.r + 0.004;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const a = x / R + at.center;
        pos.setXYZ(i, Math.sin(a) * (R + z), pos.getY(i) + at.y, Math.cos(a) * (R + z));
      }
    } else {
      merged.rotateX(-Math.PI / 2);
      merged.translate(0, at.y + 0.002, at.z);
    }
    merged.computeVertexNormals();
    return merged;
  }, [text, font, at]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} />;
}
