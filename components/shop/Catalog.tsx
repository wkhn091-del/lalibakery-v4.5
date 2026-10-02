"use client";
import { useSearchParams } from "next/navigation";
import { startTransition, useMemo, useRef } from "react";
import type { Messages } from "@/lib/i18n/messages";
import type { CatalogCard, CatalogTerms } from "@/lib/shop/catalog";
import {
  activeCount,
  applyFilters,
  countWith,
  type Filters,
  filtersQuery,
  type ListGroup,
  NO_FILTERS,
  offered,
  parseFilters,
  type Sort,
  SORTS,
  toggle,
} from "@/lib/shop/filter";
import { fill } from "@/lib/text";
import ProductCard, { type CardWords } from "./ProductCard";

export type CatalogWords = { filters: Messages["filters"]; allergens: Messages["allergens"]; card: CardWords };

type Option = { value: string; label: string; swatch?: string };
type Group = { group: ListGroup; legend: string; options: Option[]; note?: string };

/** cards in the first row on a wide screen: their photos load at once */
const EAGER = 4;

/*
  The catalog's grid and its filters. The filters live in the address (lib/shop/filter.ts): the
  server already rendered the page for it, and each change after that filters the cards right here
  and rewrites the address in place (history.replaceState, which Next's router follows), with no
  request to the server and no new entry in the back button's history.
*/
export default function Catalog({ cards, terms, t }: { cards: CatalogCard[]; terms: CatalogTerms; t: CatalogWords }) {
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(params, terms), [params, terms]);
  const shown = useMemo(() => applyFilters(cards, filters), [cards, filters]);
  const dialog = useRef<HTMLDialogElement>(null);
  const f = t.filters;

  const groups = useMemo((): Group[] => {
    const offer = offered(cards);
    const list: Group[] = [
      { group: "category", legend: f.category, options: terms.category.map((x) => ({ value: x.slug, label: x.title })) },
      { group: "occasion", legend: f.occasion, options: terms.occasion.map((x) => ({ value: x.slug, label: x.title })) },
      { group: "style", legend: f.style, options: terms.style.map((x) => ({ value: x.slug, label: x.title, swatch: x.swatch })) },
      { group: "servings", legend: f.servings, options: offer.servings.map((b) => ({ value: b, label: f.buckets[b] })) },
      { group: "diet", legend: f.diet, options: offer.diet.map((d) => ({ value: d, label: t.card.diet[d] })) },
      { group: "free", legend: f.free, note: f.freeNote, options: offer.free.map((a) => ({ value: a, label: t.allergens[a] })) },
    ];
    return list.filter((g) => g.options.length > 1 || (g.options.length === 1 && (g.group === "diet" || g.group === "free")));
  }, [cards, terms, f, t.card.diet, t.allergens]);

  const go = (next: Filters) => {
    const url = `${window.location.pathname}${filtersQuery(next)}`;
    startTransition(() => window.history.replaceState(null, "", url));
  };

  const active = activeCount(filters);
  const countText = shown.length === 1 ? f.countOne : fill(f.count, { n: shown.length });

  const panel = (idPrefix: string) => (
    <div className="filter-panel">
      {groups.map(({ group, legend, options, note }) => (
        <fieldset key={group} className="filter-group" aria-describedby={note ? `${idPrefix}-${group}-note` : undefined}>
          <legend className="filter-legend">{legend}</legend>
          <div className="chips">
            {options.map((o) => {
              const on = (filters[group] as string[]).includes(o.value);
              const n = countWith(cards, filters, group, o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  className="chip filter-chip"
                  aria-pressed={on}
                  disabled={!on && n === 0}
                  onClick={() => go(toggle(filters, group, o.value))}
                >
                  {o.swatch && <span className="filter-swatch" style={{ background: o.swatch }} aria-hidden="true" />}
                  {o.label}
                  <span className="filter-count" aria-hidden="true">{n}</span>
                </button>
              );
            })}
          </div>
          {note && <p id={`${idPrefix}-${group}-note`} className="filter-note">{note}</p>}
        </fieldset>
      ))}
      {active > 0 && (
        <button type="button" className="text-link mt-6" onClick={() => go({ ...NO_FILTERS, sort: filters.sort })}>
          {f.clear}
        </button>
      )}
    </div>
  );

  return (
    <div className="catalog">
      {groups.length > 0 && (
        <aside className="catalog-aside" aria-label={f.title}>
          {panel("side")}
        </aside>
      )}

      <div className="catalog-main">
        <div className="catalog-bar">
          <p className="catalog-count" aria-live="polite">{countText}</p>
          <div className="catalog-tools">
            {groups.length > 0 && (
              <button type="button" className="chip catalog-filter-open" onClick={() => dialog.current?.showModal()}>
                {active ? fill(f.openWithCount, { n: active }) : f.open}
              </button>
            )}
            <label className="catalog-sort">
              <span className="sr-only">{f.sort}</span>
              <select value={filters.sort} onChange={(e) => go({ ...filters, sort: e.target.value as Sort })}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {s === "featured" ? f.sortFeatured : s === "price-asc" ? f.sortPriceAsc : f.sortPriceDesc}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {shown.length ? (
          <ul className="catalog-grid">
            {shown.map((card, i) => (
              <li key={card.id}>
                <ProductCard card={card} t={t.card} eager={i < EAGER} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="catalog-none">
            <p>{f.none}</p>
            <button type="button" className="btn-primary mt-6" onClick={() => go(NO_FILTERS)}>{f.noneCta}</button>
          </div>
        )}
      </div>

      {groups.length > 0 && (
        <dialog ref={dialog} className="filter-dialog" aria-label={f.title} onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
          <div className="filter-dialog-body">
            <h2 className="filter-dialog-title">{f.title}</h2>
            {panel("sheet")}
          </div>
          <div className="filter-dialog-foot">
            <button type="button" className="btn-primary w-full justify-center" onClick={() => dialog.current?.close()}>
              {f.close} · {countText}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
