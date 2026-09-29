"use client";
import { type RefObject, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, useEnvironment } from "@react-three/drei";
import * as Sentry from "@sentry/nextjs";
import * as THREE from "three";
import Backdrop from "./Backdrop";
import CakeAssembly from "./CakeAssembly";
import CameraRig from "./CameraRig";
import { sceneClock, tickSceneClock } from "./clock";
import { type Tier, TIERS } from "./config";
import Effects from "./Effects";
import { FOV } from "./framing";
import FloatingSweets from "./FloatingSweets";
import { keepShared, releaseShared } from "./shared";
import SparkleTrail from "./SparkleTrail";
import { hero3d, markHero3DReady, type Region } from "./store";
import { STAGES } from "./timeline";

// Hooks for browser tests; they do nothing unless set
declare global {
  interface Window {
    __heroQuality?: Tier; // force a tier
    __heroProgress?: number; // pin a moment of the assembly, 0–1
    __heroSnap?: boolean; // the camera jumps instead of gliding
    __heroCheckShaders?: boolean; // report shader compile errors in a production build
    __heroStats?: { tier: Tier; dpr: number; calls: number; triangles: number; programs: number; progress: number; region: Region; frame: { x: number; y: number }; geometries: number; textures: number };
    __heroFrame?: { calls: number; triangles: number };
    __heroLost?: boolean;
    __heroPrograms?: () => string[];
  }
}

// The headline's own reveal (Hero.tsx) comes first: the warm-up's heavy rehearsal frames wait for
// it. It starts as the hero mounts, with the page's first load or on a return to the page, and
// takes about a second and a half.
const QUIET_AFTER_MS = 2000; // never before this long after the page began loading (as before)
const REVEAL_MS = 1500; // nor before this long after the hero mounted

function detectTier(): Tier {
  if (window.__heroQuality) return window.__heroQuality;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = Math.min(window.screen.width, window.screen.height) < 820;
  if (coarse || narrow) return "low";
  return (navigator.hardwareConcurrency || 4) >= 8 ? "high" : "medium";
}

type Props = {
  /** The hero's sticky stage: the scene draws only while it's on screen */
  stage: RefObject<HTMLElement | null>;
  /** The scene can't carry on (its graphics context is gone for good): the hero goes back to its photo */
  onFail: () => void;
  /** When the hero mounted (performance.now()): its headline's reveal started then */
  heroMountedAt: number;
};

/**
 * One cake assembling itself as the page scrolls, Version 7's sweets drifting round it. Before it's
 * shown it warms up off screen (WarmUp, below): every shader compiled, then the whole assembly
 * rehearsed once, so the first scroll is as smooth as the second, on the first visit and on every
 * return to the page. Then it fades in over the studio-coloured background, and stops drawing
 * whenever the hero is off screen. HeroCanvas.tsx loads it, only where WebGL 2 runs, and keeps
 * hero3d.region (where the cake has room) measured.
 */
