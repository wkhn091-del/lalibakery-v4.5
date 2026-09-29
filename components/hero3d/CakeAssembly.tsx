import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import {
  bowGeometry,
  CAKE,
  COAT_H,
  COAT_TOP_RADIUS,
  coatGeometry,
  creamGeometry,
  CUT,
  cutFaceGeometry,
  floretGeometry,
  flowerLayout,
  goldLeafGeometry,
  goldLeafLayout,
  layerBottom,
  PIECES,
  type Piece,
  pipingLayout,
  PLATE_TOP,
  type Placed,
  RIBBON,
  ribbonBandGeometry,
  shellGeometry,
  SLICE_DIR,
  spiralGeometry,
  spongeGeometry,
  standGeometry,
} from "./cakeParts";
import { sceneClock } from "./clock";
import { ASSETS } from "./config";
import { Inscription } from "./Letters";
import { patchMaterial, physical, type RevealUniforms } from "./materials";
import { keepShared } from "./shared";
import { hero3d } from "./store";
import { easeInOutCubic, easeOutBack, easeOutCubic, smootherstep, stage, STAGES } from "./timeline";

const PIECE_NAMES: Piece[] = ["cake", "slice"];
const LAYER_STAGES = [STAGES.layer0, STAGES.layer1, STAGES.layer2];
const CREAM_STAGES = [STAGES.cream0, STAGES.cream1];

/** Frees every geometry and material in a (nested) set of them. R3F frees only what it makes from
 *  JSX; these are made in useMemo and handed to meshes. Textures are left alone: the loader's cache
 *  owns them, and hands them to the next visit. */
function disposeAll(value: unknown): void {
  if (value instanceof THREE.BufferGeometry || value instanceof THREE.Material) value.dispose();
  else if (Array.isArray(value)) value.forEach(disposeAll);
  else if (value && typeof value === "object" && !(value instanceof THREE.Texture)) Object.values(value).forEach(disposeAll);
}

// ─── Textures (generated offline by scripts/hero3d-textures.py) ─────────────────────────
function useCakeTextures() {
  const t = useTexture(ASSETS.textures);
  const textures = useMemo(() => {
    for (const tex of Object.values(t)) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.colorSpace = THREE.NoColorSpace; // normal and height maps are data, not colour
    }
    for (const tex of [t.crumbColor, t.crustColor, t.insideColor]) tex.colorSpace = THREE.SRGBColorSpace;
    for (const tex of [t.insideColor, t.insideNormal, t.insideHeight]) tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    t.creamNormal.repeat.set(7, 2); // scraper strokes: round the cake, and circling the top
    t.satinNormal.repeat.set(30, 1);
    return t;
  }, [t]);
  // cached for the page's life (a return to the page doesn't fetch them again): released with the
  // scene, not with this canvas (shared.ts)
  useEffect(() => {
    for (const tex of Object.values(textures)) keepShared(tex);
  }, [textures]);
  return textures;
}
type CakeTextures = ReturnType<typeof useCakeTextures>;

/** Lathe and cylinder UVs run 0…1 over each piece's own arc, so the slice (40°) and the rest of
 *  the cake (320°) would stretch textures eight times differently. Re-derive u from the absolute
 *  angle, so strokes and weave run on unbroken across the cut. */
function angularU<G extends THREE.BufferGeometry>(g: G, piece: Piece): G {
  const { start, length } = PIECES[piece];
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (start + uv.getX(i) * length) / (Math.PI * 2));
  return g;
}

