// The catalog as cards, and its filters in the address.   npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CmsImage } from "@/sanity/image";
import { catalogTerms, type CatalogCard, type CatalogTerms, toCards } from "./catalog";
import { activeCount, applyFilters, countWith, filtersQuery, NO_FILTERS, offered, parseFilters, toggle } from "./filter";
import type { ShopCatalog, ShopProduct } from "./normalize";

const fakeImage = (image: CmsImage, widths: number[]) => ({ src: `${image.asset?._id}-${widths.at(-1)}`, srcSet: "", width: widths.at(-1)! });

function product(over: Partial<ShopProduct> & Pick<ShopProduct, "id" | "slug">): ShopProduct {
  return {
    kind: "single",
    title: { he: `מוצר ${over.slug}`, en: `Product ${over.slug}` },
    summary: {},
    description: {},
    seoDescription: {},
    categoryId: "cat-cakes",
    images: [{ asset: { _id: `img-${over.id}` }, alt: `תמונה ${over.id}` }],
    variants: [{ id: "v1", label: { he: "רגיל" }, priceAgorot: 10000, available: true }],
    bundle: [],
    occasionIds: [],
    styleIds: [],
    kosher: "dairy",
    diet: { glutenFreeRecipe: false, noAddedSugar: false, nutFree: false },
    allergens: ["gluten", "eggs", "dairy"],
    featured: false,
    ...over,
  };
}

const term = (id: string, slug: string, he: string) => ({ id, slug, title: { he, en: slug } });

const CATALOG: ShopCatalog = {
  categories: [term("cat-cakes", "cakes", "עוגות"), term("cat-boxes", "boxes", "מארזים"), term("cat-unused", "unused", "לא בשימוש")],
  occasions: [term("occ-bday", "birthday", "יום הולדת"), term("occ-wedding", "wedding", "חתונה")],
  styles: [term("sty-pink", "pink", "ורוד")],
  products: [
    product({
      id: "a",
      slug: "rachel",
      occasionIds: ["occ-bday"],
      styleIds: ["sty-pink"],
      variants: [
        { id: "s", label: { he: "קטן" }, servings: [8, 12], priceAgorot: 24990, available: true },
        { id: "l", label: { he: "גדול" }, servings: [25, 30], priceAgorot: 39000, available: true },
        { id: "x", label: { he: "ענק" }, servings: [60, 80], priceAgorot: 90000, available: false },
      ],
    }),
    product({ id: "b", slug: "vegan", kosher: "parve", diet: { glutenFreeRecipe: true, noAddedSugar: false, nutFree: true }, allergens: ["soy"], occasionIds: ["occ-wedding"], featured: true }),
    product({ id: "c", slug: "box", categoryId: "cat-boxes", kind: "bundle", occasionIds: ["occ-bday", "occ-wedding"], variants: [{ id: "only", label: { he: "מארז" }, priceAgorot: 15000, available: true }] }),
    product({ id: "d", slug: "gone", variants: [{ id: "v", label: { he: "רגיל" }, priceAgorot: 5000, available: false }] }),
  ],
};

const cards: CatalogCard[] = toCards(CATALOG, "he", fakeImage);
const terms: CatalogTerms = catalogTerms(CATALOG, cards, "he");
const slugs = (list: CatalogCard[]) => list.map((c) => c.slug);
const filter = (query: string) => applyFilters(cards, parseFilters(new URLSearchParams(query), terms));

describe("toCards", () => {
  it("prices a card from its available sizes only", () => {
    const rachel = cards[0];
    assert.equal(rachel.fromAgorot, 24990);
    assert.equal(rachel.onePrice, false);
    assert.deepEqual(rachel.servings, [[8, 12], [25, 30]]);
    assert.equal(cards[2].onePrice, true);
    assert.equal(cards[3].fromAgorot, null);
    assert.equal(cards[3].available, false);
  });

  it("speaks the page's language, with addresses to match, and filters by slugs", () => {
    assert.equal(cards[0].title, "מוצר rachel");
    assert.equal(cards[0].href, "/products/rachel");
    const en = toCards(CATALOG, "en", fakeImage);
    assert.equal(en[0].title, "Product rachel");
    assert.equal(en[0].href, "/en/products/rachel");
    assert.equal(cards[0].category, "cakes");
    assert.deepEqual(cards[2].occasions, ["birthday", "wedding"]);
    assert.deepEqual(cards[1].diet, ["parve", "glutenFreeRecipe", "nutFree"]);
    assert.equal(cards[0].image?.alt, "תמונה a");
  });

  it("offers only the choices some product has", () => {
    assert.deepEqual(terms.category.map((t) => t.slug), ["cakes", "boxes"]);
    assert.deepEqual(terms.occasion.map((t) => t.title), ["יום הולדת", "חתונה"]);
    const offer = offered(cards);
    assert.deepEqual(offer.servings, ["upTo10", "10to20", "20to40"]);
    assert.deepEqual(offer.diet, ["parve", "glutenFreeRecipe", "nutFree"]);
    // "without eggs" splits the catalog; "without nuts" wouldn't change anything
    assert.ok(offer.free.includes("eggs"));
    assert.ok(!offer.free.includes("nuts"));
  });
});

