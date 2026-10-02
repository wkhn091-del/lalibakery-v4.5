import "server-only";
import type { ProofItem } from "@/components/sections/Proof";
import { type Category, type CategoryId, type Cream, type Filling, type Flavour, type Size, type SizeVisual, TASTE_GROUPS, type TasteGroup, type TileImage, type WizardCatalog } from "@/lib/order/model";
import { priceText } from "@/lib/price";
import { clean, splitStega } from "@/lib/stega";
import { getSettings } from "./content";
import { isSanityConfigured } from "./env";
import { loadOrNull, sanityFetch } from "./fetch";
import { type CmsImage, cmsImage } from "./image";
import { catalogQuery, galleryQuery } from "./queries";
import { toneHex } from "./tones";

// The site's content from the CMS, in exactly the shapes the components already render.
// (The site's texts, the three documents of "הגדרות כלליות", "דף הבית" and "דף הזמנת עוגה": content.ts.)
//
// In the Studio's preview the texts carry invisible characters that link them to their fields
// (lib/stega.ts): kept on what's shown, cleaned off what's worked with (colours, allergens, shapes).
//
// null means "use the built-in content", which the site showed before the CMS existed: the CMS
// isn't set up (no project id), or has nothing published yet. When the CMS doesn't answer, see
// whenCmsFails (fetch.ts): the live site keeps the last page it built and tries again shortly,
// a build stops with the reason, the Studio's preview and development show the built-in content.

/* ───────── the homepage gallery (Proof) ───────── */

type GalleryDoc = { _id: string; name?: string; description?: string; price?: number; image?: CmsImage };

// the card's width at each breakpoint (globals.css: .proof-card), for the browser to pick a size
const PROOF_SIZES = "(min-width: 1482px) 400px, (min-width: 1024px) 30vw, 46vw";

/**
 * The caption under a photo, in the voice of the built-in ones: "רחל, 50. וינטג' עם סרטי סאטן ופנינים".
 * With a price: "... ופנינים. החל מ-450 ₪". No price, no price line (and the gallery looks as it
 * always did). Same element and style either way: only the words change.
 */
function captionOf(name: string, description: string | undefined, price: number | undefined, priceFrom: string) {
  // the trailing full stop goes, the preview's invisible link (at the very end) stays
  const tidy = (s?: string) => {
    if (!s) return undefined;
    const { cleaned, encoded } = splitStega(s);
    const text = cleaned.trim().replace(/[.\s]+$/, "");
    return text ? text + encoded : undefined;
  };
  return [tidy(name), tidy(description), price != null ? priceText(price, priceFrom) : undefined].filter(Boolean).join(". ");
}

export async function getGallery(): Promise<ProofItem[] | null> {
  if (!isSanityConfigured) return null;
  const [docs, settings] = await Promise.all([loadOrNull("the gallery", () => sanityFetch<GalleryDoc[]>(galleryQuery)), getSettings()]);
  if (!docs) return null;
  const priceFrom = clean(settings.priceFrom);
  const items = docs.flatMap((doc): ProofItem[] => {
    const img = doc.image && cmsImage(doc.image, [320, 480, 640, 800, 1000], { square: true });
    if (!img || !doc.name) return [];
    return [
      {
        key: doc._id,
        src: img.src,
        srcSet: img.srcSet,
        sizes: PROOF_SIZES,
        width: img.width,
        height: img.height,
        lqip: img.lqip,
        alt: doc.image?.alt || doc.name,
        caption: captionOf(doc.name, doc.description, doc.price, priceFrom),
      },
    ];
  });
  // e.g. the CMS is connected but not filled in yet: an empty gallery would be a broken section
  if (!items.length) {
    console.warn("[sanity] no published cakes are marked for the gallery yet, so the built-in gallery is shown");
    return null;
  }
  return items;
}

/* ───────── the cake wizard's catalog ───────── */

type SizeDoc = {
  _key: string;
  label?: string;
  detail?: string;
  servingsMin?: number;
  servingsMax?: number;
  price?: number;
  shape?: string;
  diameter?: number;
  trayWidth?: number;
  trayLength?: number;
};
type CategoryDoc = {
  _id: string;
  title?: string;
  blurb?: string;
  image?: CmsImage;
  gallery?: (CmsImage | null)[] | null;
  sizes?: SizeDoc[] | null;
  bases?: ({ _id: string; name?: string; note?: string; tone?: string; group?: string; contains?: string[] } | null)[] | null;
  creams?: (TasteDoc | null)[] | null;
  fillings?: (TasteDoc | null)[] | null;
};
type TasteDoc = { _id: string; name?: string; tone?: string; group?: string; contains?: string[]; parve?: boolean };

// the builder's four cake types, in the builder's order (its tile grid is laid out for this order)
const KEYS = ["number", "designer", "birthday", "kindergarten"] as const satisfies readonly CategoryId[];
const idOf = (key: CategoryId) => `category-${key}`;

const ALLERGENS = ["dairy", "nuts", "gluten"] as const;
type Allergen = (typeof ALLERGENS)[number];
const isAllergen = (value: string): value is Allergen => (ALLERGENS as readonly string[]).includes(value);
const groupOf = (value: string | undefined): TasteGroup | undefined => {
  const group = clean(value ?? "");
  return (TASTE_GROUPS as readonly string[]).includes(group) ? (group as TasteGroup) : undefined;
};

