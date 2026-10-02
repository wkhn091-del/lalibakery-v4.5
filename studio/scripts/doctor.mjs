#!/usr/bin/env node
/*
  The Studio's health check. Read-only: it changes nothing, it tells you what's wrong and the exact
  command that fixes it.

    cd studio && npm run doctor

  Checks, in the order they usually break:
    1. Node version (Sanity 6 needs 22.12+)
    2. Dependencies installed here, in studio/ (not only in the site's folder), matching package.json,
       and one copy each of React, styled-components and Sanity UI (two copies = erratic Studio)
    3. studio/.env: project id and dataset, and the same project as the site; the site the
       Presentation view ("edit on the site") shows, and whether that site can read drafts
    4. Port 3333 free (a second Studio running is a classic source of "erratic")
    5. The project, the dataset and CORS for http://localhost:3333, over the network
*/
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const STUDIO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(STUDIO, "..");
const PORT = Number(process.env.PORT) || 3333;
const ORIGIN = `http://localhost:${PORT}`;
const API_VERSION = "v2025-09-01";

const results = [];
const color = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
function report(level, title, detail, fix) {
  results.push(level);
  const mark = { ok: color(32, "✓"), warn: color(33, "!"), fail: color(31, "✗"), info: color(36, "i") }[level];
  console.log(`${mark} ${title}`);
  if (detail) console.log(`    ${detail}`);
  if (fix) for (const line of [].concat(fix)) console.log(`    ${color(36, "→")} ${line}`);
}
const section = (name) => console.log(`\n${color(1, name)}`);

/* ───────── 0. where we are ───────── */

if (!existsSync(join(STUDIO, "sanity.config.ts")) || !existsSync(join(STUDIO, "sanity.cli.ts"))) {
  console.error("Run this from the project: node studio/scripts/doctor.mjs (it looks for studio/sanity.config.ts).");
  process.exit(2);
}
console.log(color(1, "LaliBakery Studio doctor") + `  (${relative(process.cwd(), STUDIO) || "."})`);

/* ───────── 1. Node ───────── */

section("Node");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 12)) report("ok", `Node ${process.versions.node}`);
else
  report("fail", `Node ${process.versions.node} is too old for Sanity 6 (needs 22.12 or newer)`,
    "This alone makes the Studio fail to start or crash in odd places.",
    ["Install Node 22 LTS (nodejs.org, or `nvm install 22 && nvm use 22`), then reinstall: rm -rf node_modules && npm ci"]);

/* ───────── 2. dependencies ───────── */

section("Dependencies (studio/node_modules)");
const pkg = JSON.parse(readFileSync(join(STUDIO, "package.json"), "utf8"));
const require = createRequire(join(STUDIO, "package.json"));
const installed = (name, from = STUDIO) => {
  try {
    const path = createRequire(join(from, "package.json")).resolve(`${name}/package.json`);
    return { path, version: JSON.parse(readFileSync(path, "utf8")).version };
  } catch {
    return null;
  }
};

if (!existsSync(join(STUDIO, "node_modules"))) {
  report("fail", "Nothing is installed in studio/",
    "The Studio is a separate app with its own package.json. Installing in the site's folder doesn't install it.",
    ["cd studio && npm ci"]);
} else {
  const npm = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ls", "--depth=0", "--json"], { cwd: STUDIO, encoding: "utf8", shell: process.platform === "win32" });
  let problems = [];
  try {
    problems = JSON.parse(npm.stdout || "{}").problems ?? [];
  } catch {
    problems = npm.status ? ["npm ls could not read the tree"] : [];
  }
  if (problems.length)
    report("fail", "Installed packages don't match package.json", problems.slice(0, 6).join("\n    "), [
      "cd studio && rm -rf node_modules && npm ci",
    ]);
  else report("ok", "Installed packages match package.json and the lockfile");

  const sanity = installed("sanity");
  if (sanity) report("ok", `sanity ${sanity.version}`);

  // one React, one styled-components, one Sanity UI: two copies break hooks, themes and styles
  for (const name of ["react", "react-dom", "styled-components", "@sanity/ui"]) {
    const ours = installed(name);
    const sanitys = installed(name, join(STUDIO, "node_modules", "sanity"));
    if (!ours) {
      report("fail", `${name} is not installed in studio/`, null, ["cd studio && npm ci"]);
    } else if (sanitys && sanitys.path !== ours.path) {
      report("fail", `Two copies of ${name}: ${ours.version} and ${sanitys.version}`,
        "Sanity and our components would each use their own copy: invalid hook calls, lost themes, broken styles.",
        ["cd studio && npm dedupe", "still two? rm -rf node_modules package-lock.json && npm install"]);
    } else report("ok", `one copy of ${name} (${ours.version})`);
  }

  // React from the site's folder must never be the one the Studio uses
  const react = installed("react");
  if (react && !react.path.startsWith(join(STUDIO, "node_modules"))) {
    report("fail", "The Studio is resolving React from outside studio/", react.path, ["cd studio && npm ci"]);
  }
}

/* ───────── 3. environment ───────── */

