import { defineCliConfig } from "sanity/cli";

// Values come from studio/.env (template: .env.example). See ../CMS.md
export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || "production",
  },
  // the Studio's address: https://<hostname>.sanity.studio (asked on the first deploy if empty)
  studioHost: process.env.SANITY_STUDIO_HOSTNAME || undefined,
  deployment: {
    // the hosted Studio picks up Sanity's fixes and security updates by itself (within this major version)
    autoUpdates: true,
  },
});