// ─── Materials ────────────────────────────────────────────────────────────────────────
// Every food surface is MeshPhysicalMaterial.
//  • Buttercream: soft (roughness ~0.4 under a thin clearcoat: the fresh sheen of real buttercream),
//    a velvety sheen, some transmission with thickness and a warm attenuation (the crumb coat shows
//    faintly through, as in a real cake), light bleeding through from behind, a soft warm edge
//    between light and shadow, and the strokes of the scraper.
//  • Sponge: a baked crust on the sides, open crumb on the leveled tops, both with normal maps for
//    every pore and a displacement map that moves the geometry itself.
//  • Gold satin: metallic fabric, its highlight stretched along the threads, a gold sheen, the weave.
// Phones keep physical materials without transmission, clearcoat and anisotropy.
function useCakeMaterials(lite: boolean, tex: CakeTextures) {
  const materials = useMemo(() => {
    const baked = { color: "#ffc27a", scale: 0.3, power: 2.5 };
    const creamGlow = { color: "#fff4ea", scale: 0.4, power: 3 };
    const creamWrap = { amount: 0.55, tint: "#ffe6d4" };
    const bakedWrap = { amount: 0.3, tint: "#ffae66" };
    const reveal: RevealUniforms = {
      uRise: { value: 0 },
      uTop: { value: 0 },
      uHeight: { value: COAT_H + CAKE.lip },
      uTopY: { value: COAT_H },
      uTopRadius: { value: COAT_TOP_RADIUS },
    };
    const creamy: THREE.MeshPhysicalMaterialParameters = {
      roughness: 0.42,
      sheen: 0.7,
      sheenRoughness: 0.5,
      sheenColor: "#ffffff",
      clearcoat: 0.25,
      clearcoatRoughness: 0.32,
      ior: 1.4,
    };
    // the crust's displacement map, shared by the crust and the crumb so their shared edge can't open
    const relief = { displacementMap: tex.crustHeight, displacementScale: 0.01, displacementBias: -0.005 };
    const sponge: THREE.MeshPhysicalMaterialParameters = { ...relief, roughness: 0.9, sheen: 0.3, sheenRoughness: 0.85, sheenColor: "#f2c98c" };
    return {
      reveal,
      spongeSide: patchMaterial(physical({ ...sponge, map: tex.crustColor, normalMap: tex.crustNormal, normalScale: new THREE.Vector2(1, 1) }, lite), {
        subsurface: baked,
        wrap: bakedWrap,
      }),
      spongeCap: patchMaterial(physical({ ...sponge, roughness: 0.94, map: tex.crumbColor, normalMap: tex.crumbNormal, normalScale: new THREE.Vector2(2, 2) }, lite), {
        subsurface: baked,
        wrap: bakedWrap,
      }),
      cream: patchMaterial(
        physical(
          {
            ...creamy,
            color: "#fbf6ee",
            transmission: 0.18,
            thickness: 0.25,
            attenuationColor: "#f6e4cf",
            attenuationDistance: 0.35,
            normalMap: tex.creamNormal,
            normalScale: new THREE.Vector2(0.4, 0.4),
          },
          lite,
        ),
        { subsurface: creamGlow, wrap: creamWrap },
      ),
      coat: patchMaterial(
        physical(
          {
            ...creamy,
            color: "#fcf8f2",
            transmission: 0.14,
            thickness: 1.0,
            attenuationColor: "#f7e7d4",
            attenuationDistance: 0.7,
            normalMap: tex.creamNormal,
            normalScale: new THREE.Vector2(0.45, 0.45),
          },
          lite,
        ),
        { subsurface: creamGlow, wrap: creamWrap, reveal },
      ),
      // the spiral fades away as the coat rises: transparent rather than transmissive
      spiral: patchMaterial(physical({ ...creamy, color: "#fcf8f2", transparent: true }, lite), { subsurface: creamGlow, wrap: creamWrap }),
      piping: patchMaterial(physical({ ...creamy, color: "#fdfaf5", roughness: 0.36, clearcoat: 0.3 }, lite), { subsurface: creamGlow, wrap: creamWrap }),
      satin: physical(
        {
          color: "#d8a854",
          metalness: 0.3,
          roughness: 0.4,
          anisotropy: 0.4,
          sheen: 0.9,
          sheenRoughness: 0.4,
          sheenColor: "#ffdf9e",
          clearcoat: 0.15,
          clearcoatRoughness: 0.35,
          normalMap: tex.satinNormal,
          normalScale: new THREE.Vector2(0.4, 0.4),
        },
        lite,
      ),
      gold: physical({ color: "#e2b04f", metalness: 1, roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.1 }, lite),
      leaf: physical({ color: "#e8bd62", metalness: 1, roughness: 0.34, envMapIntensity: 2.2, emissive: "#d9a441", emissiveIntensity: 0.35, side: THREE.DoubleSide }, lite),
      floret: patchMaterial(physical({ color: "#fffdf8", roughness: 0.7, sheen: 0.6, sheenColor: "#ffffff" }, lite), {
        subsurface: { color: "#ffffff", scale: 0.55 },
        wrap: { amount: 0.6, tint: "#fff1de" },
      }),
      stem: physical({ color: "#7f9160", roughness: 0.8 }, lite),
      // glazed porcelain, its reflections kept below the bloom threshold (a bright stand glows like a lamp)
      stand: physical({ color: "#e4ddd6", roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.6 }, lite),
      inside: patchMaterial(
        physical(
          {
            map: tex.insideColor,
            normalMap: tex.insideNormal,
            normalScale: new THREE.Vector2(1.2, 1.2),
            displacementMap: tex.insideHeight,
            displacementScale: 0.012,
            displacementBias: -0.006,
            roughness: 0.92,
            sheen: 0.3,
            sheenColor: "#f7e2c0",
          },
          lite,
        ),
        { wrap: { amount: 0.4, tint: "#ffcf9a" } },
      ),
    };
  }, [lite, tex]);
  useEffect(() => () => disposeAll(materials), [materials]);
  return materials;
}

