import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, useEnvironment } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import * as Sentry from "@sentry/nextjs";
import { type CakeSpec, extentOf } from "@/lib/order/preview";
import Cake from "./Cake";
import { HDRI } from "./config";

const FOV = 30;
/** the camera looks down at the cake from about 34°, so what's on top shows */
const VIEW = new THREE.Vector3(0, 0.68, 1).normalize();

/**
 * The live 3D cake in the builder. Loaded only where WebGL 2 runs (BuilderPreview.tsx), drawn only
 * while it's on screen; with reduced motion it doesn't turn by itself and new pieces appear without
 * growing in. Its studio light is the hero's (the same HDRI, served from this site).
 */
export default function BuilderScene({ spec, active, still }: { spec: CakeSpec; active: boolean; still: boolean }) {
  // a lost graphics context leaves the backdrop showing; when the browser gives it back, a fresh canvas
  const [generation, setGeneration] = useState(0);
  return (
    <Canvas
      key={generation}
      dpr={[1, 1.75]}
      frameloop={!active ? "never" : still ? "demand" : "always"}
      camera={{ fov: FOV, near: 0.1, far: 60, position: VIEW.clone().multiplyScalar(7).toArray() }}
      gl={{ antialias: true, alpha: true, powerPreference: "default", stencil: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
        const canvas = gl.domElement;
        // the 3D library forces the context lost on a canvas it's letting go of: not a loss to act on
        canvas.addEventListener("webglcontextlost", (e) => {
          if (!canvas.isConnected) return;
          e.preventDefault();
          Sentry.captureMessage("builder3d: graphics context lost", { level: "warning", tags: { area: "builder3d" } });
        });
        canvas.addEventListener("webglcontextrestored", () => canvas.isConnected && setGeneration((g) => g + 1));
      }}
    >
      <Studio />
      <Rig spec={spec} still={still} />
      <Cake spec={spec} still={still} />
    </Canvas>
  );
}

const SOFTBOXES = (
  <>
    <Lightformer form="rect" intensity={1.1} color="#fff6ee" position={[0, 5.5, 1]} scale={[6, 3.5, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={1.25} color="#fff0e4" position={[4.5, 1.8, 3.5]} scale={[1.4, 4.5, 1]} target={[0, 1, 0]} />
    <Lightformer form="rect" intensity={0.9} color="#ffe3d8" position={[-4.5, 2.2, -2.5]} scale={[1.2, 4.5, 1]} target={[0, 1, 0]} />
    <Lightformer form="rect" intensity={1.1} color="#fff4e6" position={[0, 1.1, 7]} scale={[13, 5, 1]} target={[0, 1, 0]} />
  </>
);
const ENV_ROTATION: [number, number, number] = [0, THREE.MathUtils.degToRad(35), 0];

function Studio() {
  // the loader keeps the HDRI cached for the next visit; the GPU copy goes with this canvas
  const photographed = useEnvironment({ files: HDRI });
  useEffect(() => () => photographed.dispose(), [photographed]);
  return (
    <>
      <Environment files={HDRI} resolution={256} environmentIntensity={0.75} environmentRotation={ENV_ROTATION}>
        {SOFTBOXES}
      </Environment>
      <directionalLight position={[3.5, 5, 4]} intensity={1.2} color="#fff3ec" />
      <directionalLight position={[-3, 2.5, -4]} intensity={0.6} color="#ffd9c7" />
    </>
  );
}

/** Frames the whole cake, whatever its size, easing to a new framing when the cake changes; drag to turn it */
function Rig({ spec, still }: { spec: CakeSpec; still: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const [turning, setTurning] = useState(!still);

  const tall = spec.addons.some((a) => a.key === "topper" || a.key === "candles") ? 0.55 : spec.addons.some((a) => a.key === "flowers" || a.key === "sugarFigure") ? 0.3 : 0.1;
  const { radius, height } = extentOf(spec.shape);
  const goal = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const vfov = THREE.MathUtils.degToRad(FOV);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const top = height + tall;
    // the board reaches past the cake; seen from above, its depth shrinks and its height shows
    const across = radius + 0.3;
    const sphere = Math.hypot(across, top / 2) * 1.12;
    const distance = sphere / Math.sin(Math.min(vfov, hfov) / 2);
    return { distance, target: new THREE.Vector3(0, top * 0.36, 0) };
  }, [radius, height, tall, size.width, size.height]);

  const offset = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => invalidate(), [goal, invalidate]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const k = still ? 1 : 1 - Math.exp(-dt * 5);
    const target = c.target;
    const far = target.distanceTo(goal.target) > 0.001 || Math.abs(camera.position.distanceTo(target) - goal.distance) > 0.001;
    if (!far) return;
    offset.copy(camera.position).sub(target);
    const length = THREE.MathUtils.lerp(offset.length(), goal.distance, k);
    target.lerp(goal.target, k);
    camera.position.copy(target).add(offset.setLength(length));
    c.update();
    if (still) invalidate();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableZoom={false}
      enablePan={false}
      enableDamping={!still}
      autoRotate={turning}
      autoRotateSpeed={0.9}
      minPolarAngle={0.55}
      maxPolarAngle={1.42}
      onStart={() => setTurning(false)}
    />
  );
}
