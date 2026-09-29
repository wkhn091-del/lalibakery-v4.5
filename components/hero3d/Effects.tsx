import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { type DepthOfFieldEffect, type EffectComposer as EffectComposerImpl, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { VIGNETTE } from "./config";
import { keepShared } from "./shared";
import { hero3d } from "./store";

// The ambient occlusion draws all its passes on one full-screen triangle that n8ao keeps for the
// page's life, and its pass never frees it: so it's released with the scene instead (shared.ts),
// or every canvas that drew it would stay in memory
type AoPass = { copyQuad?: { _mesh?: { geometry?: THREE.BufferGeometry } } };
function keepAoTriangle(pass: unknown) {
  const triangle = (pass as AoPass | null)?.copyQuad?._mesh?.geometry;
  if (triangle) keepShared(triangle);
}

/**
 * The lens: ambient occlusion on capable desktops (the deep, soft darkening where the layers
 * meet, under the bow, round the letters and the piping), a subtle depth of field focused on the
 * cake (the sweets near it stay crisp; only the far background and the pieces passing close to the
 * lens soften), bloom on true highlights only, a soft vignette, and neutral tone mapping (true
 * food colours).
 */
export default function Effects({ ao }: { ao: boolean }) {
  const composer = useRef<EffectComposerImpl>(null);
  const dof = useRef<DepthOfFieldEffect>(null);
  const s = useMemo(() => ({ focus: new THREE.Vector3(), size: new THREE.Vector2(), dpr: 0 }), []);
  useFrame(({ gl }) => {
    // A new resolution (HeroScene's Resolution) resizes the canvas, but the composer only follows
    // the canvas's size on the page, not its pixel ratio: it would carry on rendering (and paying
    // for) the resolution it started with, stretched onto the canvas. So it follows the ratio here.
    const c = composer.current;
    if (c) {
      const dpr = gl.getPixelRatio();
      if (s.dpr && dpr !== s.dpr) c.setSize(gl.getSize(s.size).x, s.size.y);
      s.dpr = dpr;
    }
    if (!dof.current) return;
    s.focus.set(hero3d.focus.x, hero3d.focus.y, hero3d.focus.z);
    dof.current.target = s.focus;
  });
  return (
    <EffectComposer ref={composer} multisampling={4}>
      {ao ? <N8AO ref={keepAoTriangle} aoRadius={0.35} distanceFalloff={0.6} intensity={1.4} quality="medium" halfRes /> : <></>}
      <DepthOfField ref={dof} worldFocusDistance={5} worldFocusRange={2.8} bokehScale={1.5} resolutionScale={0.75} />
      {/* only true glints bloom (gold, gloss, the light trail): white buttercream never glows */}
      <Bloom mipmapBlur intensity={0.38} luminanceThreshold={1.25} luminanceSmoothing={0.2} />
      <Vignette offset={VIGNETTE.offset} darkness={VIGNETTE.darkness} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