describe("parseFilters", () => {
  it("reads the catalog's own choices, in a fixed order", () => {
    const f = parseFilters(new URLSearchParams("occasion=wedding,birthday&diet=parve&servings=10to20&sort=price-asc"), terms);
    assert.deepEqual(f.occasion, ["birthday", "wedding"]);
    assert.deepEqual(f.diet, ["parve"]);
    assert.deepEqual(f.servings, ["10to20"]);
    assert.equal(f.sort, "price-asc");
  });

  it("drops what isn't the catalog's, and never fails on a bad address", () => {
    const f = parseFilters(new URLSearchParams("category=cakes,nope,<script>&diet=sugar-free&free=gluten,poison&sort=cheapest&occasion=" + "a,".repeat(500)), terms);
    assert.deepEqual(f.category, ["cakes"]);
    assert.deepEqual(f.diet, []);
    assert.deepEqual(f.free, ["gluten"]);
    assert.equal(f.sort, "featured");
    assert.deepEqual(f.occasion, []); // over the length limit: ignored whole
    assert.deepEqual(parseFilters({ category: ["boxes", "cakes"], style: undefined }, terms).category, ["boxes"]);
  });

  it("writes the same address back, and nothing for no filters", () => {
    const query = "?category=cakes&occasion=birthday,wedding&diet=parve,gluten-free-recipe&free=eggs&sort=price-desc";
    assert.equal(filtersQuery(parseFilters(new URLSearchParams(query), terms)), query);
    assert.equal(filtersQuery(NO_FILTERS), "");
  });
});

describe("applyFilters", () => {
  it("shows everything in the shop's order, featured first, what can't be ordered last", () => {
    assert.deepEqual(slugs(filter("")), ["vegan", "rachel", "box", "gone"]);
  });

  it("any of a group's choices, all of the groups", () => {
    assert.deepEqual(slugs(filter("occasion=birthday")), ["rachel", "box"]);
    assert.deepEqual(slugs(filter("occasion=birthday,wedding")), ["vegan", "rachel", "box"]);
    assert.deepEqual(slugs(filter("occasion=birthday&category=boxes")), ["box"]);
    assert.deepEqual(slugs(filter("style=pink")), ["rachel"]);
  });

  it("servings by the sizes that can be ordered", () => {
    assert.deepEqual(slugs(filter("servings=20to40")), ["rachel"]);
    assert.deepEqual(slugs(filter("servings=over40")), []); // the 60–80 size is unavailable
  });

  it("every diet chosen, none of the allergens chosen", () => {
    assert.deepEqual(slugs(filter("diet=parve,nut-free-recipe")), ["vegan"]);
    assert.deepEqual(slugs(filter("diet=parve,no-added-sugar")), []);
    assert.deepEqual(slugs(filter("free=eggs")), ["vegan"]);
  });

  it("sorts by the lowest price that can be ordered", () => {
    assert.deepEqual(slugs(filter("sort=price-asc")), ["vegan", "box", "rachel", "gone"]);
    assert.deepEqual(slugs(filter("sort=price-desc")), ["rachel", "box", "vegan", "gone"]);
  });
});

describe("the filter buttons", () => {
  it("switch a choice on and off, and count the active ones", () => {
    const on = toggle(NO_FILTERS, "occasion", "birthday");
    assert.deepEqual(on.occasion, ["birthday"]);
    assert.equal(activeCount(toggle(on, "diet", "parve")), 2);
    assert.deepEqual(toggle(on, "occasion", "birthday").occasion, []);
  });

  it("say how many products a choice would show", () => {
    const f = parseFilters(new URLSearchParams("occasion=birthday"), terms);
    // in an "any of" group the other choices are counted on their own
    assert.equal(countWith(cards, f, "occasion", "wedding"), 2);
    // across groups, together with what's chosen
    assert.equal(countWith(cards, f, "category", "boxes"), 1);
    assert.equal(countWith(cards, f, "diet", "parve"), 0);
  });
});
