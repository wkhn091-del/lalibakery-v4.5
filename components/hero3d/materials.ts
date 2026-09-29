import * as THREE from "three";
import { keepShared } from "./shared";

type Shader = THREE.WebGLProgramParametersWithUniforms;
type Patch = (shader: Shader) => void;

// ─── Subsurface scattering, the fast way ─────────────────────────────────────────────
// The real-time approximation from games (Barré-Brisebois & Bouchard, GDC 2011): light arriving
// from behind a surface bleeds through it, tinted. Cream, frosting and sponge get a soft inner
// glow under the rim light: the thing that separates food from plastic.
const SSS_UNIFORMS = /* glsl */ `
uniform vec3 uSssColor;
uniform float uSssScale;
uniform float uSssPower;
uniform float uSssDistortion;
uniform float uSssAmbient;
`;
const SSS_LIGHT = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
    reflectedLight.directDiffuse += material.diffuseColor * directionalLights[ i ].color * uSssColor * ( uSssAmbient + uSssScale * pow( saturate( dot( geometryViewDir, -normalize( directionalLights[ i ].direction + geometryNormal * uSssDistortion ) ) ), uSssPower ) );
  }
  #pragma unroll_loop_end
#endif
`;
export type Subsurface = { color?: string; scale?: number; power?: number; distortion?: number; ambient?: number };

function subsurfacePatch({ color = "#ffffff", scale = 0.6, power = 3, distortion = 0.3, ambient = 0.05 }: Subsurface): Patch {
  const uniforms = {
    uSssColor: { value: new THREE.Color(color) },
    uSssScale: { value: scale },
    uSssPower: { value: power },
    uSssDistortion: { value: distortion },
    uSssAmbient: { value: ambient },
  };
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SSS_UNIFORMS}`)
      .replace("#include <lights_fragment_begin>", `#include <lights_fragment_begin>\n${SSS_LIGHT}`);
  };
}

// ─── Soft terminator: light wrapping round the form, warmed ─────────────────────────────
// In cream, light scatters under the surface, so the edge between lit and shadowed is soft and
// warm instead of hard. This adds light only in that band (where the surface turns away from the
// light), tinted; highlights are untouched. Hooked into three's direct light for physical materials.
const WRAP_ANCHOR = "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );";
export type Wrap = { amount?: number; tint?: string };

function wrapPatch({ amount = 0.5, tint = "#ffb98a" }: Wrap): Patch {
  const uniforms = { uWrap: { value: amount }, uWrapTint: { value: new THREE.Color(tint) } };
  return (shader) => {
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (!chunk.includes(WRAP_ANCHOR)) return; // a three.js update moved it: skip rather than break
    Object.assign(shader.uniforms, uniforms);
    const wrapped = chunk.replace(
      WRAP_ANCHOR,
      `${WRAP_ANCHOR}
      {
        float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + uWrap ) / ( 1.0 + uWrap ) );
        reflectedLight.directDiffuse += max( wrapNL - dotNL, 0.0 ) * directLight.color * uWrapTint * BRDF_Lambert( material.diffuseColor );
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uWrap;\nuniform vec3 uWrapTint;")
      .replace("#include <lights_physical_pars_fragment>", wrapped);
  };
}

// ─── Reveal: the buttercream coat rising up the cake, then the top filling in ─────────────
// In the mesh's own coordinates (y = 0 at the bottom of the coat). The rising edge is wavy, like
// cream being smoothed round by a scraper; the flat top then fills from the rim inward.
export type RevealUniforms = {
  uRise: { value: number };
  uTop: { value: number };
  uHeight: { value: number }; // the highest point (the lip of the crown)
  uTopY: { value: number }; // the flat top
  uTopRadius: { value: number }; // where the flat top begins, inside the crown
};

function revealPatch(uniforms: RevealUniforms): Patch {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRevealPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRevealPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vRevealPos;\nuniform float uRise;\nuniform float uTop;\nuniform float uHeight;\nuniform float uTopY;\nuniform float uTopRadius;",
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        float revealAngle = atan(vRevealPos.x, vRevealPos.z);
        float revealEdge = uRise * (uHeight + 0.09) - 0.045 + 0.03 * sin(revealAngle * 3.0 + uRise * 9.0) + 0.015 * sin(revealAngle * 8.0 - uRise * 4.0);
        if (vRevealPos.y > revealEdge) discard;
        if (vRevealPos.y > uTopY - 0.004 && length(vRevealPos.xz) < uTopRadius * (1.0 - uTop)) discard;`,
      );
  };
}

