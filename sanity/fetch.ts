import "server-only";
import { type ClientPerspective, createClient, type QueryParams, type SanityClient } from "next-sanity";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { cookies, draftMode } from "next/headers";
import { apiVersion, dataset, projectId, settingsProblem, studioUrl } from "./env";

/** Every published fetch carries this cache tag; the webhook (app/api/revalidate) revalidates it */
export const SANITY_TAG = "sanity";
/** A safety net: even if a webhook is missed, changes appear within this many seconds */
const REVALIDATE_SECONDS = 3600;
/** set by next-sanity's draft-mode route to the perspective the Studio shows (drafts, a release…) */
const PERSPECTIVE_COOKIE = "sanity-preview-perspective";
/**
 * A private dataset (Growth plan) needs the Viewer token for published reads too. A public one
 * doesn't, and then the token is used for drafts only: the live site never depends on it (a
 * revoked or rotated token can only affect the Studio's preview).
 */
const PRIVATE_DATASET = process.env.SANITY_PRIVATE_DATASET === "true";

/*
  Two ways to read the CMS, decided per request:

  The live site: published content only, through Next's data cache. Pages are built statically and
  rebuilt when the webhook revalidates the tag (or after an hour). Visitors never run any Sanity
  code, and nothing here can write: editing happens only in the Studio, behind Sanity's login.

  The Studio's preview (draft mode, turned on by app/api/draft-mode/enable only for a request the
  Studio signed): drafts, never cached, and every text marked with the invisible characters that
  let a click on the page open its field (stega, lib/stega.ts). Reading drafts takes
  SANITY_API_READ_TOKEN, a Viewer token that stays on the server.

  A failed query throws, after the client's own retries of brief outages; whenCmsFails() below
  says what the page does then.
*/

let base: SanityClient | undefined;
function client(): SanityClient {
  const problem = settingsProblem();
  if (problem) throw new Error(`[sanity] ${problem}. See CMS.md, or leave it empty to show the built-in content.`);
  // SANITY_API_HOST: for local tests against a mock of the query API only
  const mock = process.env.SANITY_API_HOST;
  return (base ??= createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false,
    perspective: "published",
    token: PRIVATE_DATASET ? process.env.SANITY_API_READ_TOKEN || undefined : undefined,
    maxRetries: 3,
    stega: { enabled: false, studioUrl },
    ...(mock ? { apiHost: mock, useProjectHostname: false } : {}),
  }));
}

/** Whether this request is the Studio's preview */
export async function isPreview(): Promise<boolean> {
  try {
    return (await draftMode()).isEnabled;
  } catch {
    return false; // outside a request (a script, a test): the live site's way
  }
}

/** The perspective the Studio asked for (drafts, published, or a release on top of drafts) */
async function previewPerspective(): Promise<ClientPerspective> {
  const value = (await cookies()).get(PERSPECTIVE_COOKIE)?.value ?? "";
  const stack = value.split(",").map((s) => s.trim()).filter((s) => /^[\w.-]+$/.test(s));
  if (!stack.length) return "drafts";
  if (stack.length === 1 && (stack[0] === "drafts" || stack[0] === "published")) return stack[0];
  return stack as ClientPerspective;
}

/**
 * A read-only GROQ query. `stega: false` for text that isn't shown on the page (the page title,
 * the description for Google): in the preview it's read without the invisible characters.
 * `published: true` for what an order is priced and checked against: the published content even
 * in the Studio's preview, so a draft price never reaches a real order.
 */
export async function sanityFetch<T>(query: string, params: QueryParams = {}, options: { stega?: boolean; published?: boolean } = {}): Promise<T> {
  if (!options.published && (await isPreview())) {
    const token = process.env.SANITY_API_READ_TOKEN;
    if (!token) throw new Error("[sanity] the Studio's preview reads drafts, which takes SANITY_API_READ_TOKEN (a Viewer token). See CMS.md.");
    return client().fetch<T>(query, params, {
      perspective: await previewPerspective(),
      token,
      useCdn: false,
      stega: options.stega ?? true,
      cache: "no-store",
    });
  }
  return client().fetch<T>(query, params, {
    perspective: "published",
    stega: false,
    next: { revalidate: REVALIDATE_SECONDS, tags: [SANITY_TAG] },
  });
}

/**
 * What a page does when a CMS read fails (after the client's retries):
 *  - during `next build`: the build stops, with the reason (the previous deploy stays live);
 *  - on the live site, refreshing a page: the refresh fails, so Next keeps serving the last page
 *    it built (the owner's content, never the built-in one) and tries again within 30 seconds;
 *  - in the Studio's preview, and in development: the built-in content, with the error logged.
 * Throws in the first two cases; returns (the caller shows the built-in content) otherwise.
 */
export async function whenCmsFails(error: unknown, what: string): Promise<void> {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) throw error;
  if (process.env.NODE_ENV === "production" && !(await isPreview())) {
    console.error(`[sanity] ${what} couldn't be loaded; the last version of the page stays up, and it's tried again shortly.`, error);
    throw error;
  }
  console.error(`[sanity] ${what} couldn't be loaded, so the built-in content is shown.`, error);
}

/** A CMS read for a page; when it fails, whenCmsFails decides (null: the page's fallback) */
export async function loadOrNull<T>(what: string, query: () => Promise<T>): Promise<T | null> {
  try {
    return await query();
  } catch (error) {
    await whenCmsFails(error, what);
    return null;
  }
}

/** Whether the CMS answers right now (never cached). The webhook checks this before refreshing. */
export async function sanityIsReachable(): Promise<boolean> {
  try {
    await client().fetch<number>(`count(*[_type == "cake"])`, {}, { perspective: "published", stega: false, cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

/** The client with the Viewer token, for app/api/draft-mode/enable to check the Studio's signature */
export function previewClient(): SanityClient | null {
  const token = process.env.SANITY_API_READ_TOKEN;
  return token ? client().withConfig({ token }) : null;
}
