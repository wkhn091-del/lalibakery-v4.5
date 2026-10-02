/*
  What the site accepts from the Studio's three text documents, field by field (how
  lib/content/merge.ts applies it: sanity/content.ts). The Studio's forms say the same "no" first
  (studio/schemaTypes/site/spec.ts); lib/content/spec.test.ts checks the two agree.
*/
import { international, ISRAELI } from "@/lib/content/contact";
import type { Rules } from "@/lib/content/merge";

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (v: unknown) => (typeof v === "string" ? v : "");
/** a number the call and WhatsApp links can dial (lib/content/contact.ts) */
const phone = (v: unknown) => ISRAELI.test(international(text(v)));
const link = (v: unknown) => /^https:\/\/\S+$/.test(text(v));
/** the 3D cake's font: the Hebrew alphabet and the space; past 12 letters they wrap round the back */
export const INSCRIPTION = /^[א-ת ]{1,12}$/;
/** where a menu item may lead: the homepage's sections and the site's pages */
export const NAV_TARGETS = ["#proof", "#mechanism", "#faq", "#closing", "#contact", "#top", "/custom-cake", "/products", "/accessibility", "/"];

export const SETTINGS_RULES: Rules = {
  optional: [
    "business.whatsapp",
    "business.address",
    "business.hours[].open",
    "business.hours[].close",
    "business.social.instagram.url",
    "business.social.facebook.url",
    "business.social.tiktok.url",
  ],
  length: { "business.hours": [1, 7], "header.nav": [1, 6], "openStatus.days": [7, 7], "accessibility.done": [1, 20] },
  valid: {
    "business.phone": phone,
    "business.whatsapp": phone,
    "business.hours[].open": (v) => TIME.test(text(v)),
    "business.hours[].close": (v) => TIME.test(text(v)),
    "business.hours[].days": (v) => Array.isArray(v) && v.length > 0 && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    "business.social.instagram.url": link,
    "business.social.facebook.url": link,
    "business.social.tiktok.url": link,
    "header.nav[].href": (v) => NAV_TARGETS.includes(text(v)),
    priceFrom: (v) => text(v).includes("{price}"),
  },
  // a menu link needs a text and a place to go
  drop: ["header.nav[].label", "header.nav[].href"],
};

export const HOME_RULES: Rules = {
  optional: ["hero.ctaNote", "hero.trust", "mechanism.steps[].note", "proof.stats[].suffix", "proof.stats[].todo"],
  length: {
    "hero.lines": [1, 3],
    "failed.items": [1, 12],
    "failed.events": [1, 10],
    "mechanism.steps": [1, 6],
    "proof.stats": [0, 4],
    "proof.occasions": [1, 30],
    "deliverables.items": [1, 12],
    "start.steps": [1, 6],
    "faq.items": [1, 30],
    "closing.lines": [1, 3],
  },
  // the 3D font has the Hebrew alphabet and the space, nothing else; more than 12 letters wrap
  // round to the back of the cake
  valid: { "hero.inscription": (v) => INSCRIPTION.test(text(v)) && text(v).trim() !== "" },
  clean: ["hero.inscription"],
};

export const CAKE_PAGE_RULES: Rules = {
  // the builder has exactly five steps
  length: { "wizard.steps": [5, 5] },
};
