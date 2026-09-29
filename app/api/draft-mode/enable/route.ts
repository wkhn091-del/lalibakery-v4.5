import { defineEnableDraftMode } from "next-sanity/draft-mode";
import { isSanityConfigured } from "@/sanity/env";
import { previewClient } from "@/sanity/fetch";

/*
  The Studio's preview opens the site through here (Presentation, studio/sanity.config.ts). The
  Studio adds a short-lived secret that only a signed-in editor's Studio can create; next-sanity
  checks it against the dataset with the Viewer token, turns on draft mode for this browser, and
  continues to the page asked for (same site only). Anyone else gets 401 and sees the live site.

  Draft mode shows drafts, uncached, with the click-to-edit links (sanity/fetch.ts). It lasts for
  the browser session; /api/draft-mode/disable ends it.
*/
export async function GET(request: Request): Promise<Response> {
  if (!isSanityConfigured) return new Response("The CMS isn't set up on this site (NEXT_PUBLIC_SANITY_PROJECT_ID). See CMS.md.", { status: 404 });
  const client = previewClient();
  if (!client) return new Response("The Studio's preview reads drafts, which takes SANITY_API_READ_TOKEN (a Viewer token). See CMS.md.", { status: 500 });
  return defineEnableDraftMode({ client }).GET(request);
}
