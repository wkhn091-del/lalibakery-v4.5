/**
 * The site's legal pages, fixed: the footer, the checkout's consent checkbox and the cookie banner
 * link to exactly these. The owner (or her lawyer) writes their text in the Studio. Each is one
 * document with a fixed id, "legal-<key>"; the page's address on the site is /legal/<slug>.
 * (The accessibility statement already has its own page, edited in "הגדרות כלליות".)
 */
export const LEGAL_PAGES = [
  { key: "terms", slug: "terms", title: "תקנון ותנאי שימוש" },
  { key: "privacy", slug: "privacy", title: "מדיניות פרטיות" },
  { key: "shipping", slug: "shipping", title: "משלוחים ואיסוף" },
  { key: "cancellation", slug: "cancellation", title: "ביטולים והחזרים" },
  { key: "allergens", slug: "allergens", title: "כשרות ואלרגנים" },
] as const;

export type LegalKey = (typeof LEGAL_PAGES)[number]["key"];

export const legalId = (key: LegalKey) => `legal-${key}`;
