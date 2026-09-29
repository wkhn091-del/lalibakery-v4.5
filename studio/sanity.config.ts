import { visionTool } from "@sanity/vision";
import { defineConfig, isDev } from "sanity";
import { defineDocuments, defineLocations, presentationTool } from "sanity/presentation";
import { structureTool } from "sanity/structure";
import { RtlInput } from "./components/RtlInput";
import { FIXED_TYPES, SINGLETON_TYPES, schemaTypes } from "./schemaTypes";
import { SINGLETONS } from "./schemaTypes/site";
import { structure } from "./structure";

/*
  The LaliBakery Studio: where the owner edits every text on the site, the cakes, prices, cake
  types and photos. Two ways in: the forms ("תוכן"), and the site itself ("עריכה על האתר": the
  live site with the drafts, where a click on any text opens its field).
  Hosted by Sanity (npm run deploy) at https://<SANITY_STUDIO_HOSTNAME>.sanity.studio, and only
  people invited to the project can sign in. Setup and security: ../CMS.md
*/

// the documents that always exist, one of each (the four cake types, the three text documents):
// edit and publish, never delete, duplicate or unpublish
const FIXED_ACTIONS = new Set(["publish", "discardChanges", "restore"]);
const KEPT_TYPES = new Set([...FIXED_TYPES, ...SINGLETON_TYPES]);

// the site the Studio shows, with the drafts (its /api/draft-mode/enable checks the Studio's secret).
// In development the local site; for the hosted Studio, studio/.env.production (CMS.md, step 2).
const previewUrl = process.env.SANITY_STUDIO_PREVIEW_URL?.trim() || "http://localhost:3000";
// the site with and without www: a domain that redirects from one to the other still connects
const previewOrigins = (() => {
  try {
    const url = new URL(previewUrl);
    const other = new URL(url.origin);
    other.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    return [url.origin, other.origin];
  } catch {
    return undefined; // not an address: the Studio says so in the preview itself (and `npm run doctor` too)
  }
})();
const ORDER_PAGE = [{ title: "דף הזמנת עוגה", href: "/custom-cake" }];

// From studio/.env (read once, when `npm run dev` starts). Without them Sanity only says "Client is
// missing projectId", so say what to do instead.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? "";
const dataset = process.env.SANITY_STUDIO_DATASET || "production";
if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
  throw new Error(
    `SANITY_STUDIO_PROJECT_ID is ${projectId ? `"${projectId}", which isn't a project id` : "not set"}. ` +
      "Copy studio/.env.example to studio/.env, fill in the Project ID from sanity.io/manage, and restart `npm run dev`. " +
      "`npm run doctor` checks the whole setup.",
  );
}

export default defineConfig({
  name: "lalibakery",
  title: "LaliBakery",

  projectId,
  dataset,

  plugins: [
    // first, so the Studio opens on the site itself: click any text to edit it
    presentationTool({
      title: "עריכה על האתר",
      previewUrl: { initial: previewUrl, previewMode: { enable: "/api/draft-mode/enable" } },
      allowOrigins: previewOrigins,
      resolve: {
        // the document that opens next to each page
        mainDocuments: defineDocuments([
          { route: "/", filter: `_id == "homePage"` },
          { route: "/custom-cake", filter: `_id == "cakePage"` },
          { route: "/accessibility", filter: `_id == "siteSettings"` },
        ]),
        // "used on these pages", on top of each document
        locations: {
          ...Object.fromEntries(SINGLETONS.map(({ type, pages }) => [type, defineLocations({ locations: pages })])),
          cake: defineLocations({ locations: [{ title: "דף הבית: הגלריה", href: "/" }] }),
          category: defineLocations({ locations: ORDER_PAGE }),
          flavour: defineLocations({ locations: ORDER_PAGE }),
          cream: defineLocations({ locations: ORDER_PAGE }),
        },
      },
    }),
    structureTool({ structure, title: "תוכן" }),
    // GROQ playground, for development only: the owner never sees it
    ...(isDev ? [visionTool()] : []),
  ],

  schema: {
    types: schemaTypes,
    // no "create new" for the fixed cake types or the text documents, anywhere in the Studio
    templates: (templates) => templates.filter(({ schemaType }) => !KEPT_TYPES.has(schemaType)),
  },

  document: {
    newDocumentOptions: (options) => options.filter(({ templateId }) => !KEPT_TYPES.has(templateId)),
    actions: (actions, { schemaType }) => (KEPT_TYPES.has(schemaType) ? actions.filter(({ action }) => action && FIXED_ACTIONS.has(action)) : actions),
  },

  form: {
    components: { input: RtlInput },
  },
});
