/*
  In the Studio's preview (draft mode) every text from the CMS ends with invisible characters that
  say which field it came from: that's how clicking a text on the page opens its field (Visual
  Editing, next-sanity/visual-editing). On the live site the texts have none, and these helpers
  change nothing.

  Anything that isn't shown as text must go through clean(): links, times and numbers that get
  compared or calculated, the WhatsApp message, the 3D inscription, the data for Google.
*/
import { vercelStegaClean, vercelStegaSplit } from "@vercel/stega";

/** The value without the preview's invisible characters (strings, and every string inside an object) */
export const clean = <T>(value: T): T => (value == null ? value : vercelStegaClean(value));

/**
 * A text and its invisible part, apart: for a text the page cuts into words (the scroll-lit
 * paragraph), the words come from `cleaned`, and `encoded` is put back once, after them, so the
 * whole paragraph still opens its field.
 */
export const splitStega = (text: string) => vercelStegaSplit(text);
