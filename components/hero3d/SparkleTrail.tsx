import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { PLATE_TOP } from "./cakeParts";
import { sceneClock } from "./clock";
import { hero3d } from "./store";
import { stage, STAGES } from "./timeline";

// A trail of warm light circling the finished cake: a bright head with a long fading tail (drawn
// additively, so the bloom picks it up), and gold sparkles in the air round it.
export default function SparkleTrail() {
  const ring = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(a) * 1.62, Math.sin(a * 2) * 0.05, Math.cos(a) * 1.62));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 400, 0.011, 6, true);
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uHead: { value: 0 }, uFade: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uHead; uniform float uFade; varying vec2 vUv;
          void main() {
            float behind = fract(uHead - vUv.x);            // 0 at the head, growing along the tail
            float tail = pow(1.0 - behind, 5.0);
            float head = pow(1.0 - behind, 60.0);
            vec3 colour = mix(vec3(1.0, 0.78, 0.45), vec3(1.0, 0.97, 0.9), head);
            gl_FragColor = vec4(colour * (tail * 1.6 + head * 3.0), (tail + head) * uFade);
          }`,
      }),
    [],
  );
  // made here, not by JSX, so R3F won't free them: freed with the trail
  useEffect(
    () => () => {
      ring.dispose();
      material.dispose();
    },
    [ring, material],
  );
  const group = useRef<THREE.Group>(null);
  const sparkles = useRef<THREE.Points>(null);
  const still = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useFrame(() => {
    const fade = stage(hero3d.progress, STAGES.sparkle) * (1 - stage(hero3d.progress, STAGES.slice));
    material.uniforms.uFade.value = fade;
    // the head circles on the display's own clock (clock.ts), so it glides evenly; reduced motion: a still trail
    material.uniforms.uHead.value = still ? 0.3 : (sceneClock.time * 0.22) % 1;
    if (group.current) group.current.visible = fade > 0;
    const opacity = (sparkles.current?.material as THREE.ShaderMaterial | undefined)?.uniforms?.opacity;
    if (opacity) opacity.value = fade;
  });
  return (
    <group ref={group} position={[0, PLATE_TOP + 0.52, 0]} rotation={[0.2, 0, 0.12]} visible={false}>
      <mesh geometry={ring} material={material} frustumCulled={false} />
      <Sparkles ref={sparkles} count={70} scale={[3.6, 1.6, 3.6]} size={2.4} speed={still ? 0 : 0.25} color="#ffe2a0" noise={0.6} />
    </group>
  );
}
