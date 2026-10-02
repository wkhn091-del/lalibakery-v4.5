/*
  Fills a new dataset with the site's current content, once:
    - every text on the site: "הגדרות כלליות", "דף הבית", "דף הזמנת עוגה" (content.ts, as the
      Studio's forms lay them out: schemaTypes/site/spec.ts)
    - the bases, the creams, the fillings and the four cake types with their sizes (the cake builder's built-in catalog)
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
import { ADDONS, ADDON_SEEDS, addonId } from "../addons";
import { categoryId, type CategoryKey } from "../categories";
import { LEGAL_PAGES, legalId } from "../legal";
import { STORE_SETTINGS_ID } from "../store";
import { SITE_DOCS, stored } from "../schemaTypes/site/spec";
import { BUILT_IN_CATALOG } from "../../lib/order/model";

const DRY_RUN = process.argv.includes("--dry-run");
const STUDIO_DIR = process.env.SANITY_BASE_PATH || process.cwd();
const PUBLIC_DIR = resolve(STUDIO_DIR, "..", "public");

type Doc = { _id: string; _type: string } & Record<string, unknown>;
type Upload = { file: string; alt: string };

/* ───────── bases, creams and fillings: the builder's own built-in catalog (lib/order/model.ts) ───────── */

const toneValue = (tone: string | [string, string]) => (Array.isArray(tone) ? tone.join(",") : tone);
const BUILT_IN_CATEGORY = new Map(BUILT_IN_CATALOG.categories.map((c) => [c.id, c]));
const FLAVOURS = [...new Map(BUILT_IN_CATALOG.categories.flatMap((c) => c.bases.map((b) => [b.id, b] as const))).values()];
const CREAMS = BUILT_IN_CATALOG.creams;
const FILLINGS = BUILT_IN_CATALOG.fillings ?? [];

const flavourId = (key: string) => `flavour-${key}`;
const creamId = (key: string) => `cream-${key}`;
const fillingId = (key: string) => `filling-${key}`;
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

/* ───────── the shop ───────── */

const he = (text: string) => ({ he: text });

// From the client's questionnaire: Netanya ₪20 (free over ₪100), the towns around it ₪50. Delivery
// windows and the opening days aren't known yet: the owner fills them in before launch.
const STORE_SETTINGS: Doc = {
  _id: STORE_SETTINGS_ID,
  _type: "storeSettings",
  dailyCapacity: 5,
  leadBusinessDays: 3,
  maxAdvanceDays: 90,
  pickupEnabled: true,
  pickupNote: he("האיסוף מתואם בוואטסאפ, והכתובת נשלחת אחרי ההזמנה."),
  deliveryZones: [
    { _key: "netanya", _type: "deliveryZone", name: he("נתניה"), fee: 20, freeAbove: 100, cities: ["נתניה"] },
    {
      _key: "netanya-area",
      _type: "deliveryZone",
      name: he("סביבת נתניה"),
      fee: 50,
      cities: ["אבן יהודה", "כפר יונה", "קדימה-צורן", "פרדסיה", "תל מונד", "אביחיל", "בית יצחק", "כפר נטר", "אודים", "פולג"],
    },
  ],
  launchPromo: { enabled: false },
  catalogCancellationDays: 3,
};

function shopDocs(): Doc[] {
  const addons = ADDONS.map(({ key, title }): Doc => {
    const s = ADDON_SEEDS[key];
    return {
      _id: addonId(key),
      _type: "builderAddon",
      title: he(title),
      description: he(s.description),
      available: true,
      categories: s.categories,
      ...(s.options ? { options: s.options.map((label, i) => ({ _key: `o${i + 1}`, _type: "addonOption", label: he(label) })) } : {}),
      colorable: !!s.colorable,
      ...(s.text ? { textMax: s.text } : {}),
      ...(s.quantity ? { quantity: { min: s.quantity[0], max: s.quantity[1] } } : {}),
      imageByWhatsapp: !!s.imageByWhatsapp,
    };
  });
  // the legal pages start with their titles only: their text is written before launch
  const legal = LEGAL_PAGES.map(({ key, title }): Doc => ({ _id: legalId(key), _type: "legalPage", title: he(title) }));
  return [STORE_SETTINGS, ...addons, ...legal];
}

/* ───────── building the documents ───────── */

type Planned = { doc: Doc; image?: Upload & { field: string } };

function plan(): Planned[] {
  const out: Planned[] = [];
  for (const spec of SITE_DOCS) out.push({ doc: { _id: spec.id, _type: spec.name, ...stored(spec, BUILT_IN[spec.name]) } });
  for (const b of FLAVOURS)
    out.push({ doc: { _id: flavourId(b.id), _type: "flavour", name: b.label, note: b.note, tone: toneValue(b.tone), ...(b.group ? { group: b.group } : {}), ...(b.contains ? { contains: b.contains } : {}) } });
  for (const [list, type, id] of [[CREAMS, "cream", creamId], [FILLINGS, "filling", fillingId]] as const)
    for (const c of list)
      out.push({ doc: { _id: id(c.id), _type: type, name: c.label, tone: toneValue(c.tone), contains: c.contains, parve: !!c.parve, ...(c.group ? { group: c.group } : {}) } });
  for (const doc of shopDocs()) out.push({ doc });

  for (const c of CATEGORY_SEEDS) {
    const builtIn = BUILT_IN_CATEGORY.get(c.key)!;
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
        bases: refs(builtIn.bases.map((b) => flavourId(b.id))),
        creams: refs(builtIn.creams.map(creamId)),
        ...(builtIn.fillings?.length ? { fillings: refs(builtIn.fillings.map(fillingId)) } : {}),
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