/**
 * Gives a material any combination of shader extras, composed in one onBeforeCompile:
 *   subsurface  light bleeding through from behind
 *   wrap        the soft, warm edge between light and shadow
 *   reveal      the buttercream coat rising
 * Call once, before the material's first render.
 */
export function patchMaterial<M extends THREE.Material>(material: M, { subsurface, wrap, reveal }: { subsurface?: Subsurface; wrap?: Wrap; reveal?: RevealUniforms } = {}): M {
  const patches: Patch[] = [];
  if (reveal) patches.push(revealPatch(reveal));
  if (wrap) patches.push(wrapPatch(wrap));
  if (subsurface) patches.push(subsurfacePatch(subsurface));
  const key = `lali:${subsurface ? "sss" : "-"}:${wrap ? "wrap" : "-"}:${reveal ? "reveal" : "-"}`;
  material.onBeforeCompile = (shader) => patches.forEach((patch) => patch(shader));
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}

// Every food material is MeshPhysicalMaterial. Phones keep it, without the features that cost a
// whole extra render (transmission) or a second specular layer (clearcoat, anisotropy).
const COSTLY = ["transmission", "thickness", "attenuationColor", "attenuationDistance", "clearcoat", "clearcoatRoughness", "anisotropy", "anisotropyRotation"] as const;
export function physical(params: THREE.MeshPhysicalMaterialParameters, lite: boolean): THREE.MeshPhysicalMaterial {
  if (!lite) return new THREE.MeshPhysicalMaterial(params);
  const rest: THREE.MeshPhysicalMaterialParameters = { ...params };
  for (const key of COSTLY) delete rest[key];
  return new THREE.MeshPhysicalMaterial(rest);
}

// ─── Micro-surface (Version 7) ───────────────────────────────────────────────────────
// A tiling normal map of soft, irregular bumps: sugar-shell pores on the macarons. Generated once
// in the browser, shared by every material that wants it.
let micro: THREE.DataTexture | null = null;
export function microSurfaceTexture(): THREE.DataTexture {
  if (micro) return micro;
  const N = 256;
  const height = new Float32Array(N * N);
  // a few octaves of smooth value noise that tiles (the lattice wraps at the edges)
  const lattice = (size: number, seed: number) => {
    const g = new Float32Array(size * size);
    for (let i = 0; i < g.length; i++) {
      const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      g[i] = x - Math.floor(x);
    }
    return g;
  };
  const octaves: [number, number][] = [
    [8, 0.55],
    [16, 0.28],
    [32, 0.12],
    [64, 0.05],
  ];
  octaves.forEach(([size, amp], o) => {
    const g = lattice(size, o + 1);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * size;
        const fy = (y / N) * size;
        const x0 = Math.floor(fx) % size;
        const y0 = Math.floor(fy) % size;
        const x1 = (x0 + 1) % size;
        const y1 = (y0 + 1) % size;
        const tx = fx - Math.floor(fx);
        const ty = fy - Math.floor(fy);
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = g[y0 * size + x0] + (g[y0 * size + x1] - g[y0 * size + x0]) * sx;
        const b = g[y1 * size + x0] + (g[y1 * size + x1] - g[y1 * size + x0]) * sx;
        height[y * N + x] += (a + (b - a) * sy) * amp;
      }
    }
  });
  const data = new Uint8Array(N * N * 4);
  const h = (xx: number, yy: number) => height[((yy + N) % N) * N + ((xx + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 3;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  micro = new THREE.DataTexture(data, N, N);
  micro.wrapS = micro.wrapT = THREE.RepeatWrapping;
  micro.generateMipmaps = true;
  micro.minFilter = THREE.LinearMipmapLinearFilter;
  micro.magFilter = THREE.LinearFilter;
  micro.anisotropy = 4;
  micro.needsUpdate = true;
  keepShared(micro); // made once for the page's life: released with the scene (shared.ts)
  return micro;
}
