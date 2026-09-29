import "server-only";
import { cache } from "react";
import { CAKE_PAGE, HOME, SETTINGS } from "@/content";
import { mergeContent, type Rules } from "@/lib/content/merge";
import type { CakePageContent, HomeContent, SiteSettings } from "@/lib/content/types";
import { isSanityConfigured } from "./env";
import { isPreview, sanityFetch, whenCmsFails } from "./fetch";
import { SINGLETON, singletonQuery } from "./queries";
import { CAKE_PAGE_RULES, HOME_RULES, SETTINGS_RULES } from "./rules";

/*
  The site's texts: the owner's, from the Studio's three documents, laid over the built-in ones in
  content.ts (lib/content/merge.ts says how, field by field). Every page asks for what it shows;
  within one request each document is read once.

  With no CMS set up, or a document not published yet: the built-in texts, and the page works as
  it did before the CMS. The CMS not answering: see whenCmsFails (sanity/fetch.ts): the live site
  keeps its last page, a build stops. In the Studio's preview: the draft as it stands (strict).
*/

async function load<T>(what: string, id: string, defaults: T, rules: Rules, stega: boolean): Promise<T> {
  if (!isSanityConfigured) return defaults;
  const preview = await isPreview();
  let doc: unknown;
  try {
    doc = await sanityFetch<unknown>(singletonQuery, { id }, { stega });
  } catch (error) {
    await whenCmsFails(error, what);
    return defaults;
  }
  if (!doc) {
    if (!preview) console.warn(`[sanity] "${id}" isn't published yet, so the built-in texts are shown (studio: npm run seed, then Publish)`);
    return defaults;
  }
  const problems: string[] = [];
  const merged = mergeContent(defaults, doc, rules, { strict: preview, problems });
  if (problems.length) console.warn(`[sanity] ${what}: the built-in text is shown where a field can't be used: ${problems.join("; ")}`);
  return merged;
}

// once per request for each (document, with or without the preview's invisible links)
const settings = cache((stega: boolean) => load("the site settings", SINGLETON.settings, SETTINGS, SETTINGS_RULES, stega));
const home = cache(() => load("the homepage texts", SINGLETON.home, HOME, HOME_RULES, true));
const cakePage = cache(async (stega: boolean): Promise<CakePageContent> => {
  const [page, site] = await Promise.all([load("the cake page texts", SINGLETON.cakePage, CAKE_PAGE, CAKE_PAGE_RULES, stega), settings(stega)]);
  return { ...page, wizard: { ...page.wizard, order: { ...page.wizard.order, priceFrom: site.priceFrom } } };
});

/** "הגדרות כלליות". stega: false for what isn't shown on the page (the tab title, Google's description) */
export const getSettings = (stega = true): Promise<SiteSettings> => settings(stega);
/** "דף הבית" */
export const getHome = (): Promise<HomeContent> => home();
/** "דף הזמנת עוגה", with the site's price format (one format everywhere: "הגדרות כלליות") */
export const getCakePage = (stega = true): Promise<CakePageContent> => cakePage(stega);
