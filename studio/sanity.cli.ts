import { defineCliConfig } from "sanity/cli";

// Values come from studio/.env (template: .env.example); `npm run deploy` also reads
// studio/.env.production. See ../CMS.md

/**
 * The Studio's own address is https://<name>.sanity.studio, and SANITY_STUDIO_HOSTNAME is just
 * <name>: "lalibakery". The full address is accepted too. Anything else, such as the site's
 * address (http://localhost:3000, which belongs in SANITY_STUDIO_PREVIEW_URL), is set aside with
 * an explanation instead of reaching Sanity, and `npm run deploy` asks for the name.
 */
function studioName(value: string | undefined): string | undefined {
  const typed = value?.trim();
  if (!typed) return undefined; // asked on the first deploy
  const name = typed.toLowerCase().replace(/^https?:\/\//, "").replace(/\.sanity\.studio\/?$/, "");
  if (/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) return name;
  console.warn(
    `\n! SANITY_STUDIO_HOSTNAME="${typed}" isn't a Studio name, so it's ignored.\n` +
      "  It's only the <name> in https://<name>.sanity.studio: lowercase English letters, digits and dashes, e.g. lalibakery.\n" +
      "  (The website's address, which the Studio's preview shows, is a different setting: SANITY_STUDIO_PREVIEW_URL in studio/.env.production.)\n" +
      "  Fix it in studio/.env; until then `npm run deploy` asks for the name.\n",
  );
  return undefined;
}

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || "production",
  },
  // https://<name>.sanity.studio (asked on the first deploy if empty)
  studioHost: studioName(process.env.SANITY_STUDIO_HOSTNAME),
  deployment: {
    // the hosted Studio picks up Sanity's fixes and security updates by itself (within this major version)
    autoUpdates: true,
  },
});
