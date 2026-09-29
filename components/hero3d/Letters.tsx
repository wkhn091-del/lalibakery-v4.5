import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { COAT_R } from "./cakeParts";
import { ASSETS, INSCRIPTION } from "./config";
import { hero3d, inscriptionStore } from "./store";
import { clamp01, easeOutBack, smootherstep, STAGES } from "./timeline";

const LETTER_HEIGHT = 0.155; // a letter without ascender or descender (ב), in scene units
const RADIUS = COAT_R + 0.003; // where the letters' backs sit on the frosting
const MIDLINE = 0.44; // height of the letters' centre line on the cake's side
const EACH = 0.035; // how much of the progress one letter takes to arrive

// The font is fetched with the scene's textures rather than after them: the letters sit inside the
// cake, which only renders once its textures are in. The scene (and its warm-up) waits for the
// letters too, so they're compiled, uploaded and rehearsed with everything else, not first drawn
// mid-scroll.
if (typeof window !== "undefined") useLoader.preload(FontLoader, ASSETS.font);

type Letter = { geometry: THREE.BufferGeometry; angle: number; order: number };

/**
 * The inscription in gold, in Noto Serif Hebrew (the site's display face), one letter at a time.
 * Hebrew reads right to left, so the letters are laid out from the right; each is extruded with a
 * soft bevel and bent round the cake so it sits flush on the frosting. (drei's Text3D still passes
 * the extrusion as `height`, which three.js now ignores in favour of `depth`, defaulting to 50
 * units: so the geometry is built here directly.)
 */
export default function Letters({ text, material }: { text: string; material: THREE.Material }) {
  const font = useLoader(FontLoader, ASSETS.font);

  const letters = useMemo(() => {
    const options = { font, depth: 0.026, curveSegments: 7, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.005, bevelSegments: 3 };
    // size so that a plain letter (ב) stands LETTER_HEIGHT tall
    const probe = new TextGeometry("ב", { ...options, size: 1, bevelEnabled: false });
    probe.computeBoundingBox();
    const size = LETTER_HEIGHT / (probe.boundingBox!.max.y - probe.boundingBox!.min.y);
    probe.dispose();
    const scale = size / font.data.resolution;

    const visual = [...text].reverse(); // left to right on screen
    const advance = (ch: string) => (font.data.glyphs[ch]?.ha ?? font.data.glyphs[" "]?.ha ?? 300) * scale * 1.03;
    const total = visual.reduce((sum, ch) => sum + advance(ch), 0);
    const count = visual.filter((ch) => ch.trim()).length;

    const out: Letter[] = [];
    let run = -total / 2;
    let seen = 0;
    for (const ch of visual) {
      const width = advance(ch);
      const centre = run + width / 2;
      run += width;
      if (!ch.trim()) continue;
      const geometry = new TextGeometry(ch, { ...options, size });
      geometry.translate(-width / 2 / 1.03, -LETTER_HEIGHT / 2, 0); // centred on its advance, midline at 0
      // bend round the cake: x becomes an angle on the cylinder, z a distance out from it
      const pos = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const a = x / RADIUS;
        pos.setXYZ(i, Math.sin(a) * (RADIUS + z), pos.getY(i), Math.cos(a) * (RADIUS + z) - RADIUS);
      }
      geometry.computeVertexNormals();
      out.push({ geometry, angle: centre / RADIUS, order: count - 1 - seen });
      seen++;
    }
    return out;
  }, [font, text]);

  useEffect(() => () => letters.forEach((l) => l.geometry.dispose()), [letters]);

  const groups = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    // one after another through the letters' step; nothing allocated per frame
    const a = STAGES.letters[0];
    const n = letters.length;
    const gap = n > 1 ? (STAGES.letters[1] - a - EACH) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const letter = letters[i];
      const group = groups.current[i];
      if (!group) continue;
      const t = clamp01((hero3d.progress - (a + letter.order * gap)) / EACH);
      group.visible = t > 0;
      group.scale.setScalar(Math.max(0.001, easeOutBack(t, 2)));
      group.rotation.y = letter.angle + (1 - smootherstep(t)) * 1.2;
      group.position.y = MIDLINE + (1 - smootherstep(t)) * 0.18;
    }
  });

  return (
    <>
      {letters.map((letter, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el;
          }}
          position={[Math.sin(letter.angle) * RADIUS, MIDLINE, Math.cos(letter.angle) * RADIUS]}
          rotation={[0, letter.angle, 0]}
          visible={false}
        >
          <mesh geometry={letter.geometry} material={material} castShadow receiveShadow />
        </group>
      ))}
    </>
  );
}

/**
 * The inscription the page set (store.ts: "דף הבית" in the CMS). A new one, typed in the Studio's
 * preview, redraws these letters alone: nothing else in the scene renders again.
 */
export function Inscription({ material }: { material: THREE.Material }) {
  const text = useSyncExternalStore(inscriptionStore.subscribe, inscriptionStore.get, () => INSCRIPTION);
  return <Letters text={text} material={material} />;
}
