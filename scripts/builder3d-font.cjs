/*
 * Builds public/3d/fonts/noto-serif-builder.typeface.json for the cake builder's 3D preview:
 * the hero's Hebrew glyphs plus digits, Latin, Cyrillic and a little punctuation from Noto Serif Bold.
 *
 * opentype.js is a one-off tool, not a project dependency:
 *   mkdir %TEMP%\font3d && cd %TEMP%\font3d && npm i opentype.js@1.3.4
 *   set NODE_PATH=%TEMP%\font3d\node_modules && node scripts/builder3d-font.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const opentype = require("opentype.js");

const SOURCE = "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSerif/hinted/ttf/NotoSerif-Bold.ttf";
const ROOT = path.join(__dirname, "..", "public", "3d", "fonts");
const HEBREW = path.join(ROOT, "noto-serif-hebrew-bold.typeface.json");
const OUT = path.join(ROOT, "noto-serif-builder.typeface.json");

const range = (a, b) => Array.from({ length: b.charCodeAt(0) - a.charCodeAt(0) + 1 }, (_, i) => String.fromCharCode(a.charCodeAt(0) + i));
const CHARS = [...range("0", "9"), ...range("A", "Z"), ...range("a", "z"), ...range("А", "я"), "Ё", "ё", ...".,!?'\"-&+:♥"];

const r = (n) => Math.round(n * 10) / 10;

function outline(glyph) {
  const out = [];
  for (const c of glyph.path.commands) {
    if (c.type === "M") out.push("m", r(c.x), r(c.y));
    else if (c.type === "L") out.push("l", r(c.x), r(c.y));
    else if (c.type === "Q") out.push("q", r(c.x), r(c.y), r(c.x1), r(c.y1));
    else if (c.type === "C") out.push("b", r(c.x), r(c.y), r(c.x1), r(c.y1), r(c.x2), r(c.y2));
  }
  return out.join(" ");
}

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const font = opentype.parse(await res.arrayBuffer());
  if (font.unitsPerEm !== 1000) throw new Error(`unexpected unitsPerEm ${font.unitsPerEm}`);

  const hebrew = JSON.parse(fs.readFileSync(HEBREW, "utf8"));
  const glyphs = { ...hebrew.glyphs };
  for (const ch of CHARS) {
    const g = font.charToGlyph(ch);
    if (!g || g.index === 0) continue;
    const bb = g.getBoundingBox();
    glyphs[ch] = { ha: Math.round(g.advanceWidth), x_min: Math.round(bb.x1), x_max: Math.round(bb.x2), o: outline(g) };
  }

  const out = {
    ...hebrew,
    glyphs,
    familyName: "Noto Serif Builder",
    original_font_information: {
      ...hebrew.original_font_information,
      fontFamily: "Noto Serif Hebrew + Noto Serif",
      source: `${hebrew.original_font_information.source}; digits, Latin and Cyrillic from ${SOURCE}`,
    },
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`${Object.keys(glyphs).length} glyphs, ${fs.statSync(OUT).size} bytes -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
