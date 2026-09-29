import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BACKDROP, VIGNETTE } from "./config";
import { GLOW } from "./framing";

// A painted studio sweep: warm cocoa where the light falls behind the cake, deepening to ganache
// at the edges, a soft pool of light on the floor round the stand, the lens vignette, and a fine
// grain so the gradients never band. One full-screen pair of triangles, drawn first, with no depth.
//
// It shows in its designed colours (config.ts) on every tier. Where the effect composer grades the
// frame (vignette, then neutral tone mapping, which would turn this cocoa to rust), it's handed the
// colour the grading turns back into the design. So phones and desktops show the same studio, and
// the CSS background that stands in for it while the scene loads (globals.css) matches it.
const GLOW_AT = new THREE.Vector3(0, GLOW.y, 0);
const STAND_BASE = new THREE.Vector3(0, 0, 0);

export default function Backdrop({ graded }: { graded: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        defines: graded ? { GRADED: "" } : {},
        uniforms: {
          uGlow: { value: new THREE.Vector2(0.5, 0.5) },
          uFloor: { value: new THREE.Vector2(0.5, 0.2) },
          uAspect: { value: 1 },
          uCentre: { value: new THREE.Color(BACKDROP.centre) },
          uEdge: { value: new THREE.Color(BACKDROP.edge) },
          uPool: { value: new THREE.Color(BACKDROP.floor) },
          uVignette: { value: new THREE.Vector2(VIGNETTE.offset, VIGNETTE.darkness) },
        },
        // mid-depth rather than exactly on the far plane, so it can never be clipped (drawn first, with
        // no depth test or write: nothing else changes)
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec2 uGlow; uniform vec2 uFloor; uniform float uAspect; uniform vec2 uVignette;
          uniform vec3 uCentre; uniform vec3 uEdge; uniform vec3 uPool; varying vec2 vUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main() {
            vec2 d = (vUv - uGlow) * vec2(uAspect, 1.0);
            float t = smoothstep(0.0, 1.25, length(d));
            vec3 c = mix(uCentre, uEdge, t);
            // the floor: a wide, flat ellipse of light where the stand stands
            vec2 f = (vUv - uFloor) * vec2(uAspect * 0.55, 2.6);
            c = mix(c, uPool, exp(-dot(f, f) * 3.0) * 0.42 * (1.0 - smoothstep(uFloor.y - 0.02, uFloor.y + 0.22, vUv.y)));
            // the lens vignette, as postprocessing's VignetteEffect draws it
            float vignette = smoothstep(0.8, uVignette.x * 0.799, distance(vUv, vec2(0.5)) * (uVignette.y + uVignette.x));
            c *= vignette;
            #ifdef GRADED
              // The composer will vignette this frame and then tone-map it (neutral: for tones this
              // dark, it subtracts an offset set by the smallest channel). Hand it the colour those
              // two turn back into c.
              float m = min(c.r, min(c.g, c.b));
              float x = m < 0.04 ? sqrt(m / 6.25) : m + 0.04;
              c = (c + (x - m)) / vignette;
            #endif
            c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [graded],
  );
  // made here, not by JSX, so R3F won't free it: freed with the backdrop
  useEffect(() => () => material.dispose(), [material]);
  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    // the camera has already moved this frame (CameraRig runs first)
    projected.copy(GLOW_AT).project(camera);
    material.uniforms.uGlow.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5 + GLOW.lift);
    projected.copy(STAND_BASE).project(camera);
    material.uniforms.uFloor.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
    material.uniforms.uAspect.value = size.width / size.height;
  });
  return (
    <mesh renderOrder={-1000} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