/** A cream or a filling, read once however many cake types list it; deleted or unpublished ones come back empty */
function tastesOf(docs: (TasteDoc | null)[] | null | undefined, seen: Map<string, Cream>): string[] {
  return (docs ?? []).flatMap((c) => {
    if (!c?.name) return [];
    if (!seen.has(c._id)) {
      const contains = clean(c.contains ?? []).filter(isAllergen);
      const group = groupOf(c.group);
      // "a parve version" only means something with dairy in it (the Studio hides it otherwise)
      seen.set(c._id, {
        id: c._id,
        label: c.name,
        tone: toneHex(clean(c.tone)),
        contains,
        ...(contains.includes("dairy") && c.parve ? { parve: true } : {}),
        ...(group ? { group } : {}),
      });
    }
    return [c._id];
  });
}

const clamp = (min: number, max: number, value: number) => Math.min(max, Math.max(min, value));

/**
 * The line drawing on a size card. Number cakes always draw the figure, a little bigger with each
 * size; the rest draw the shape the owner picked, with its measures kept inside the drawing's frame.
 */
function visualOf(category: CategoryId, size: SizeDoc, index: number, count: number): SizeVisual {
  if (category === "number") return { kind: "figure", scale: count > 1 ? 0.8 + (0.2 * index) / (count - 1) : 1 };
  switch (clean(size.shape)) {
    case "tiers":
      return { kind: "tiers" };
    case "tray":
      return { kind: "tray", w: clamp(10, 46, size.trayLength ?? 30), h: clamp(10, 34, size.trayWidth ?? 20) };
    case "cupcakes":
      return { kind: "cupcakes" };
    default:
      return { kind: "round", cm: clamp(8, 30, size.diameter ?? 20) };
  }
}

/** One cake type as the builder shows it, or the reason it can't be shown yet */
function categoryOf(key: CategoryId, doc: CategoryDoc | undefined, creams: Map<string, Cream>, fillings: Map<string, Filling>): Category | string {
  if (!doc) return "not published yet";
  if (!doc.title) return "has no name";
  const complete = (doc.sizes ?? []).filter((s) => s.label && (s.servingsMin ?? 0) > 0);
  const sizes = complete.map(
    (s, i): Size => ({
      id: s._key,
      label: s.label!,
      detail: s.detail || undefined,
      servings: [s.servingsMin!, Math.max(s.servingsMin!, s.servingsMax ?? 0)],
      // number cakes are sized, served and priced per digit or letter
      perFigure: key === "number" || undefined,
      price: s.price ?? undefined,
      visual: visualOf(key, s, i, complete.length),
    }),
  );
  // references to bases or creams that were deleted or never published come back empty: skipped
  const bases = (doc.bases ?? []).flatMap((b): Flavour[] => {
    if (!b?.name) return [];
    const group = groupOf(b.group);
    const contains = clean(b.contains ?? []).filter(isAllergen);
    return [{ id: b._id, label: b.name, note: b.note ?? "", tone: toneHex(clean(b.tone)), ...(group ? { group } : {}), ...(contains.length ? { contains } : {}) }];
  });
  const creamIds = tastesOf(doc.creams, creams);
  const fillingIds = tastesOf(doc.fillings, fillings);
  if (!sizes.length) return "has no sizes";
  if (!bases.length) return "has no published bases";
  if (!creamIds.length) return "has no published creams";
  const tile = (source: CmsImage | null | undefined): TileImage[] => {
    const img = source && cmsImage(source, [480, 720, 960, 1280]);
    return img ? [{ src: img.src, srcSet: img.srcSet, alt: source.alt || doc.title!, position: img.position }] : [];
  };
  const [image] = tile(doc.image);
  const gallery = image ? [image, ...(doc.gallery ?? []).flatMap(tile)] : [];
  return {
    id: key,
    title: doc.title,
    blurb: doc.blurb ?? "",
    figure: key === "number" || undefined,
    image,
    gallery: gallery.length > 1 ? gallery : undefined,
    sizes,
    bases,
    creams: creamIds,
    ...(fillingIds.length ? { fillings: fillingIds } : {}),
  };
}

/**
 * The builder's catalog from the CMS: all four cake types or none. With one missing or half
 * filled in, the builder keeps its built-in catalog (its layout needs all four), and the log says
 * which one to finish.
 */
export async function getCatalog(): Promise<WizardCatalog | null> {
  if (!isSanityConfigured) return null;
  const docs = await loadOrNull("the cake builder's catalog", () => sanityFetch<CategoryDoc[]>(catalogQuery, { ids: KEYS.map(idOf) }));
  if (!docs) return null;
  const creams = new Map<string, Cream>();
  const fillings = new Map<string, Filling>();
  const categories: Category[] = [];
  const problems: string[] = [];
  for (const key of KEYS) {
    const result = categoryOf(key, docs.find((doc) => doc._id === idOf(key)), creams, fillings);
    if (typeof result === "string") problems.push(`${idOf(key)} ${result}`);
    else categories.push(result);
  }
  if (problems.length) {
    console.warn(`[sanity] the cake builder keeps its built-in catalog until all four cake types are complete: ${problems.join("; ")}`);
    return null;
  }
  return { categories, creams: [...creams.values()], fillings: [...fillings.values()] };
}
