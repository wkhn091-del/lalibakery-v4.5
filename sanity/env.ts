// Where the content lives in Sanity. The project ID and dataset aren't secrets: they're part of
// every image URL. Without a project ID the site uses its built-in content (content.ts and the
// wizard's own catalog), so it builds and runs before the CMS is set up.

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim() ?? "";
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.trim() || "production";
/** The Sanity API version the queries are written against (a date; bump it deliberately) */
export const apiVersion = "2025-09-01";

/**
 * The Studio's address. In the Studio's preview, clicking a text on the page opens its field
 * right there; opened outside the Studio (a shared preview link), the click opens it here.
 */
export const studioUrl = process.env.NEXT_PUBLIC_SANITY_STUDIO_URL?.trim() || "http://localhost:3333";

export const isSanityConfigured = projectId !== "";

/** A typo in the settings fails loudly (fetch.ts), instead of quietly showing the built-in content */
export function settingsProblem(): string | null {
  if (!/^[a-z0-9-]+$/.test(projectId)) return `NEXT_PUBLIC_SANITY_PROJECT_ID "${projectId}" isn't a Sanity project id (lowercase letters and digits)`;
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dataset)) return `NEXT_PUBLIC_SANITY_DATASET "${dataset}" isn't a dataset name`;
  return null;
}