function useCakeGeometry(lite: boolean) {
  const geometry = useMemo(
    () => ({
      stand: standGeometry(),
      sponge: [0, 1, 2].map((layer) => PIECE_NAMES.map((p) => spongeGeometry(p, layer))),
      cream: PIECE_NAMES.map((p) => angularU(creamGeometry(p), p)),
      coat: PIECE_NAMES.map((p) => angularU(coatGeometry(p), p)),
      band: PIECE_NAMES.map((p) => angularU(ribbonBandGeometry(p), p)),
      // the cut: the cake's two faces look into the gap, the slice's two look out of it
      cuts: {
        cakeStart: cutFaceGeometry(CUT.start, 1, lite ? 32 : 56),
        cakeEnd: cutFaceGeometry(CUT.start + CUT.length, -1, lite ? 32 : 56),
        sliceStart: cutFaceGeometry(CUT.start, -1, lite ? 32 : 56),
        sliceEnd: cutFaceGeometry(CUT.start + CUT.length, 1, lite ? 32 : 56),
      },
      spiral: spiralGeometry(),
      bow: bowGeometry(),
      shell: shellGeometry(lite ? 14 : 22),
      leaf: goldLeafGeometry(),
      floret: floretGeometry(),
      stemBit: new THREE.IcosahedronGeometry(1, 0),
    }),
    [lite],
  );
  useEffect(() => () => disposeAll(geometry), [geometry]);
  return geometry;
}

// The exploded view: how high above its place each sponge layer hovers before it flies in
const HOVER = [1.05, 1.57, 2.09];
// 0 = hovering in the exploded view, 1 = in place; the flight eases in and out, then settles
function fly(t: number) {
  if (t < 0.8) return smootherstep(t / 0.8);
  const u = (t - 0.8) / 0.2;
  return 1 - Math.sin(u * Math.PI) * 0.015 * (1 - u);
}

/** Writes a set of placed pieces into an instanced mesh, each growing in turn: a piece of `order` k
 *  grows over [k × stagger, k × stagger + span] of its step's own 0–1 progress `t`, with a little
 *  overshoot. (Plain arguments, no callback: this runs every frame while the step plays.) */
