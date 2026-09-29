/*
  Fills a new dataset with the site's current content, once:
    - every text on the site: "הגדרות כלליות", "דף הבית", "דף הזמנת עוגה" (content.ts, as the
      Studio's forms lay them out: schemaTypes/site/spec.ts)
    - the bases, the creams and the four cake types with their sizes (the cake builder's built-in catalog)
    - the homepage gallery's cakes with their photos (content.ts and public/images)
  From then on the Studio is where it all lives, and the site reads it from there.

  Safe to run again: it only creates what's missing. Whatever already exists stays exactly as the
  owner left it (nothing is overwritten or deleted).

    npm run seed            from studio/, after `npx sanity login`
    npm run seed:preview    prints what it would create, writes nothing

  Prices aren't seeded (the site had none): the owner adds them in the Studio, and until then the
  site shows no prices, as before.
*/
import { createReadStream, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { LexoRank } from "lexorank";
import { getCliClient } from "sanity/cli";
import { CAKE_PAGE, GALLERY, HOME, SETTINGS } from "../../content";
import { categoryId, type CategoryKey } from "../categories";
import { SITE_DOCS, stored } from "../schemaTypes/site/spec";
import type { Tone } from "../tones";

const DRY_RUN = process.argv.includes("--dry-run");
const STUDIO_DIR = process.env.SANITY_BASE_PATH || process.cwd();
const PUBLIC_DIR = resolve(STUDIO_DIR, "..", "public");

type Doc = { _id: string; _type: string } & Record<string, unknown>;
type Upload = { file: string; alt: string };

/* ───────── the palette (studio/tones.ts) ───────── */

const T = {
  vanilla: "#EFD9A8",
  cream: "#F5E9CF",
  white: "#FBF5EA",
  chocolate: "#5C3B2C",
  darkChocolate: "#3F2519",
  caramel: "#C68A4C",
  red: "#9A2E36",
  lemon: "#F0DC86",
  pistachio: "#B5BF86",
  berries: "#B45872",
  biscuit: "#C48A57",
  sable: "#E4C28C",
  marble: "#EFD9A8,#5C3B2C",
} as const satisfies Record<string, Tone>;

/* ───────── bases and creams ───────── */

const FLAVOURS: [key: string, name: string, note: string, tone: Tone][] = [
  ["vanilla", "וניל", "ספוג וניל רך ואוורירי", T.vanilla],
  ["chocolate", "שוקולד", "ספוג שוקולד עשיר", T.chocolate],
  ["red-velvet", "רד וולווט", "ספוג קטיפתי בגוון אדום עמוק", T.red],
  ["lemon", "לימון", "ספוג לימון רענן", T.lemon],
  ["marble", "שיש", "וניל ושוקולד, מעורבלים", T.marble],
  ["fudge", "פאדג' שוקולד", "שוקולד דחוס ולח", T.darkChocolate],
  ["sable-vanilla", "בצק פריך וניל", "שתי שכבות פריכות בצורת הספרה", T.sable],
  ["sable-chocolate", "בצק פריך שוקולד", "פריך, עם קקאו", T.chocolate],
  ["sponge-vanilla", "ספוג וניל", "גרסה רכה של עוגת המספרים", T.vanilla],
];

type Allergen = "dairy" | "nuts" | "gluten";
const CREAMS: [key: string, name: string, tone: Tone, contains: Allergen[], parve: boolean][] = [
  ["vanilla", "וניל", T.cream, ["dairy"], true],
  ["chocolate", "גנאש שוקולד", T.chocolate, ["dairy"], true],
  ["cream-cheese", "קרם גבינה", T.white, ["dairy"], false],
  ["mascarpone", "מסקרפונה", T.cream, ["dairy"], false],
  ["white-chocolate", "שוקולד לבן", T.cream, ["dairy"], false],
  ["salted-caramel", "קרמל מלוח", T.caramel, ["dairy"], false],
  ["pistachio", "פיסטוק", T.pistachio, ["dairy", "nuts"], false],
  ["berries", "פירות יער", T.berries, ["dairy"], true],
  ["lotus", "לוטוס", T.biscuit, ["dairy", "gluten"], false],
];

const flavourId = (key: string) => `flavour-${key}`;
const creamId = (key: string) => `cream-${key}`;
const refs = (ids: string[]) => ids.map((id) => ({ _key: id, _type: "reference", _ref: id }));

/* ───────── the four cake types ───────── */

type SizeSeed = {
  key: string;
  label: string;
  detail?: string;
  servings: [number, number];
  shape?: "round" | "tiers" | "tray" | "cupcakes";
  diameter?: number;
  tray?: [width: number, length: number];
};
type CategorySeed = {
  key: CategoryKey;
  title: string;
  blurb: string;
  image?: Upload;
  sizes: SizeSeed[];
  bases: string[];
  creams: string[];
};

const CATEGORY_SEEDS: CategorySeed[] = [
  {
    key: "number",
    title: "עוגות מספרים",
    blurb: "ספרה או אות בשתי קומות, עם קרם ועיטורים",
    sizes: [
      { key: "regular", label: "גודל רגיל", detail: "כ-30 ס״מ לכל ספרה", servings: [12, 15] },
      { key: "large", label: "גודל גדול", detail: "כ-40 ס״מ לכל ספרה", servings: [20, 25] },
    ],
    bases: ["sable-vanilla", "sable-chocolate", "sponge-vanilla"],
    creams: ["cream-cheese", "mascarpone", "white-chocolate", "chocolate", "pistachio"],
  },
  {
    key: "designer",
    title: "עוגות מעוצבות",
    blurb: "עוגה גבוהה בעיצוב אישי, לכל אירוע",
    image: { file: "/images/closing.jpg", alt: "עוגת וינטג' לבנה עם סרטים שחורים" },
    sizes: [
      { key: "d16", label: "קוטר 16 ס״מ", servings: [8, 10], shape: "round", diameter: 16 },
      { key: "d20", label: "קוטר 20 ס״מ", servings: [14, 18], shape: "round", diameter: 20 },
      { key: "d24", label: "קוטר 24 ס״מ", servings: [22, 28], shape: "round", diameter: 24 },
      { key: "tiers", label: "שתי קומות", detail: "16 ו-24 ס״מ", servings: [35, 45], shape: "tiers" },
    ],
    bases: ["vanilla", "chocolate", "red-velvet", "lemon", "marble"],
    creams: ["vanilla", "chocolate", "salted-caramel", "pistachio", "berries", "cream-cheese", "lotus"],
  },
  {
    key: "birthday",
    title: "עוגות יום הולדת מעוצבות",
    blurb: "השם, הגיל והעיצוב שבחרתם",
    image: { file: "/images/deliverables.jpg", alt: "עוגה לבנה עם גיל ושם בזהב, ופרחים לבנים סביבה" },
    sizes: [
      { key: "d18", label: "קוטר 18 ס״מ", servings: [10, 12], shape: "round", diameter: 18 },
      { key: "d22", label: "קוטר 22 ס״מ", servings: [16, 20], shape: "round", diameter: 22 },
      { key: "d26", label: "קוטר 26 ס״מ", servings: [25, 30], shape: "round", diameter: 26 },
    ],
    bases: ["vanilla", "chocolate", "marble", "fudge"],
    creams: ["vanilla", "chocolate", "salted-caramel", "berries", "lotus", "cream-cheese"],
  },
  {
    key: "kindergarten",
    title: "עוגות גן",
    blurb: "מגש חתוך למנות אישיות, לחגיגה בגן",
    sizes: [
      { key: "tray-s", label: "מגש 20 על 30 ס״מ", servings: [20, 24], shape: "tray", tray: [20, 30] },
      { key: "tray-l", label: "מגש 30 על 40 ס״מ", servings: [35, 40], shape: "tray", tray: [30, 40] },
      { key: "cupcakes", label: "30 קאפקייקס", detail: "לכל ילד אחד משלו", servings: [30, 30], shape: "cupcakes" },
    ],
    bases: ["vanilla", "chocolate", "marble"],
    creams: ["vanilla", "chocolate", "berries"],
  },
];

/* ───────── the gallery ───────── */

// which cake type each gallery photo shows (a first guess: the owner can change it in the Studio)
const GALLERY_CATEGORY: Record<string, CategoryKey> = {
  "/images/proof-01.jpg": "birthday",
  "/images/proof-02.jpg": "birthday",
  "/images/proof-03.jpg": "designer",
  "/images/proof-04.jpg": "birthday",
  "/images/proof-05.jpg": "designer",
  "/images/proof-06.jpg": "birthday",
  "/images/proof-07.jpg": "birthday",
};

/** "רחל, 50. וינטג' עם סרטי סאטן ופנינים" → name "רחל, 50", description "וינטג' עם סרטי סאטן ופנינים" */
function splitCaption(caption: string) {
  const at = caption.indexOf(". ");
  return at < 0 ? { name: caption } : { name: caption.slice(0, at), description: caption.slice(at + 2) };
}

/* ───────── the site's texts ───────── */

const BUILT_IN: Record<string, unknown> = { siteSettings: SETTINGS, homePage: HOME, cakePage: CAKE_PAGE };

/* ───────── building the documents ───────── */

type Planned = { doc: Doc; image?: Upload & { field: string } };

function plan(): Planned[] {
  const out: Planned[] = [];
  for (const spec of SITE_DOCS) out.push({ doc: { _id: spec.id, _type: spec.name, ...stored(spec, BUILT_IN[spec.name]) } });
  for (const [key, name, note, tone] of FLAVOURS) out.push({ doc: { _id: flavourId(key), _type: "flavour", name, note, tone } });
  for (const [key, name, tone, contains, parve] of CREAMS) out.push({ doc: { _id: creamId(key), _type: "cream", name, tone, contains, parve } });

  for (const c of CATEGORY_SEEDS) {
    const sizes = c.sizes.map((s) => ({
      _key: s.key,
      _type: "cakeSize",
      label: s.label,
      ...(s.detail ? { detail: s.detail } : {}),
      servingsMin: s.servings[0],
      servingsMax: s.servings[1],
      ...(s.shape ? { shape: s.shape } : {}),
      ...(s.diameter ? { diameter: s.diameter } : {}),
      ...(s.tray ? { trayWidth: s.tray[0], trayLength: s.tray[1] } : {}),
    }));
    out.push({
      doc: {
        _id: categoryId(c.key),
        _type: "category",
        title: c.title,
        blurb: c.blurb,
        sizes,
        bases: refs(c.bases.map(flavourId)),
        creams: refs(c.creams.map(creamId)),
      },
      image: c.image && { ...c.image, field: "image" },
    });
  }

  // the gallery, in the site's order (the first cake gets the lowest rank)
  let rank = LexoRank.middle();
  GALLERY.forEach((item, i) => {
    rank = rank.genNext().genNext();
    out.push({
      doc: {
        _id: `cake-${String(i + 1).padStart(2, "0")}`,
        _type: "cake",
        orderRank: rank.toString(),
        ...splitCaption(item.caption),
        category: { _type: "reference", _ref: categoryId(GALLERY_CATEGORY[item.src] ?? "designer") },
        featured: true,
      },
      image: { file: item.src, alt: item.alt, field: "image" },
    });
  });
  return out;
}

/* ───────── writing them ───────── */

async function main() {
  const planned = plan();

  // check every photo is there before writing anything
  const pathOf = (file: string) => resolve(PUBLIC_DIR, file.replace(/^\//, ""));
  const missing = planned.flatMap(({ image }) => (image && !existsSync(pathOf(image.file)) ? [pathOf(image.file)] : []));
  if (missing.length) throw new Error(`These photos are missing:\n  ${missing.join("\n  ")}`);

  if (DRY_RUN) {
    for (const { doc, image } of planned) console.log(JSON.stringify(image ? { ...doc, [image.field]: `<upload ${image.file}>` } : doc));
    console.log(`\n${planned.length} documents and ${planned.filter((p) => p.image).length} photos would be created (dry run, nothing was written).`);
    return;
  }

  const client = getCliClient({ apiVersion: "2025-09-01", useCdn: false });
  const { projectId, dataset } = client.config();
  const existing = new Set(await client.fetch<string[]>(`*[_id in $ids]._id`, { ids: planned.map((p) => p.doc._id) }));
  const todo = planned.filter((p) => !existing.has(p.doc._id));
  console.log(`Seeding ${projectId}/${dataset}: ${todo.length} to create, ${existing.size} already there (left as they are).`);
  if (!todo.length) return;

  const transaction = client.transaction();
  for (const { doc, image } of todo) {
    if (image) {
      const asset = await client.assets.upload("image", createReadStream(pathOf(image.file)), { filename: basename(image.file) });
      doc[image.field] = { _type: "image", asset: { _type: "reference", _ref: asset._id }, alt: image.alt };
      console.log(`  uploaded ${image.file}`);
    }
    transaction.createIfNotExists(doc);
  }
  await transaction.commit();
  console.log(`Done: ${todo.length} created. Open the Studio to check the gallery's cake types and add prices, and fill in the texts marked [TODO].`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
