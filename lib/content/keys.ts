/** An item of a list from the CMS keeps the Studio's key (lib/content/merge.ts): a stable React
 *  key for it, whatever its text; the built-in items fall back to their place in the list */
export const keyOf = (item: object, index: number) => (item as { _key?: string })._key ?? String(index);
