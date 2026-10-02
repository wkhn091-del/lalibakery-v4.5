import { clean } from "@/lib/stega";

type Props = {
  name: string;
  description: string;
  url: string;
  images: string[];
  brand: string;
  /** agorot, of the sizes that are available */
  prices: number[];
};

// What Google reads about a product: its name, photos and real prices (a range when it has sizes).
// Only sizes that can be ordered count; with none, it says so.
export default function ProductJsonLd({ name, description, url, images, brand, prices }: Props) {
  const shekels = (agorot: number) => (agorot / 100).toFixed(2);
  const availability = prices.length ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const offers =
    prices.length > 1 && low !== high
      ? { "@type": "AggregateOffer", priceCurrency: "ILS", lowPrice: shekels(low), highPrice: shekels(high), offerCount: prices.length, availability, url }
      : { "@type": "Offer", priceCurrency: "ILS", ...(prices.length ? { price: shekels(low) } : {}), availability, url };
  const data = clean({
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(description ? { description } : {}),
    image: images,
    url,
    brand: { "@type": "Brand", name: brand },
    offers,
  });
  // "<" escaped: the texts come from the CMS, and a "</script>" typed in one mustn't end the tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