export default function HeroScene({ stage, onFail, heroMountedAt }: Props) {
  const [tier, setTier] = useState<Tier>(detectTier);
  const cfg = TIERS[tier];
  // the tier's resolution, or the screen's own where that's lower
  const top = useMemo(() => Math.min(cfg.dpr, window.devicePixelRatio || 1), [cfg.dpr]);
  const [dpr, setDpr] = useState(top); // lowered by Resolution (below) on a device that can't keep up
  useEffect(() => setDpr((d) => Math.min(d, top)), [top]); // a lighter tier caps the resolution too
  const [warm, setWarm] = useState(false); // compiled and rehearsed: the canvas may draw for real
  const [visible, setVisible] = useState(true);
  const [shown, setShown] = useState(false); // this canvas has drawn its first real frames: fade it in
  const showing = useRef(false); // the same, for the warm-up to read (a rehearsal must never be seen)
  const [lost, setLost] = useState(false);
  const [generation, setGeneration] = useState(0); // a restored graphics context gets a fresh canvas
  const [quietAt] = useState(() => Math.max(QUIET_AFTER_MS, heroMountedAt + REVEAL_MS)); // when the rehearsal may start
  const leaving = useRef(false); // the scene is going for good (not a canvas swapped after a lost context)
  const onWarm = useCallback(() => setWarm(true), []);
  const onShown = useCallback(() => {
    showing.current = true;
    setShown(true);
    markHero3DReady();
  }, []);
  const running = warm && visible && !lost;
  // Drawing again after a pause (the hero back on screen): the clock starts a new count, so the
  // first frame back doesn't jump the motion forward by the time it was away. Before that frame.
  useLayoutEffect(() => {
    if (running) sceneClock.last = -1;
  }, [running]);
  // The resources that outlive a canvas (shared.ts) let go of it once the scene has left it for
  // good (the Driver, as it goes: nothing can draw them after that). And on arrival, in case a
  // canvas from an earlier visit still holds on to them.
  useLayoutEffect(() => {
    leaving.current = false;
    releaseShared();
    return () => {
      leaving.current = true;
    };
  }, []);
  // a context that stays lost: after a few seconds, the photo instead (one brought back sooner
  // gets a fresh canvas: see onCreated)
  useEffect(() => {
    if (!lost) return;
    const t = setTimeout(() => {
      Sentry.captureMessage("hero3d: graphics context lost for good, showing the photo", { level: "error", tags: { area: "hero3d" } });
      onFail();
    }, 3000);
    return () => clearTimeout(t);
  }, [lost, onFail]);
  // every report carries the device tier (Sentry, once configured)
  useEffect(() => {
    Sentry.setTag("hero3d.tier", tier);
  }, [tier]);

  // draw only while the hero is on screen
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      hero3d.visible = entry.isIntersecting;
      setVisible(entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [stage]);

  // desktops: the camera leans a little toward the pointer, and the sweets part round it
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    const onMove = (e: PointerEvent) => {
      hero3d.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      hero3d.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // The scene, made once per tier. What changes out here (the hero scrolling out of view and back,
  // the resolution, the fade-in) re-renders the canvas alone, never the scene inside it. A render
  // of the scene has drei's <Environment> photograph its studio again, and three.js rebuild the
  // lighting from that (PMREM) on the next frame: a hitch just as the hero scrolls back into view.
  const scene = useMemo(
    () => (
      <>
        <Driver onShown={onShown} leaving={leaving} />
        <Resolution max={top} onChange={setDpr} />
        <Backdrop graded={cfg.effects} />
        <Suspense fallback={null}>
          <Studio hdri={cfg.hdri} shadows={cfg.shadows} />
          <CakeAssembly lite={cfg.lite} />
          <FloatingSweets quality={cfg.sweets} />
          <SparkleTrail />
          <Ground contact={cfg.ao} />
          <WarmUp onDone={onWarm} offscreen={cfg.effects} shown={showing} quietAt={quietAt} />
        </Suspense>
        <CameraRig />
        {cfg.effects && <Effects ao={cfg.ao} />}
        <Stats tier={tier} />
      </>
    ),
    [cfg, tier, top, onWarm, onShown, quietAt],
  );

  return (
    <div className="hero-3d" data-ready={shown && !lost ? "" : undefined} aria-hidden="true">
      <Canvas
        key={generation}
        dpr={dpr}
        shadows={cfg.shadows > 0 ? "percentage" : false}
        frameloop={running ? "always" : "never"}
        camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 3.2, 8] }}
        gl={{ antialias: !cfg.effects, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production" || !!window.__heroCheckShaders; // production: no waiting on shader status
          gl.transmissionResolutionScale = 0.5; // the buttercream's translucency, sampled at half resolution
          gl.info.autoReset = false; // counted per frame across every effect pass (the Driver resets it)
          gl.toneMapping = cfg.effects ? THREE.NoToneMapping : THREE.NeutralToneMapping; // with effects, the composer tone-maps
          // If the browser drops the graphics context, step aside: the background and the words carry
          // on. Only for the canvas still on the page: when a canvas is replaced (a restored context
          // gets a fresh one) or unmounted, the 3D library lets go of it by forcing its context lost,
          // about half a second later, and that isn't a loss to act on.
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e) => {
            if (!canvas.isConnected) return;
            e.preventDefault(); // tells the browser we'd like it back
            console.warn("[hero3d] graphics context lost");
            Sentry.captureMessage("hero3d: graphics context lost", { level: "warning", tags: { area: "hero3d" } });
            window.__heroLost = true;
            setLost(true);
          });
          canvas.addEventListener("webglcontextrestored", () => {
            if (!canvas.isConnected) return;
            console.warn("[hero3d] graphics context restored");
            window.__heroLost = false;
            // start again one tier lighter, so a device that ran out of room doesn't lose it twice
            setTier((t) => (t === "high" ? "medium" : "low"));
            setWarm(false);
            setGeneration((g) => g + 1);
            setLost(false);
          });
        }}
      >
        {scene}
      </Canvas>
    </div>
  );
}