section("Settings (studio/.env)");
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2").replace(/\s+#.*$/, "").trim();
  }
  return out;
}
// the same files, in the same order, that `sanity dev` loads (Vite's loadEnv, mode "development")
const envFiles = [".env", ".env.local", ".env.development", ".env.development.local"];
const env = Object.assign({}, ...envFiles.map((f) => readEnvFile(join(STUDIO, f))));
for (const key of Object.keys(env)) if (process.env[key]) env[key] = process.env[key];
const found = envFiles.filter((f) => existsSync(join(STUDIO, f)));
const siteEnv = Object.assign({}, ...[".env", ".env.local"].map((f) => readEnvFile(join(SITE, f))));

const projectId = env.SANITY_STUDIO_PROJECT_ID ?? "";
const dataset = env.SANITY_STUDIO_DATASET || "production";
if (!found.length) {
  const hint = siteEnv.NEXT_PUBLIC_SANITY_PROJECT_ID
    ? `The site's .env.local has NEXT_PUBLIC_SANITY_PROJECT_ID=${siteEnv.NEXT_PUBLIC_SANITY_PROJECT_ID}, but the Studio doesn't read the site's files.`
    : "The Studio reads its settings only from studio/.env.";
  report("fail", "No studio/.env", hint, [
    "cd studio && cp .env.example .env",
    `set SANITY_STUDIO_PROJECT_ID=${siteEnv.NEXT_PUBLIC_SANITY_PROJECT_ID || "<your project id>"} and SANITY_STUDIO_DATASET=production`,
    "restart `npm run dev` (settings are read once, at startup)",
  ]);
} else if (!projectId) {
  report("fail", `SANITY_STUDIO_PROJECT_ID is empty (in ${found.join(", ")})`,
    "Without it the Studio stops with a configuration error.",
    [`add SANITY_STUDIO_PROJECT_ID=${siteEnv.NEXT_PUBLIC_SANITY_PROJECT_ID || "<id from sanity.io/manage>"}`, "restart `npm run dev`"]);
} else if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
  report("fail", `SANITY_STUDIO_PROJECT_ID="${projectId}" isn't a project id`,
    "Project ids are lowercase letters and digits, like a1b2c3d4 (the name of the project is not its id).",
    ["copy the Project ID from sanity.io/manage > your project"]);
} else report("ok", `project ${projectId}, dataset ${dataset} (from ${found.join(", ")})`);

if (projectId && siteEnv.NEXT_PUBLIC_SANITY_PROJECT_ID && siteEnv.NEXT_PUBLIC_SANITY_PROJECT_ID !== projectId)
  report("warn", `The site reads project ${siteEnv.NEXT_PUBLIC_SANITY_PROJECT_ID}, the Studio edits project ${projectId}`,
    "Edits would never show up on the site.", ["use the same id in studio/.env and in the site's .env.local"]);
if (siteEnv.NEXT_PUBLIC_SANITY_DATASET && siteEnv.NEXT_PUBLIC_SANITY_DATASET !== dataset)
  report("warn", `The site reads dataset "${siteEnv.NEXT_PUBLIC_SANITY_DATASET}", the Studio edits "${dataset}"`);

// the Presentation view ("edit on the site"): the site it shows, and the token that site needs to read drafts
const deployEnv = Object.assign({}, ...[".env", ".env.local", ".env.production", ".env.production.local"].map((f) => readEnvFile(join(STUDIO, f))));
// without SANITY_STUDIO_PREVIEW_URL: the local site in development, LIVE_SITE (sanity.config.ts) once deployed
for (const [when, value, fallback] of [
  ["npm run dev", env.SANITY_STUDIO_PREVIEW_URL, "http://localhost:3000"],
  ["npm run deploy", deployEnv.SANITY_STUDIO_PREVIEW_URL, "the live site (LIVE_SITE in sanity.config.ts)"],
]) {
  if (!value) report("ok", `${when}: edit on the site shows ${fallback}`);
  else if (!/^https?:\/\/[^/\s]+/.test(value))
    report("fail", `SANITY_STUDIO_PREVIEW_URL="${value}" isn't a web address`, null,
      ["the site's address, e.g. https://www.lalibakery.co.il, or remove the line to use the default"]);
  else if (when === "npm run deploy" && /localhost|127\.0\.0\.1/.test(value))
    report("warn", `After ${when}, edit on the site would show ${value}`,
      "The hosted Studio would look for the site on the computer of whoever opens it.",
      ["remove SANITY_STUDIO_PREVIEW_URL from studio/.env.production (the default is the live site), or put the live site's address there"]);
  else report("ok", `${when}: edit on the site shows ${value}`);
}

