import { createImageUrlBuilder } from "@sanity/image-url";
import { dataset, projectId } from "./env";

/** An image as the queries return it: the asset, the owner's crop and focal point, and alt text */
export type CmsImage = {
  alt?: string;
  crop?: { top: number; bottom: number; left: number; right: number };
  hotspot?: { x: number; y: number; width: number; height: number };
  asset?: { _id: string; metadata?: { lqip?: string; dimensions?: { width: number; height: number } } };
};

const builder = createImageUrlBuilder({ projectId, dataset });

/**
 * Responsive image attributes from Sanity's image CDN. The owner uploads the full-size photo; the
 * CDN resizes it on demand, compresses it, and serves WebP or AVIF to browsers that take them
 * (auto=format), each size cached at the edge.
 *
 * square: cropped to a square around the owner's focal point (hotspot). Otherwise the whole photo,
 * and `position` places its focal point for CSS object-fit: cover.
 */
export function cmsImage(image: CmsImage, widths: number[], { square = false } = {}) {
  if (!image.asset?._id) return null;
  const source = { asset: { _ref: image.asset._id }, crop: image.crop, hotspot: image.hotspot };
  const at = (w: number) => {
    const b = builder.image(source).width(w).auto("format").quality(78);
    return (square ? b.height(w).fit("crop") : b.fit("max")).url();
  };
  const largest = widths[widths.length - 1];
  const size = image.asset.metadata?.dimensions;
  return {
    src: at(largest),
    srcSet: widths.map((w) => `${at(w)} ${w}w`).join(", "),
    width: largest,
    height: square ? largest : size ? Math.round((largest * size.height) / size.width) : undefined,
    lqip: image.asset.metadata?.lqip,
    position: image.hotspot ? `${Math.round(image.hotspot.x * 100)}% ${Math.round(image.hotspot.y * 100)}%` : undefined,
  };
}