// First in every frame: steps the scene's clock (clock.ts), counts the last frame's draws for the
// stats, and once the warm-up is over, reveals the canvas after its first two real frames. (The
// assembly's progress itself is written by the GSAP ScrollTrigger scrub in Hero.tsx.)
function Driver({ onShown, leaving }: { onShown: () => void; leaving: RefObject<boolean> }) {
  const state = useMemo(() => ({ frames: 0, counts: { calls: 0, triangles: 0 } }), []);
  useEffect(() => {
    window.__heroFrame = state.counts; // one object, updated in place every frame
    return () => {
      // the scene has left this canvas (so nothing can draw them again): if it's going for good,
      // the resources that outlive the canvas let go of its renderer now (shared.ts)
      if (leaving.current) releaseShared();
    };
  }, [state, leaving]);
  useFrame(({ gl }, delta) => {
    tickSceneClock(delta);
    // the frame just finished, every pass counted; then this frame's count starts from zero
    state.counts.calls = gl.info.render.calls;
    state.counts.triangles = gl.info.render.triangles;
    gl.info.reset();
    if (!sceneClock.live) return; // the warm-up's rehearsal is off screen: it doesn't count
    if (state.frames < 2 && ++state.frames === 2) onShown();
    if (window.__heroProgress != null) hero3d.progress = window.__heroProgress; // test hook: pin a moment
  }, -2);
  return null;
}

// ─── The resolution ─────────────────────────────────────────────────────────────────────────
// Every tier starts at its own resolution (2× on capable desktops, never past the screen's), and
// keeps it unless the device can't hold the frame rate: then it steps down a quarter at a time,
// and back up once there's headroom again. A change resizes every buffer in the pipeline, and that
// frame is a hitch, so it waits for the page to come to rest (the assembly's progress still for
// half a second): it never lands mid-scroll. A resolution the device has twice failed to hold
// isn't tried again, so it can't seesaw. Measured on real frames only (the warm-up's rehearsal
// would read as a slow device), on the display's own clock, and the same on every refresh rate:
// a 144 Hz screen showing 70 frames a second is doing fine.
const SLOW_FPS = 40; // a second below this counts against the resolution…
const SLOW_SECONDS = 2; // …and this many in a row step it down
const FAST_FPS = 55; // a second at or above this counts toward a step back up…
const FAST_SECONDS = 8; // …after this many in a row
const REST_SECONDS = 0.5; // how long the progress holds still before a change is made
const slot = (dpr: number) => Math.min(8, Math.round(dpr * 4)); // a resolution's place in `failed`

function Resolution({ max, onChange }: { max: number; onChange: (dpr: number) => void }) {
  const gl = useThree((s) => s.gl);
  const s = useMemo(() => ({ frames: 0, time: 0, slow: 0, fast: 0, settle: 1, want: 0, rest: 0, progress: Number.NaN, failed: new Uint8Array(9) }), []);
  useFrame(() => {
    if (!sceneClock.live) return;
    const dt = sceneClock.dt;
    if (hero3d.progress !== s.progress) {
      s.progress = hero3d.progress;
      s.rest = 0;
    } else s.rest += dt;
    const dpr = gl.getPixelRatio();

    // a change waiting for the page to come to rest
    if (s.want) {
      if (s.rest < REST_SECONDS) return;
      if (s.want < dpr) s.failed[slot(dpr)]++;
      onChange(s.want);
      s.want = 0;
      s.frames = s.time = s.slow = s.fast = 0;
      s.settle = 2; // the resize, and the second straight after it, aren't a fair measure
      return;
    }

    if (sceneClock.gap) {
      s.frames = s.time = 0; // a pause (the hero was off screen): start the count again
      return;
    }
    s.frames++;
    s.time += dt;
    if (s.time < 1) return;
    const fps = s.frames / s.time;
    s.frames = s.time = 0;
    if (s.settle > 0) {
      s.settle--;
      return;
    }
    if (fps < SLOW_FPS) {
      s.fast = 0;
      if (++s.slow >= SLOW_SECONDS && dpr > 1) {
        s.slow = 0;
        s.want = Math.max(1, dpr - 0.25);
      }
    } else if (fps >= FAST_FPS && dpr < max) {
      s.slow = 0;
      const up = Math.min(max, dpr + 0.25);
      if (++s.fast >= FAST_SECONDS && s.failed[slot(up)] < 2) {
        s.fast = 0;
        s.want = up;
      }
    } else s.slow = s.fast = 0;
  }, -1);
  return null;
}