// the hosted Studio's own address: https://<name>.sanity.studio, where SANITY_STUDIO_HOSTNAME is <name>
const hostname = (deployEnv.SANITY_STUDIO_HOSTNAME ?? "").trim();
const hostName = hostname.toLowerCase().replace(/^https?:\/\//, "").replace(/\.sanity\.studio\/?$/, "");
if (!hostname) report("info", "SANITY_STUDIO_HOSTNAME is empty: the first `npm run deploy` asks for the Studio's name");
else if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(hostName))
  report("fail", `SANITY_STUDIO_HOSTNAME="${hostname}" isn't a Studio name`,
    "It's only the <name> in https://<name>.sanity.studio. A web address like http://localhost:3000 is the site, which goes in SANITY_STUDIO_PREVIEW_URL (studio/.env.production).",
    ["in studio/.env: SANITY_STUDIO_HOSTNAME=lalibakery (lowercase English letters, digits and dashes)"]);
else report("ok", `The hosted Studio: https://${hostName}.sanity.studio`);
if (existsSync(join(SITE, ".env.local")) && !siteEnv.SANITY_API_READ_TOKEN)
  report("warn", "The site's .env.local has no SANITY_API_READ_TOKEN",
    "The site works, but edit on the site can't show drafts without a Viewer token.",
    ["sanity.io/manage > your project > API > Tokens > Add API token, permission Viewer",
      "add it to the site's .env.local as SANITY_API_READ_TOKEN=…, and restart the site"]);

/* ───────── 4. the port ───────── */

section(`Port ${PORT}`);
const portFree = await new Promise((resolve) => {
  const server = createServer();
  server.once("error", (e) => resolve(e.code !== "EADDRINUSE"));
  server.once("listening", () => server.close(() => resolve(true)));
  server.listen(PORT, "localhost");
});
if (portFree) report("ok", `${PORT} is free`);
else
  report("warn", `Something is already listening on ${PORT}`,
    "Usually another Studio (an old terminal tab). Two dev servers on one project behave erratically.",
    [
      process.platform === "win32" ? `find it: netstat -ano | findstr :${PORT}` : `find it: lsof -i :${PORT}`,
      "stop it, or run this one on another port: npm run dev -- --port 3334 (and add that origin to CORS)",
    ]);

/* ───────── 5. the project over the network ───────── */

section("The project on sanity.io");
if (!/^[a-z0-9][a-z0-9-]*$/.test(projectId)) {
  report("info", "Skipped: needs a valid project id first");
} else {
  const url = `https://${projectId}.api.sanity.io/${API_VERSION}/data/query/${dataset}?query=${encodeURIComponent("count(*)")}`;
  let res;
  try {
    res = await fetch(url, { headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    report("warn", "Couldn't reach api.sanity.io", `${e.cause?.code ?? e.name}: check the internet connection, VPN or a proxy/firewall.`);
  }
  // Sanity answers in JSON; anything else came from something in between (a proxy, a firewall, a captive portal)
  if (res && !/json/i.test(res.headers.get("content-type") ?? "")) {
    const text = (await res.text().catch(() => "")).split("\n")[0].slice(0, 160);
    report("warn", `Something between you and Sanity answered instead (${res.status})`, text || null,
      ["check the VPN, proxy or firewall on this network, then run the doctor again"]);
    res = undefined;
  }
  if (res) {
    const body = await res.json().catch(() => ({}));
    const message = body?.message || body?.error?.description || body?.error || "";
    if (res.ok) report("ok", `Project and dataset exist, ${body.result} published documents`, dataset === "production" && body.result === 0 ? "Empty so far: run `npm run seed` to load the site's current content." : null);
    else if (res.status === 404 && /dataset/i.test(String(message)))
      report("fail", `Dataset "${dataset}" doesn't exist in project ${projectId}`, null, [`npx sanity dataset create ${dataset} --visibility public`]);
    else if (res.status === 404)
      report("fail", `No project with id ${projectId}`, String(message), ["check the id at sanity.io/manage"]);
    else if (res.status === 401 || res.status === 403)
      report("info", `The dataset "${dataset}" is private`, "Fine for the Studio (you sign in). The site then needs SANITY_API_READ_TOKEN.");
    else report("warn", `Sanity answered ${res.status}`, String(message));

    const allow = res.headers.get("access-control-allow-origin");
    const creds = res.headers.get("access-control-allow-credentials");
    if (allow === ORIGIN && creds === "true") report("ok", `${ORIGIN} looks allowed (CORS, with credentials)`);
    else
      report("warn", `${ORIGIN} doesn't look allowed in CORS${allow ? ` (answered for ${allow})` : ""}`,
        "The Studio then fails to sign in or shows a CORS screen. Use exactly this address: 127.0.0.1 is a different origin.",
        [`npx sanity cors add ${ORIGIN} --credentials`, "check: npx sanity cors list"]);
  }
}

/* ───────── summary ───────── */

console.log();
const fails = results.filter((r) => r === "fail").length;
const warns = results.filter((r) => r === "warn").length;
if (fails) console.log(color(31, `${fails} problem(s) to fix first`) + (warns ? `, ${warns} warning(s)` : "") + ". Fix, then run the doctor again.");
else if (warns) console.log(color(33, `No blockers, ${warns} warning(s).`));
else console.log(color(32, "All good."));
console.log(`Still odd? Clear the Studio's caches: npm run reset   (then npm run dev, and hard-reload the browser tab)`);
process.exit(fails ? 1 : 0);