function writePlaced(mesh: THREE.InstancedMesh, items: Placed[], t: number, stagger: number, span: number, overshoot: number, temp: THREE.Matrix4, scale: THREE.Matrix4) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const s = Math.max(0.0001, easeOutBack(Math.min(1, Math.max(0, (t - item.order * stagger) / span)), overshoot));
    mesh.setMatrixAt(i, temp.multiplyMatrices(item.matrix, scale.makeScale(s, s, s)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = t > 0;
}

type Blooms = ReturnType<typeof flowerLayout>["florets"];
/** Writes the baby's breath into an instanced mesh, each spray opening as the wave reaches it */
function writeBloom(mesh: THREE.InstancedMesh, items: Blooms, t: number, dummy: THREE.Object3D) {
  for (let i = 0; i < items.length; i++) {
    const f = items[i];
    const local = Math.min(1, Math.max(0, (t - f.delay * 0.7) / 0.3));
    dummy.position.copy(f.p);
    dummy.rotation.set(f.tilt, f.spin, f.tilt * 0.5);
    dummy.scale.setScalar(Math.max(0.0001, f.s * easeOutBack(local, 2.2)));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = t > 0;
}

/**
 * The cake, assembling itself on one progress value (the page's scroll): sponge layers fly in from
 * the exploded view with cream between, buttercream spirals up and is smoothed into a coat, a shell
 * border is piped round the top, gold satin wraps the base and ties into a bow, gold letters and
 * gold leaf arrive, baby's breath blooms, and at the end a slice is lifted out. Every step reads
 * hero3d.progress each frame (see timeline.ts); nothing here re-renders React while it plays, and
 * nothing is allocated per frame (plain loops, no callbacks), so the scroll never feeds the garbage
 * collector. Its materials and geometries are freed when it goes.
 */
export default function CakeAssembly({ lite = false }: { lite?: boolean }) {
  const tex = useCakeTextures();
  const m = useCakeMaterials(lite, tex);
  const g = useCakeGeometry(lite);
  const layout = useMemo(() => {
    const flowers = flowerLayout();
    const piping = pipingLayout();
    const leaf = goldLeafLayout();
    return {
      flowers,
      piping: { cake: piping.filter((s) => !s.slice), slice: piping.filter((s) => s.slice) },
      leaf: { cake: leaf.filter((s) => !s.slice), slice: leaf.filter((s) => s.slice) },
    };
  }, []);

  const root = useRef<THREE.Group>(null);
  const layers = useRef<(THREE.Group | null)[]>([]);
  const creams = useRef<(THREE.Group | null)[]>([]);
  const coats = useRef<(THREE.Mesh | null)[]>([]);
  const bands = useRef<(THREE.Mesh | null)[]>([]);
  const cuts = useRef<(THREE.Mesh | null)[]>([]);
  const spiral = useRef<THREE.Mesh>(null);
  const bow = useRef<THREE.Group>(null);
  const piping = useRef<{ cake: THREE.InstancedMesh | null; slice: THREE.InstancedMesh | null }>({ cake: null, slice: null });
  const leaf = useRef<{ cake: THREE.InstancedMesh | null; slice: THREE.InstancedMesh | null }>({ cake: null, slice: null });
  const florets = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const sliceParts = useRef<THREE.Object3D[]>([]);
  const last = useRef({ piping: -1, leaf: -1, bloom: -1 });
  const still = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const temp = useMemo(() => ({ offset: new THREE.Vector3(), dummy: new THREE.Object3D(), m: new THREE.Matrix4(), s: new THREE.Matrix4() }), []);

  // Every part casts and receives shadows (set before the shaders are compiled: it changes them)
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }, []);

  const sliceRef = (el: THREE.Object3D | null) => {
    if (el && !sliceParts.current.includes(el)) sliceParts.current.push(el);
  };

  useFrame(() => {
    const p = hero3d.progress;
    const time = still ? 0 : sceneClock.time; // the display's own clock (clock.ts)
    const { offset, dummy } = temp;

    // The exploded cake: layers and cream hover apart, turning gently, then fly into place
    for (let i = 0; i < LAYER_STAGES.length; i++) {
      const layer = layers.current[i];
      if (!layer) continue;
      const t = stage(p, LAYER_STAGES[i]);
      const hover = 1 - fly(t);
      layer.position.y = layerBottom(i) + HOVER[i] * hover + Math.sin(time * 0.9 + i * 1.3) * 0.035 * hover;
      layer.rotation.y = hover * (0.35 + Math.sin(time * 0.25 + i) * 0.5);
      layer.rotation.z = hover * Math.sin(time * 0.4 + i * 2) * 0.05;
      const squash = Math.max(0, 1 - Math.abs(t - 0.84) / 0.1); // the soft give as it lands
      layer.scale.set(1 + squash * 0.03, 1 - squash * 0.07, 1 + squash * 0.03);
    }
    for (let i = 0; i < CREAM_STAGES.length; i++) {
      const cream = creams.current[i];
      if (!cream) continue;
      const f = fly(stage(p, CREAM_STAGES[i]));
      const hover = 1 - f;
      const between = (HOVER[i] + HOVER[i + 1]) / 2 + 0.03;
      cream.position.y = layerBottom(i) + CAKE.layer + between * hover + Math.sin(time * 0.9 + i * 1.3 + 0.6) * 0.035 * hover;
      cream.rotation.y = hover * Math.sin(time * 0.3 + i) * 0.4;
      cream.scale.setScalar(0.94 + 0.06 * f);
    }

    // Buttercream: the spiral grows up the stack, the coat rises behind it, the top fills in
    const spiralT = easeInOutCubic(stage(p, STAGES.spiral));
    const spiralFade = 1 - stage(p, STAGES.spiralFade);
    if (spiral.current) {
      const count = g.spiral.index!.count;
      spiral.current.geometry.setDrawRange(0, Math.floor((count * spiralT) / 6) * 6);
      spiral.current.visible = spiralT > 0 && spiralFade > 0;
      m.spiral.opacity = spiralFade;
    }
    const rise = easeInOutCubic(stage(p, STAGES.coat));
    m.reveal.uRise.value = rise;
    m.reveal.uTop.value = easeOutCubic(stage(p, STAGES.top));
    for (let i = 0; i < coats.current.length; i++) {
      const c = coats.current[i];
      if (c) c.visible = rise > 0;
    }

    // The shell border, piped round the top edge one shell after another (matrices written only
    // while it plays)
    const pipeT = stage(p, STAGES.piping);
    if (pipeT !== last.current.piping) {
      last.current.piping = pipeT;
      for (let k = 0; k < PIECE_NAMES.length; k++) {
        const mesh = piping.current[PIECE_NAMES[k]];
        if (mesh) writePlaced(mesh, layout.piping[PIECE_NAMES[k]], pipeT, 0.8, 0.2, 1.4, temp.m, temp.s);
      }
    }

    // Gold satin wraps once round (the cake piece first, then the slice), then the bow
    const wrap = easeInOutCubic(stage(p, STAGES.ribbon));
    const cakeShare = PIECES.cake.length / (Math.PI * 2);
    for (let i = 0; i < bands.current.length; i++) {
      const band = bands.current[i];
      if (!band) continue;
      const f = i === 0 ? Math.min(1, wrap / cakeShare) : Math.max(0, (wrap - cakeShare) / (1 - cakeShare));
      const count = band.geometry.index!.count;
      band.geometry.setDrawRange(0, Math.floor((count * f) / 6) * 6);
      band.visible = f > 0;
    }
    if (bow.current) {
      const t = stage(p, STAGES.bow);
      bow.current.visible = t > 0;
      bow.current.scale.setScalar(Math.max(0.001, easeOutBack(t)));
      bow.current.rotation.z = (1 - t) * 0.6;
    }

    // Gold leaf, pressed onto the frosting flake by flake
    const leafT = stage(p, STAGES.goldLeaf);
    if (leafT !== last.current.leaf) {
      last.current.leaf = leafT;
      for (let k = 0; k < PIECE_NAMES.length; k++) {
        const mesh = leaf.current[PIECE_NAMES[k]];
        if (mesh) writePlaced(mesh, layout.leaf[PIECE_NAMES[k]], leafT, 0.75, 0.25, 1.8, temp.m, temp.s);
      }
    }

    // Baby's breath blooms round the base, in a wave (matrices written only while it blooms)
    const bloomT = stage(p, STAGES.flowers);
    if (bloomT !== last.current.bloom && florets.current && stems.current) {
      last.current.bloom = bloomT;
      writeBloom(florets.current, layout.flowers.florets, bloomT, dummy);
      writeBloom(stems.current, layout.flowers.stems, bloomT, dummy);
    }

    // The slice: lifted first (clearing the flowers), then drawn out, showing the inside
    const cut = stage(p, STAGES.slice);
    const lift = smootherstep(Math.min(1, cut / 0.35));
    const out = easeInOutCubic(Math.min(1, Math.max(0, (cut - 0.25) / 0.75)));
    offset.copy(SLICE_DIR).multiplyScalar(out * 0.8);
    offset.y = lift * 0.3 - out * 0.16;
    for (let i = 0; i < sliceParts.current.length; i++) sliceParts.current[i].position.copy(offset);
    for (let i = 0; i < cuts.current.length; i++) {
      const face = cuts.current[i];
      if (face) face.visible = cut > 0;
    }
  });

  const slot =
    <T,>(list: RefObject<(T | null)[]>, i: number, slice = false) =>
    (el: T | null) => {
      list.current[i] = el;
      if (slice) sliceRef(el as unknown as THREE.Object3D | null);
    };

  return (
    <group ref={root}>
      <mesh geometry={g.stand} material={m.stand} />

      <group position-y={PLATE_TOP}>
        {[0, 1, 2].map((i) => (
          <group key={i} ref={slot(layers, i)}>
            <mesh geometry={g.sponge[i][0]} material={[m.spongeSide, m.spongeCap]} />
            <mesh ref={sliceRef} geometry={g.sponge[i][1]} material={[m.spongeSide, m.spongeCap]} />
          </group>
        ))}
        {[0, 1].map((i) => (
          <group key={i} position-y={layerBottom(i) + CAKE.layer} ref={slot(creams, i)}>
            <mesh geometry={g.cream[0]} material={m.cream} />
            <mesh ref={sliceRef} geometry={g.cream[1]} material={m.cream} />
          </group>
        ))}

        <mesh ref={spiral} geometry={g.spiral} material={m.spiral} visible={false} />
        <mesh ref={slot(coats, 0)} geometry={g.coat[0]} material={m.coat} visible={false} />
        <mesh ref={slot(coats, 1, true)} geometry={g.coat[1]} material={m.coat} visible={false} />

        <instancedMesh
          ref={(el) => {
            piping.current.cake = el;
          }}
          args={[g.shell, m.piping, layout.piping.cake.length]}
          visible={false}
          frustumCulled={false}
        />
        <instancedMesh
          ref={(el) => {
            piping.current.slice = el;
            sliceRef(el);
          }}
          args={[g.shell, m.piping, layout.piping.slice.length]}
          visible={false}
          frustumCulled={false}
        />

        <mesh ref={slot(bands, 0)} geometry={g.band[0]} material={m.satin} visible={false} />
        <mesh ref={slot(bands, 1, true)} geometry={g.band[1]} material={m.satin} visible={false} />
        <group ref={bow} position={[0, RIBBON.y + RIBBON.height / 2, RIBBON.radius + 0.03]} visible={false}>
          <mesh geometry={g.bow} material={m.satin} />
        </group>

        {/* No Suspense of its own: the scene waits for the font too, so the warm-up compiles,
            uploads and rehearses the letters with everything else (Letters.tsx) */}
        <Inscription material={m.gold} />

        <instancedMesh
          ref={(el) => {
            leaf.current.cake = el;
          }}
          args={[g.leaf, m.leaf, layout.leaf.cake.length]}
          visible={false}
          frustumCulled={false}
        />
        <instancedMesh
          ref={(el) => {
            leaf.current.slice = el;
            sliceRef(el);
          }}
          args={[g.leaf, m.leaf, layout.leaf.slice.length]}
          visible={false}
          frustumCulled={false}
        />

        <instancedMesh ref={florets} args={[g.floret, m.floret, layout.flowers.florets.length]} visible={false} frustumCulled={false} />
        <instancedMesh ref={stems} args={[g.stemBit, m.stem, layout.flowers.stems.length]} visible={false} frustumCulled={false} />

        {/* The cut: two faces on the cake, two on the slice (shown once the slice starts to move) */}
        <mesh ref={slot(cuts, 0)} geometry={g.cuts.cakeStart} material={m.inside} visible={false} />
        <mesh ref={slot(cuts, 1)} geometry={g.cuts.cakeEnd} material={m.inside} visible={false} />
        <mesh ref={slot(cuts, 2, true)} geometry={g.cuts.sliceStart} material={m.inside} visible={false} />
        <mesh ref={slot(cuts, 3, true)} geometry={g.cuts.sliceEnd} material={m.inside} visible={false} />
      </group>
    </group>
  );
}