// Every moment the warm-up rehearses: the middle of each step of the assembly (timeline.ts), so
// every part is drawn once in its real state. Change the timeline and this follows.
const REHEARSAL = [...new Set(Object.values(STAGES).map(([a, b]) => (a + b) / 2))].sort((a, b) => a - b);

/**
 * Gets every first-time cost out of the way while the canvas is still invisible, so the first
 * scroll through the assembly is as smooth as the second.
 *
 * 1. Every shader program compiles, in parallel where the browser can (KHR_parallel_shader_compile).
 *    With effects on, against an off-screen buffer like the composer's: a program compiled for the
 *    screen wouldn't match it (colour space and tone mapping are built in).
 * 2. Then the whole assembly is rehearsed: one real frame at the middle of every step, through the
 *    real pipeline (shadow map, the buttercream's transmission pass, the effect composer, contact
 *    shadows). Compiling a program isn't the whole cost: the graphics driver finishes each one for
 *    the exact buffers it draws into (multisampled, half-float) on its first real draw, and that's
 *    also when geometry and textures upload. A draw into a stand-in buffer doesn't count, which is
 *    why a plain precompile (gl.compile, drei's <Preload>) still leaves a stutter on the first
 *    scroll. One frame per animation frame, so the page never freezes; the scroll's own progress
 *    is put back after each one.
 *
 * Then the camera cuts back to where the page really is, and the canvas starts drawing for real.
 * Every new canvas starts with nothing compiled or uploaded, so a return to the page (from
 * /custom-cake, say) rehearses again, hidden like the first visit, once the headline's reveal is
 * over (`quietAt`). Only a canvas already on show (one brought back after its graphics context was
 * lost) just compiles: a rehearsal would play on screen.
 */
function WarmUp({ onDone, offscreen, shown, quietAt }: { onDone: () => void; offscreen: boolean; shown: RefObject<boolean>; quietAt: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    const rehearse = !shown.current;
    sceneClock.live = false; // until it's done, frames are rehearsals
    let over = false; // finished, or unmounted
    let raf = 0;
    let wait = 0;
    let i = 0;
    // A frame run by hand reads the clock twice, in two different units (R3F's frameloop="never"
    // mode): restarting the clock's last tick at "now" keeps every step exactly 1/60 s long, and
    // hands the first real frame a normal step too. (A step running backwards would unwind the
    // sweets' own time.)
    const tick = () => (clock.oldTime = performance.now());
    const finish = () => {
      if (over) return;
      over = true;
      hero3d.cut = true; // the first visible frame goes straight to the real shot
      tick();
      sceneClock.last = -1; // the first real frame takes a normal step, not one from the rehearsal
      sceneClock.live = true;
      onDone();
    };
    const step = () => {
      if (over) return;
      const real = hero3d.progress; // the scroll's own value
      try {
        hero3d.progress = REHEARSAL[i];
        hero3d.cut = true; // each rehearsed moment in its own shot, not a glide between them
        tick();
        advance(clock.elapsedTime + 1 / 60); // a whole frame: every useFrame, then the render
      } catch (error) {
        console.warn("[hero3d] warm-up cut short", error);
        i = REHEARSAL.length;
      } finally {
        hero3d.progress = real;
      }
      if (++i < REHEARSAL.length) raf = requestAnimationFrame(step);
      else finish();
    };

    const target = offscreen ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }) : null;
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    const compiling = gl.compileAsync(scene, camera); // its synchronous part runs now, against `target`
    gl.setRenderTarget(previous);
    let started = false;
    const start = () => {
      if (started || over) return;
      started = true;
      target?.dispose();
      if (!rehearse) return finish();
      wait = window.setTimeout(() => (raf = requestAnimationFrame(step)), Math.max(0, quietAt - performance.now()));
    };
    compiling.catch(() => {}).then(start);
    const stalled = window.setTimeout(start, 4000); // a driver that never reports back: carry on regardless

    return () => {
      over = true;
      if (!started) target?.dispose();
      cancelAnimationFrame(raf);
      clearTimeout(wait);
      clearTimeout(stalled);
    };
  }, [gl, scene, camera, advance, clock, onDone, offscreen, shown, quietAt]);
  return null;
}

