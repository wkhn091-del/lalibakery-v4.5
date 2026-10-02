// Settings for the 3D hero, in one place.

/** The inscription on the cake, in gold letters (Hebrew letters and spaces), until the page sets
 *  its own (content.ts, "דף הבית" in the CMS: store.ts) */
export const INSCRIPTION = "מזל טוב";

const BASE = "/3d";
export const ASSETS = {
  font: `${BASE}/fonts/noto-serif-hebrew-bold.typeface.json`,
  hdri: { full: `${BASE}/hdri/studio_small_03_1k.hdr`, light: `${BASE}/hdri/studio_small_03_512.hdr` },
  textures: {
    crumbColor: `${BASE}/textures/crumb-color.webp`,
    crumbNormal: `${BASE}/textures/crumb-normal.webp`,
    crustColor: `${BASE}/textures/crust-color.webp`,
    crustNormal: `${BASE}/textures/crust-normal.webp`,
    crustHeight: `${BASE}/textures/crust-height.webp`,
    creamNormal: `${BASE}/textures/cream-normal.webp`,
    satinNormal: `${BASE}/textures/satin-normal.webp`,
    insideColor: `${BASE}/textures/inside-color.webp`,
    insideNormal: `${BASE}/textures/inside-normal.webp`,
    insideHeight: `${BASE}/textures/inside-height.webp`,
  },
} as const;

/** The studio backdrop behind the cake: pale powder pink where the light falls, deeper rose at the edges.
 *  These are the colours on screen, on every tier. (The loading background in globals.css paints
 *  the same studio until the first frame: change them together.) */
export const BACKDROP = { centre: "#f4e0df", edge: "#d6b1b1", floor: "#c49697" } as const;

/** The lens vignette (Effects.tsx); the backdrop carries the same one on the tiers without effects */
export const VIGNETTE = { offset: 0.32, darkness: 0.3 } as const;

/**
 * Device tiers. Phones: physical materials without the costly extras (transmission, clearcoat,
 * anisotropy), fewer sweets, no shadow maps or post-processing, at most 1.5× resolution. Desktops:
 * soft shadows, depth of field and bloom; capable desktops add ambient occlusion, live contact
 * shadows, sharper shadows, the full-size HDRI and 2× resolution. Each tier keeps its resolution
 * unless the device can't hold the frame rate; then it steps down, only while the page is at rest
 * (Resolution, in HeroScene.tsx).
 */
export type Tier = "low" | "medium" | "high";
export const TIERS = {
  low: { dpr: 1.5, sweets: "low", effects: false, ao: false, shadows: 0, hdri: ASSETS.hdri.light, lite: true },
  medium: { dpr: 1.5, sweets: "high", effects: true, ao: false, shadows: 1024, hdri: ASSETS.hdri.light, lite: false },
  high: { dpr: 2, sweets: "high", effects: true, ao: true, shadows: 2048, hdri: ASSETS.hdri.full, lite: false },
} as const satisfies Record<Tier, { dpr: number; sweets: "low" | "high"; effects: boolean; ao: boolean; shadows: number; hdri: string; lite: boolean }>;
