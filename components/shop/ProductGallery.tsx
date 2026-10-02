"use client";
import { useState } from "react";
import type { CardImage } from "@/lib/shop/catalog";
import { fill } from "@/lib/text";

export type GalleryImage = CardImage & { thumb: string };

const SIZES = "(min-width: 1024px) 50vw, 100vw";

// The product's photos: one large, and a row of thumbnails to switch between them
export default function ProductGallery({ images, label, photo }: { images: GalleryImage[]; label: string; photo: string }) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];
  if (!current) return null;
  return (
    <section className="gallery" aria-label={label}>
      <div className="gallery-main" style={current.lqip ? { backgroundImage: `url(${current.lqip})` } : undefined}>
        <img
          key={current.src}
          src={current.src}
          srcSet={current.srcSet}
          sizes={SIZES}
          width={current.width}
          height={current.height ?? current.width}
          alt={current.alt}
          fetchPriority={index === 0 ? "high" : undefined}
          style={current.position ? { objectPosition: current.position } : undefined}
        />
      </div>
      {images.length > 1 && (
        <ul className="gallery-thumbs">
          {images.map((img, i) => (
            <li key={img.src}>
              <button
                type="button"
                className="gallery-thumb"
                aria-pressed={i === index}
                aria-label={fill(photo, { n: i + 1, total: images.length })}
                onClick={() => setIndex(i)}
              >
                <img src={img.thumb} alt="" width={96} height={96} loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