// Studio light, as in Version 7: its three softboxes painted into the environment (the crisp
// rectangles that give chocolate, gold and buttercream their highlights), turned 35°; a warm key
// light casting the soft shadows (framed on the cake and the sweets round it); a rim light from
// behind for the cream's glow; no flat fill: the contrast is what makes food look fresh. The HDRI
// is the photographed studio behind drei's preset="studio" (Poly Haven's studio_small_03, CC0),
// served from this site instead of a third-party CDN. One more softbox sits behind the camera, so
// gold facing the viewer mirrors light rather than a dark corner of the room.
//
// The softboxes are made once, here: <Environment> photographs its studio again (and three.js
// rebuilds the lighting from it) whenever its children change, so they never do.
const ENV_ROTATION: [number, number, number] = [0, THREE.MathUtils.degToRad(35), 0];
const SOFTBOXES = (
  <>
    <Lightformer form="rect" intensity={1.05} color="#fff6ee" position={[0, 5.5, 1]} scale={[6, 3.5, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={1.25} color="#fff0e4" position={[4.5, 1.8, 3.5]} scale={[1.4, 4.5, 1]} target={[0, 1, 0]} />
    <Lightformer form="rect" intensity={0.9} color="#ffe3d8" position={[-4.5, 2.2, -2.5]} scale={[1.2, 4.5, 1]} target={[0, 1, 0]} />
    <Lightformer form="rect" intensity={1.1} color="#fff4e6" position={[0, 1.1, 7]} scale={[13, 5, 1]} target={[0, 1, 0]} />
  </>
);

function Studio({ hdri, shadows }: { hdri: string; shadows: number }) {
  // the HDRI <Environment> loads (the same cached texture): it outlives the canvas (shared.ts)
  const photographed = useEnvironment({ files: hdri });
  useEffect(() => keepShared(photographed), [photographed]);
  return (
    <>
      <Environment files={hdri} resolution={256} environmentIntensity={0.7} environmentRotation={ENV_ROTATION}>
        {SOFTBOXES}
      </Environment>
      <directionalLight
        castShadow={shadows > 0}
        position={[3.5, 5, 4]}
        intensity={1.3}
        color="#fff3ec"
        shadow-mapSize={[shadows || 512, shadows || 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={6}
        shadow-camera-left={-2.6}
        shadow-camera-right={2.6}
        shadow-camera-top={3.4}
        shadow-camera-bottom={-1.4}
        shadow-camera-near={1}
        shadow-camera-far={15}
      />
      <directionalLight position={[-3, 2.5, -4]} intensity={1.35} color="#ffd6bf" />
    </>
  );
}

// The floor under the stand: capable desktops get Version 7's live contact shadows (the swarm's
// shadows pass over them); elsewhere the same softness is painted once, and freed with the floor.
function paintedShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(28, 14, 10, 0.62)");
  grad.addColorStop(0.45, "rgba(28, 14, 10, 0.28)");
  grad.addColorStop(1, "rgba(28, 14, 10, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function Ground({ contact }: { contact: boolean }) {
  const texture = useMemo(() => (contact ? null : paintedShadow()), [contact]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return <ContactShadows position={[0, 0.002, 0]} opacity={0.42} blur={3} far={1.2} scale={5} color="#1c0e0a" resolution={512} />;
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.002} renderOrder={-1}>
      <planeGeometry args={[3.4, 3.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

// For browser tests: draw calls, triangles and shader programs, twice a second
function Stats({ tier }: { tier: Tier }) {
  const gl = useThree((s) => s.gl);
  const state = useMemo(() => ({ t: 0 }), []);
  useEffect(() => {
    // name, a short hash of the full program key, and the key's first parameters (to tell programs apart)
    const hash = (text: string) => {
      let h = 0;
      for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36);
    };
    const programs = () => (gl.info.programs ?? []).map((p) => `${p.name} #${hash(p.cacheKey)} ${p.cacheKey.slice(0, 160)}`);
    window.__heroPrograms = programs;
    // let go when the scene does: the hook would otherwise keep this renderer, and everything it
    // ever uploaded, alive after the visitor has moved on to another page
    return () => {
      if (window.__heroPrograms === programs) delete window.__heroPrograms;
    };
  }, [gl]);
  useFrame((_, delta) => {
    state.t += delta;
    if (state.t < 0.5) return;
    state.t = 0;
    window.__heroStats = {
      tier,
      dpr: gl.getPixelRatio(),
      calls: window.__heroFrame?.calls ?? 0,
      triangles: window.__heroFrame?.triangles ?? 0,
      programs: gl.info.programs?.length ?? 0,
      progress: Number(hero3d.progress.toFixed(3)),
      region: { ...hero3d.region },
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      frame: { ...hero3d.frame },
    };
  });
  return null;
}
