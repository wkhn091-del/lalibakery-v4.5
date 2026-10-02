import Link from "next/link";
import type { CatalogCard } from "@/lib/shop/catalog";
import type { Messages } from "@/lib/i18n/messages";
import { agorotText } from "@/lib/price";
import { fill } from "@/lib/text";

export type CardWords = { from: string; unavailable: string; diet: Messages["diet"] };

const SIZES = "(min-width: 1280px) 22vw, (min-width: 1024px) 28vw, (min-width: 640px) 44vw, 92vw";

/** The price as a card shows it: the one price, "from" the lowest, or that it can't be ordered now */
export function cardPrice(card: Pick<CatalogCard, "fromAgorot" | "onePrice">, t: Pick<CardWords, "from" | "unavailable">): string {
  if (card.fromAgorot === null) return t.unavailable;
  const price = agorotText(card.fromAgorot);
  return card.onePrice ? price : fill(t.from, { price });
}

// A product in the catalog's grid. The first row loads at once; the rest as they near the screen.
export default function ProductCard({ card, t, eager }: { card: CatalogCard; t: CardWords; eager: boolean }) {
  const img = card.image;
  return (
    <Link href={card.href} className="product-card" data-unavailable={card.available ? undefined : ""}>
      <div className="product-card-img" style={img?.lqip ? { backgroundImage: `url(${img.lqip})` } : undefined}>
        {img && (
          <img
            src={img.src}
            srcSet={img.srcSet}
            sizes={SIZES}
            width={img.width}
            height={img.height ?? img.width}
            alt={img.alt}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : undefined}
            decoding="async"
            style={img.position ? { objectPosition: img.position } : undefined}
          />
        )}
      </div>
      <h3 className="product-card-title">{card.title}</h3>
      {card.summary && <p className="product-card-summary">{card.summary}</p>}
      <p className="product-card-price">{cardPrice(card, t)}</p>
      {card.diet.length > 0 && (
        <ul className="product-card-tags">
          {card.diet.map((d) => <li key={d}>{t.diet[d]}</li>)}
        </ul>
      )}
    </Link>
  );
}
