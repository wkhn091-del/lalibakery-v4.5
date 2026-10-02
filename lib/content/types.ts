/*
  The shape of every text on the site. content.ts holds the built-in version; the Studio's three
  documents hold the owner's ("הגדרות כלליות", "דף הבית", "דף הזמנת עוגה": studio/schemaTypes/site);
  sanity/content.ts lays the owner's over the built-in field by field, and the pages hand the
  result to the components. Field names here and in the Studio are the same, one to one.

  A few names are chosen with the Studio's preview in mind: in draft mode every text carries an
  invisible link to its field, except fields whose name says they aren't text to click on (href,
  url, email, anything under seo). That's why the order's "theme" is called "idea" here.
*/
import type { OrderWords } from "@/lib/order/model";

/** one row of opening hours. open/close "HH:MM", both empty on a day off */
export type Hours = { label: string; days: number[]; open: string; close: string };
export type SocialKey = "instagram" | "facebook" | "tiktok";
export type NavItem = { label: string; href: string };

export type SiteSettings = {
  /** the browser tab, Google, and the preview when a link is shared */
  seo: { title: string; description: string };
  business: {
    name: string;
    /** "LALIBAKERY": the hero's name for screen readers, and the logo on the 404 page */
    wordmark: string;
    /** the logo in the hero and the footer, for screen readers */
    logoAlt: string;
    /** as shown: "050-873-9090". The call and WhatsApp links are made from it */
    phone: string;
    /** WhatsApp, when it isn't the same number; empty = the phone */
    whatsapp: string;
    email: string;
    /** empty = not shown (and no Waze button) */
    address: string;
    hours: Hours[];
    social: Record<SocialKey, { label: string; url: string }>;
  };
  header: { navLabel: string; nav: NavItem[]; order: string; call: string };
  floatingCta: string;
  skipLink: string;
  /** every price on the site: "החל מ-{price}" */
  priceFrom: string;
  openStatus: { openUntil: string; opensToday: string; opensLater: string; tomorrow: string; onDay: string; days: string[] };
  footer: {
    tagline: string;
    about: string;
    hoursTitle: string;
    closed: string;
    contactTitle: string;
    whatsapp: string;
    waze: string;
    socialTitle: string;
    socialNote: string;
    socialSoon: string;
    rights: string;
    accessibility: string;
    backToTop: string;
  };
  accessibility: {
    title: string;
    intro: string;
    doneTitle: string;
    done: string[];
    contactTitle: string;
    contactText: string;
    whatsapp: string;
    coordinatorLabel: string;
    coordinator: string;
    updatedLabel: string;
    updated: string;
    back: string;
  };
  notFound: { title: string; text: string; back: string };
};

export type HomeContent = {
  hero: { lines: string[]; sub: string; cta: string; trust: string; imageAlt: string; inscription: string };
  pain: { label: string; paragraph: string; imageAlt: string; caption: string };
  failed: { title: string; items: string[]; conclusion: string; question: string; events: string[] };
  mechanism: {
    title: string;
    lead: string;
    stepLabel: string;
    steps: { title: string; what: string; why: string; note: string; alt: string }[];
  };
  proof: {
    title: string;
    lead: string;
    /** value null: the number isn't known yet, and `todo` is shown in its place */
    stats: { value: number | null; suffix: string; label: string; todo: string }[];
    occasionsLabel: string;
    occasions: string[];
  };
  deliverables: { title: string; imageAlt: string; caption: string; items: { outcome: string; part: string }[] };
  start: { title: string; steps: { who: string; what: string; when: string }[]; cta: string };
  faq: { title: string; contact: { title: string; text: string; whatsapp: string }; items: { q: string; a: string }[] };
  closing: { lines: string[]; cta: string; after: string; imageAlt: string };
};

/** every text of the cake builder (components/CustomCakeWizard.tsx) */
export type WizardText = {
  eyebrow: string;
  title: string;
  intro: string;
  /** exactly five: the builder has five steps */
  steps: { title: string; heading: string; sub: string }[];
  stepOf: string;
  progressLabel: string;
  next: string;
  toSummary: string;
  back: string;
  edit: string;
  figure: string;
  figureHint: string;
  size: string;
  base: string;
  perFigure: string;
  totalFor: string;
  /** under the size and base step's heading: the cake starts from the classics */
  startNote: string;
  cream: string;
  creamTags: { dairy: string; parve: string; nuts: string; gluten: string };
  notFor: string;
  filling: string;
  fillingHint: string;
  noFilling: string;
  /** the tabs over a long list of bases, creams and fillings */
  groups: { all: string; classic: string; chocolate: string; fruity: string; nutty: string; sweets: string; special: string };
  colors: string;
  colorsHint: string;
  optional: string;
  ideaPlaceholder: string;
  messagePlaceholder: string;
  messagePreview: string;
  addons: string;
  addonsHint: string;
  addonColor: string;
  addonAnyColor: string;
  addonText: string;
  addonQty: string;
  exclusionsLegend: string;
  nutsPreset: string;
  allergy: string;
  allergyNote: string;
  notes: string;
  notesPlaceholder: string;
  date: string;
  yourCake: string;
  notChosen: string;
  noCategory: string;
  ready: string;
  addToCart: string;
  adding: string;
  quote: string;
  quoteNote: string;
  approval: string;
  blocked: string;
  failed: string;
  added: string;
  another: string;
  /** the live 3D picture of the cake being built (components/builder3d) */
  preview: { label: string; hint: string; note: string };
  /** sending the cake as a request saved for the owner (when the shop's database is set up) */
  request: {
    title: string;
    note: string;
    name: string;
    phone: string;
    email: string;
    dateAny: string;
    few: string;
    full: string;
    robot: string;
    send: string;
    sending: string;
    orWhatsapp: string;
    sent: string;
    /** {code}: the request's number */
    sentNote: string;
    sentImage: string;
    sentWhatsapp: string;
    errors: { fields: string; name: string; phone: string; email: string; robot: string; busy: string; date: string; dateFull: string; tooMany: string; error: string };
  };
  errors: { category: string; figure: string; size: string; base: string; cream: string };
  /** the summary, the WhatsApp message, the colour and removal names (lib/order/model.ts) */
  order: OrderWords;
};

export type CakePageContent = {
  seo: { title: string; description: string };
  /** the page's heading for screen readers (the visible one is the builder's own) */
  heading: string;
  back: string;
  wizard: WizardText;
};
