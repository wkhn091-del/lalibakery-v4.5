#!/usr/bin/env node
/*
  Clears the Studio's caches and reinstalls exactly what the lockfile says. Your content is not
  touched (it lives on sanity.io, not here).

    cd studio && npm run reset

  Removes: node_modules (with the dev server's cache in node_modules/.sanity), .sanity (generated
  runtime files) and dist (old builds). Then runs `npm ci`.
*/
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STUDIO = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const dir of ["node_modules", ".sanity", "dist"]) {
  const path = join(STUDIO, dir);
  if (existsSync(path)) {
    console.log(`removing studio/${dir}`);
    rmSync(path, { recursive: true, force: true });
  }
}
console.log("npm ci");
const npm = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci"], { cwd: STUDIO, stdio: "inherit", shell: process.platform === "win32" });
if (npm.status !== 0) process.exit(npm.status ?? 1);
console.log("\nDone. Start the Studio again with: npm run dev");
