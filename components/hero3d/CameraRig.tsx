import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sceneClock } from "./clock";
import { framing, SCENE_REACH, shotAt, shotDistance } from "./framing";
import { hero3d } from "./store";

// The camera's journey is a list of shots (framing.ts); here it glides between them as the page
// scrolls, and frames the cake in the free region the page measured. It moves first every frame
// (priority −1, before every part at 0), and its world matrix is brought up to date there and then,
// not at the render: everything placed against the camera this frame (the sweets drifting past the
// lens, the pointer's path through the swarm, the backdrop's glow, the lens's focus) reads where it
// is now. Placed against last frame's camera, they wobbled as the scroll sped up or slowed down.

// Critically damped spring toward a target (smooth, never overshoots); no allocations per frame
function spring(current: THREE.Vector3, target: THREE.Vector3, velocity: THREE.Vector3, smoothTime: number, dt: number, change: THREE.Vector3, temp: THREE.Vector3) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  change.subVectors(current, target);
  temp.copy(velocity).addScaledVector(change, omega).multiplyScalar(dt);
  velocity.addScaledVector(temp, -omega).multiplyScalar(decay);
  current.copy(target).add(change.add(temp).multiplyScalar(decay));
}

export default function CameraRig() {
  const s = useMemo(
    () => ({
      target: new THREE.Vector3(),
      look: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      camLook: new THREE.Vector3(),
      vPos: new THREE.Vector3(),
      vLook: new THREE.Vector3(),
      change: new THREE.Vector3(),
      temp: new THREE.Vector3(),
      frame: new THREE.Vector2(),
      shot: framing(),
      placed: false,
      still: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    }),
    [],
  );

  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera;
    const dt = Math.min(sceneClock.dt, 1 / 20); // the display's own step (clock.ts): an even glide

    // the shot for this moment, and how far back to stand to fit the cake into the free region
    // (fractions of the hero); the lens shift below puts it there
    const shot = shotAt(hero3d.progress, s.shot);
    const az = THREE.MathUtils.degToRad(shot.az);
    const el = THREE.MathUtils.degToRad(shot.el);
    const R = hero3d.region;
    const distance = shotDistance(R, size.width / size.height, shot.halfH, shot.halfW, shot.zoom);

    s.look.set(shot.look[0], shot.halfH + shot.look[1], shot.look[2]);
    s.target.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(distance).add(s.look);
    // a touch of parallax with the pointer (desktops), in proportion to the distance
    s.target.x += hero3d.pointer.x * 0.04 * distance;
    s.target.y += hero3d.pointer.y * 0.02 * distance;

    // jump instead of gliding: the very first frame, reduced motion, and a cut (the warm-up's)
    const snap = !s.placed || s.still || hero3d.cut || (window as unknown as { __heroSnap?: boolean }).__heroSnap;
    s.frame.set(R.x + R.w / 2 - 0.5, 0.5 - (R.y + R.h / 2));
    if (snap) {
      s.camPos.copy(s.target);
      s.camLook.copy(s.look);
      s.vPos.set(0, 0, 0);
      s.vLook.set(0, 0, 0);
      hero3d.frame.x = s.frame.x;
      hero3d.frame.y = s.frame.y;
      s.placed = true;
      hero3d.cut = false;
    } else {
      spring(s.camPos, s.target, s.vPos, 0.45, dt, s.change, s.temp);
      spring(s.camLook, s.look, s.vLook, 0.45, dt, s.change, s.temp);
      const ease = 1 - Math.exp(-dt * 5);
      hero3d.frame.x += (s.frame.x - hero3d.frame.x) * ease;
      hero3d.frame.y += (s.frame.y - hero3d.frame.y) * ease;
    }

    // The far plane always reaches past everything round the cake, wherever the framing puts the
    // camera (with MAX_DISTANCE it stays at 60; this guards any future change to that cap)
    cam.far = Math.max(60, s.camPos.distanceTo(s.camLook) + SCENE_REACH);
    // Version 7's lens shift: the subject sits at (0.5 + frame.x, 0.5 − frame.y) of the screen.
    // (setViewOffset also rebuilds the projection matrix, with the far plane above.)
    cam.setViewOffset(size.width, size.height, -hero3d.frame.x * size.width, hero3d.frame.y * size.height, size.width, size.height);
    cam.position.copy(s.camPos);
    cam.lookAt(s.camLook);
    cam.updateMatrixWorld(); // (and its inverse): this frame's camera for everything after it
    hero3d.focus.x = s.camLook.x;
    hero3d.focus.y = s.camLook.y;
    hero3d.focus.z = s.camLook.z;
  }, -1);
  return null;
}
