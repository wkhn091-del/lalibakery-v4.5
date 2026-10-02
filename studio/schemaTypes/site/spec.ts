/*
  Every text on the site, as the Studio shows it: three documents, "הגדרות כלליות", "דף הבית" and
  "דף הזמנת עוגה", one form field for each text, with the owner's titles and hints.

  Plain data, no imports, on purpose: the Studio turns it into its forms (./index.ts), the seed
  fills the documents from the site's built-in texts by it (../../seed/seed.ts), and the site's
  tests check it field by field against the site's own texts (lib/content/spec.test.ts). The
  field names are the site's (lib/content/types.ts), one to one; the limits here (how many items
  a list takes, which texts may stay empty, which blanks a text must keep) are the ones the site
  enforces (sanity/content.ts), so the Studio says "no" before the site has to.

  Blanks: a text with `slots` is a template. {price}, {phone}… are filled in by the site; the
  owner moves them around, and `needs` are the ones she can't remove.
*/

type Base = { title: string; description?: string; fieldset?: string };

export type LineField = Base & {
  kind: "line" | "text";
  /** may be left empty: then it isn't shown (otherwise required) */
  optional?: true;
  /** a soft limit: a warning past it, since longer texts can break the layout */
  max?: number;
  /** rows of the text box (kind "text") */
  rows?: number;
  /** the blanks this text may use: {price} is written "price" */
  slots?: string[];
  /** the blanks it must keep */
  needs?: string[];
  /** what the value must look like, and what to say when it doesn't */
  pattern?: { regex: RegExp; message: string };
  /** a fixed list of values to pick from (a dropdown) */
  choices?: { title: string; value: string }[];
};
export type NumberField = Base & { kind: "number"; optional?: true; min?: number; max?: number };
/** days of the week, 0 = Sunday … 6 = Saturday, as checkboxes */
export type DaysField = Base & { kind: "days" };
/** "HH:MM" */
export type TimeField = Base & { kind: "time"; optional?: true };
export type PhoneField = Base & { kind: "phone"; optional?: true };
export type EmailField = Base & { kind: "email" };
/** https:// only */
export type UrlField = Base & { kind: "url"; optional?: true };
export type ObjectField = Base & {
  kind: "object";
  fields: Fields;
  /** collapsible groups of fields inside it */
  fieldsets?: { name: string; title: string; description?: string }[];
  /** fields that are filled in together or left empty together */
  together?: string[];
  /** shown folded; the owner opens it */
  collapsed?: true;
};
export type ListField = Base & {
  kind: "list";
  of: LineField | ObjectField;
  /** how many items the page takes */
  min: number;
  max: number;
  /** a fixed set: items can't be added, removed or reordered (the builder's five steps) */
  fixed?: true;
  /** the name of an item's type in the dataset (object items) */
  item?: string;
  /** the item's field that names it in the list */
  label?: string;
};
export type Field = LineField | NumberField | DaysField | TimeField | PhoneField | EmailField | UrlField | ObjectField | ListField;
export type Fields = Record<string, Field>;

export type DocSpec = {
  name: string;
  title: string;
  /** the document's fixed id: one of each */
  id: string;
  /** the site's pages this document is on (the Studio's preview links to them) */
  pages: { title: string; href: string }[];
  groups: { name: string; title: string }[];
  fields: Record<string, Field & { group: string }>;
};

/* ───────── building blocks ───────── */

type LineOptions = Omit<LineField, "kind" | "title">;
const line = (title: string, o: LineOptions = {}): LineField => ({ kind: "line", title, ...o });
const para = (title: string, o: LineOptions = {}): LineField => ({ kind: "text", title, rows: 3, ...o });
const obj = (title: string, fields: Fields, o: Omit<ObjectField, "kind" | "title" | "fields"> = {}): ObjectField => ({ kind: "object", title, fields, ...o });
const list = (title: string, of: LineField | ObjectField, [min, max]: [number, number], o: Omit<ListField, "kind" | "title" | "of" | "min" | "max"> = {}): ListField => ({ kind: "list", title, of, min, max, ...o });
const optional = true as const;

const blanks = (...names: string[]) => names.map((n) => `{${n}}`).join(", ");

/** where a menu item may lead: the homepage's sections and the site's pages (the site checks the same list) */
export const NAV_CHOICES = [
  { title: "דף הבית: עוגות שכבר יצאו מהמטבח", value: "#proof" },
  { title: "דף הבית: איך עוגה נבנית", value: "#mechanism" },
  { title: "דף הבית: שאלות", value: "#faq" },
  { title: "דף הבית: הסגירה", value: "#closing" },
  { title: "דף הבית: יצירת קשר (הפוטר)", value: "#contact" },
  { title: "דף הבית: חזרה למעלה", value: "#top" },
  { title: "דף הזמנת עוגה", value: "/custom-cake" },
  { title: "החנות", value: "/products" },
  { title: "הצהרת נגישות", value: "/accessibility" },
  { title: "דף הבית", value: "/" },
];

/** the 3D cake's font has the Hebrew alphabet and the space, nothing else; past 12 letters they wrap round the back */
export const INSCRIPTION = /^[א-ת ]{1,12}$/;

/**
 * Whether the call and WhatsApp links can dial a number typed like this: an Israeli landline or
 * mobile, in any usual form ("050-873-9090", "+972 50 873 9090", "00972…"). The site reads it the
 * same way (lib/content/contact.ts), and its tests check the two agree.
 */
export function dialable(typed: string): boolean {
  let digits = typed.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("9720")) digits = `972${digits.slice(4)}`;
  else if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  return /^972[1-9]\d{7,8}$/.test(digits);
}

const social = (title: string) =>
  obj(title, {
    label: line("השם", { description: "מה שקוראי מסך אומרים על האייקון." }),
    url: { kind: "url", title: "קישור לפרופיל", optional, description: "ריק = האייקון מוצג בלי קישור." },
  });

/* ───────── הגדרות כלליות ───────── */

export const SITE_SETTINGS: DocSpec = {
  name: "siteSettings",
  title: "הגדרות כלליות",
  id: "siteSettings",
  pages: [
    { title: "דף הבית", href: "/" },
    { title: "דף הזמנת עוגה", href: "/custom-cake" },
    { title: "הצהרת נגישות", href: "/accessibility" },
  ],
  groups: [
    { name: "business", title: "פרטי העסק" },
    { name: "header", title: "תפריט וכפתורים" },
    { name: "footer", title: "פוטר ושעות" },
    { name: "pages", title: "דפים נוספים" },
    { name: "seo", title: "גוגל ושיתוף" },
  ],
  fields: {
    seo: {
      ...obj("גוגל ושיתוף קישורים", {
        title: line("כותרת האתר", { max: 65, description: "בלשונית של הדפדפן, בתוצאות של גוגל ובתצוגה המקדימה כששולחים קישור." }),
        description: para("תיאור האתר", { max: 170, description: "השורות שגוגל מציג מתחת לכותרת." }),
      }),
      group: "seo",
    },
    business: {
      ...obj("פרטי העסק", {
        name: line("שם העסק", { max: 30, description: "בפוטר, בכותרת העליונה ובדפים הפנימיים." }),
        wordmark: line("שם העסק כמו בלוגו", { description: "מה שקוראי מסך אומרים על הלוגו בראש דף הבית." }),
        logoAlt: line("תיאור הלוגו", { description: "לקוראי מסך: הלוגו בפתיחה ובפוטר." }),
        phone: { kind: "phone", title: "טלפון", description: "כמו שיוצג באתר, למשל 050-873-9090. ממנו נבנים הקישורים לחיוג ולוואטסאפ." },
        whatsapp: { kind: "phone", title: "מספר וואטסאפ", optional, description: "רק אם הוא שונה מהטלפון. ריק = הטלפון." },
        email: { kind: "email", title: "מייל" },
        address: line("כתובת לאיסוף", { optional, description: "ריק = לא מוצגת. כשיש כתובת, בפוטר מופיע גם כפתור ניווט ב-Waze." }),
        hours: list(
          "שעות פעילות",
          obj(
            "שורה",
            {
              label: line("הימים, כמו שיופיעו", { description: "למשל: ראשון–חמישי" }),
              days: { kind: "days", title: "אילו ימים", description: "לפיהם מחושבת השורה \"פתוח עכשיו\"." },
              open: { kind: "time", title: "פתיחה", optional, description: "למשל 08:00. ביום סגור: ריק." },
              close: { kind: "time", title: "סגירה", optional, description: "למשל 19:00. ביום סגור: ריק." },
            },
            { together: ["open", "close"] },
          ),
          [1, 7],
          { item: "hoursRow", label: "label", description: "שורה לכל קבוצת ימים, בסדר שבו יופיעו בפוטר." },
        ),
        social: obj("רשתות חברתיות", { instagram: social("אינסטגרם"), facebook: social("פייסבוק"), tiktok: social("טיקטוק") }),
      }),
      group: "business",
    },
    header: {
      ...obj("הכותרת העליונה", {
        navLabel: line("שם התפריט לקוראי מסך"),
        nav: list(
          "קישורים בתפריט",
          obj("קישור", {
            label: line("הטקסט", { max: 20 }),
            href: line("לאן הוא מוביל", { choices: NAV_CHOICES }),
          }),
          [1, 6],
          { item: "navItem", label: "label", description: "בסדר שבו יופיעו (אפשר לגרור)." },
        ),
        order: line("כפתור ההזמנה", { max: 20 }),
        call: line("כפתור החיוג, לקוראי מסך", { slots: ["phone"], description: `${blanks("phone")} = מספר הטלפון.` }),
      }),
      group: "header",
    },
    floatingCta: { ...line("הכפתור הצף של וואטסאפ", { description: "מה שקוראי מסך אומרים עליו, ומה שמופיע כשמרחפים מעליו." }), group: "header" },
    skipLink: { ...line("\"דלג לתוכן\"", { description: "הקישור הראשון בכל דף, למי שמנווט במקלדת." }), group: "header" },
    priceFrom: {
      ...line("איך מוצג מחיר", {
        slots: ["price"],
        needs: ["price"],
        description: `בכל מקום באתר: בגלריה ובבונה העוגה. ${blanks("price")} = המחיר, למשל "החל מ-${"{price}"}" יוצג "החל מ-1,200 ₪".`,
      }),
      group: "header",
    },
    openStatus: {
      ...obj("השורה \"פתוח עכשיו\" בפוטר", {
        openUntil: line("כשפתוח", { slots: ["close"], description: `${blanks("close")} = שעת הסגירה.` }),
        opensToday: line("כשסגור, ונפתח היום", { slots: ["open"], description: `${blanks("open")} = שעת הפתיחה.` }),
        opensLater: line("כשסגור, ונפתח ביום אחר", { slots: ["when", "open"], description: `${blanks("when")} = "מחר" או "ביום…" (למטה), ${blanks("open")} = שעת הפתיחה.` }),
        tomorrow: line("\"מחר\""),
        onDay: line("\"ביום…\"", { slots: ["day"], description: `${blanks("day")} = שם היום.` }),
        days: list("שמות הימים", line("יום"), [7, 7], { fixed: true, description: "מראשון עד שבת." }),
      }),
      group: "footer",
    },
    footer: {
      ...obj("הפוטר", {
        tagline: line("הסלוגן", { description: "בשורת הזכויות בתחתית." }),
        about: para("על העסק"),
        hoursTitle: line("כותרת: שעות"),
        closed: line("יום סגור", { description: "מה שמופיע במקום השעות ביום סגור." }),
        contactTitle: line("כותרת: יצירת קשר"),
        whatsapp: line("הקישור לוואטסאפ"),
        waze: line("הכפתור לניווט", { description: "מתחת לכתובת, כשיש כתובת." }),
        socialTitle: line("כותרת: רשתות"),
        socialNote: line("השורה מתחת לאייקונים"),
        socialSoon: line("אייקון בלי קישור", { description: "מה שמופיע כשמרחפים מעל אייקון שעוד אין לו קישור." }),
        rights: line("זכויות"),
        accessibility: line("הקישור להצהרת הנגישות"),
        backToTop: line("\"חזרה למעלה\""),
      }),
      group: "footer",
    },
    accessibility: {
      ...obj("הצהרת נגישות", {
        title: line("כותרת"),
        intro: para("פתיחה"),
        doneTitle: line("כותרת: מה עשינו"),
        done: list("מה עשינו באתר", line("שורה"), [1, 20]),
        contactTitle: line("כותרת: פנייה"),
        contactText: para("איך פונים"),
        whatsapp: line("הקישור לוואטסאפ"),
        coordinatorLabel: line("\"רכז/ת נגישות\""),
        coordinator: line("שם הרכז/ת ודרך פנייה"),
        updatedLabel: line("\"עודכן לאחרונה\""),
        updated: line("תאריך העדכון"),
        back: line("הקישור חזרה"),
      }),
      group: "pages",
    },
    notFound: {
      ...obj("הדף שלא נמצא (404)", {
        title: line("כותרת"),
        text: line("טקסט"),
        back: line("הכפתור"),
      }),
      group: "pages",
    },
  },
};

/* ───────── דף הבית ───────── */

const alt = (what: string) => line(`מה רואים ב${what}`, { description: "לקוראי מסך ולגוגל. התמונה עצמה נשארת כמו שהיא." });

export const HOME_PAGE: DocSpec = {
  name: "homePage",
  title: "דף הבית",
  id: "homePage",
  pages: [{ title: "דף הבית", href: "/" }],
  groups: [
    { name: "hero", title: "פתיחה" },
    { name: "pain", title: "הפעם הקודמת" },
    { name: "failed", title: "מה כבר ניסיתם" },
    { name: "mechanism", title: "איך עוגה נבנית" },
    { name: "proof", title: "עוגות שיצאו" },
    { name: "deliverables", title: "מה מקבלים" },
    { name: "start", title: "איך מתחילים" },
    { name: "faq", title: "שאלות" },
    { name: "closing", title: "סגירה" },
  ],
  fields: {
    hero: {
      ...obj("פתיחה", {
        lines: list("הכותרת הגדולה", line("שורה", { max: 32 }), [1, 3], { description: "כל שורה נחשפת בנפרד. עד 3 שורות." }),
        sub: para("שורת המשנה", { max: 160 }),
        cta: line("הכפתור", { max: 32, description: "מוביל לבונה העוגה." }),
        ctaNote: line("מתחת לכפתור", { optional, max: 80, description: "מה מחכה אחרי הלחיצה. ריק = לא מוצג." }),
        trust: line("שורת אמון", { optional, description: "ליד הכפתור. ריק = לא מוצגת." }),
        imageAlt: alt("תמונת הפתיחה"),
        pause: line("כפתור עצירת התנועה", { description: "על העוגה המסתובבת. חובה לפי תקן הנגישות: תנועה שנמשכת יותר מ-5 שניות צריכה כפתור עצירה." }),
        play: line("כפתור הפעלת התנועה"),
        inscription: line("הכיתוב על העוגה בתלת־ממד", {
          pattern: { regex: INSCRIPTION, message: "רק אותיות עבריות ורווחים, עד 12 תווים (אלה האותיות שיש לעוגה)." },
          description: "אותיות עבריות ורווחים בלבד, עד 12 תווים.",
        }),
      }),
      group: "hero",
    },
    pain: {
      ...obj("מה קרה בפעם הקודמת", {
        label: line("שם הסקשן לקוראי מסך"),
        paragraph: para("הפסקה", { rows: 5, description: "המילים נדלקות אחת אחת בגלילה." }),
        imageAlt: alt("תמונה"),
        caption: line("הכיתוב מתחת לתמונה"),
      }),
      group: "pain",
    },
    failed: {
      ...obj("מה כבר ניסיתם", {
        title: line("כותרת"),
        items: list("מה ניסו", line("שורה"), [1, 12], { description: "כל שורה נמחקת בקו בגלילה." }),
        conclusion: para("המסקנה"),
        question: line("השאלה"),
        events: list("אירועים", line("אירוע", { max: 24 }), [1, 10], { description: "כל אירוע הוא כפתור שפותח את בונה העוגה." }),
      }),
      group: "failed",
    },
    mechanism: {
      ...obj("איך עוגה נבנית", {
        title: line("כותרת"),
        lead: para("פתיחה"),
        stepLabel: line("מספור השלבים", { slots: ["n", "total"], description: `${blanks("n")} = מספר השלב, ${blanks("total")} = כמה שלבים יש.` }),
        steps: list(
          "השלבים",
          obj("שלב", {
            title: line("כותרת"),
            what: para("מה קורה"),
            why: para("למה זה חשוב"),
            note: line("הערה", { optional, description: "ריק = אין." }),
            alt: alt("תמונה"),
          }),
          [1, 6],
          { item: "mechanismStep", label: "title", description: "כרטיס לכל שלב. התמונות לפי הסדר: ארבע תמונות, שחוזרות אם יש יותר שלבים." },
        ),
      }),
      group: "mechanism",
    },
    proof: {
      ...obj("עוגות שכבר יצאו מהמטבח", {
        title: line("כותרת"),
        lead: para("פתיחה"),
        stats: list(
          "מספרים",
          obj("מספר", {
            value: { kind: "number", title: "המספר", optional, min: 0, description: "מספר אמיתי בלבד. ריק = מוצג הטקסט שלמטה במקומו." },
            suffix: line("אחרי המספר", { optional, description: "למשל +" }),
            label: line("מה סופרים"),
            todo: line("כשאין מספר", { optional, description: "מוצג כל עוד המספר ריק." }),
          }),
          [0, 4],
          { item: "stat", label: "label", description: "המספרים סופרים מאפס כשהם נכנסים למסך. הגלריה עצמה: \"עוגות בגלריה\"." },
        ),
        occasionsLabel: line("שם הפס הנע לקוראי מסך"),
        occasions: list("אירועים בפס הנע", line("אירוע"), [1, 30]),
        cta: line("הכפתור מתחת לגלריה", { max: 40, description: "מוביל לבונה העוגה." }),
      }),
      group: "proof",
    },
    deliverables: {
      ...obj("מה מקבלים בכל הזמנה", {
        title: line("כותרת"),
        imageAlt: alt("תמונה"),
        caption: line("הכיתוב מתחת לתמונה"),
        items: list(
          "מה מקבלים",
          obj("שורה", { outcome: line("מה מקבלים"), part: line("איך") }),
          [1, 12],
          { item: "deliverable", label: "outcome" },
        ),
      }),
      group: "deliverables",
    },
    start: {
      ...obj("איך מתחילים", {
        title: line("כותרת"),
        steps: list(
          "הצעדים",
          obj("צעד", { who: line("מי"), what: para("מה עושים"), when: line("כמה זמן") }),
          [1, 6],
          { item: "startStep", label: "who" },
        ),
        cta: line("הכפתור", { max: 32, description: "מוביל לבונה העוגה." }),
      }),
      group: "start",
    },
    faq: {
      ...obj("שאלות שחוזרות", {
        title: line("כותרת"),
        contact: obj("הכרטיס \"לא מצאתם?\"", {
          title: line("כותרת"),
          text: line("טקסט"),
          whatsapp: line("הקישור לוואטסאפ"),
        }),
        items: list("שאלות ותשובות", obj("שאלה", { q: line("השאלה"), a: para("התשובה", { rows: 4 }) }), [1, 30], { item: "faqItem", label: "q" }),
      }),
      group: "faq",
    },
    closing: {
      ...obj("סגירה", {
        lines: list("הכותרת הגדולה", line("שורה", { max: 32 }), [1, 3], { description: "כל שורה נחשפת בנפרד. עד 3 שורות." }),
        cta: line("הכפתור", { max: 32, description: "מוביל לבונה העוגה." }),
        after: para("מה קורה אחרי ההודעה"),
        imageAlt: alt("תמונה"),
      }),
      group: "closing",
    },
  },
};

/* ───────── דף הזמנת עוגה ───────── */

/*
  The order's words (wizard.order): the summary, the WhatsApp message, the colour and removal
  names. The price format isn't here: it's the site's one format ("הגדרות כלליות").
*/
const ORDER_SPEC: ObjectField = obj("הסיכום, ההודעה בוואטסאפ, צבעים והסרות", {
  greeting: para("פתיחת ההודעה בוואטסאפ", { description: "השורה הראשונה בהודעה. אחריה כל פרטי העוגה." }),
  surprise: line("\"תבחרו אתם\"", { description: "הבחירה בצבעים, כשמשאירים לכם." }),
  none: line("\"אין\"", { description: "כשאין בקשות הסרה." }),
  allergyYes: line("כשסומנה אלרגיה"),
  parve: line("\"בגרסה פרווה\"", { description: "אחרי הקרם, כשביקשו ללא מוצרי חלב." }),
  servings: line("מספר מנות", { slots: ["n"], description: `${blanks("n")} = המספר.` }),
  servingsRange: line("טווח מנות", { slots: ["min", "max"], description: `${blanks("min")} עד ${blanks("max")}.` }),
  labels: obj(
    "שמות השורות",
    {
      category: line("סוג העוגה"),
      figure: line("ספרה או אות"),
      size: line("גודל"),
      price: line("מחיר"),
      base: line("בסיס"),
      layers: line("שכבות"),
      cream: line("קרם"),
      filling: line("מילוי"),
      coating: line("ציפוי"),
      colors: line("צבעים"),
      idea: line("נושא או השראה", { description: "גם הכותרת של השדה בשלב 3." }),
      inspiration: line("השראה מהגלריה"),
      liked: line("עוד עוגות שאהבו"),
      link: line("קישור להשראה"),
      message: line("כיתוב על העוגה", { description: "גם הכותרת של השדה בשלב 3." }),
      exclusions: line("בקשות הסרה"),
      allergy: line("אלרגיה"),
      notes: line("בקשות נוספות"),
      date: line("תאריך"),
      addons: line("תוספות"),
    },
    { description: "בסיכום, בעוגה שבצד ובהודעה בוואטסאפ." },
  ),
  addonColor: line("צבע של תוספת", { slots: ["color"], description: `${blanks("color")} = שם הצבע.` }),
  addonQty: line("כמות של תוספת", { slots: ["n"], description: `${blanks("n")} = המספר.` }),
  addonText: line("הטקסט של תוספת", { slots: ["text"], description: `${blanks("text")} = מה שהלקוח כתב.` }),
  addonImage: line("תוספת שהתמונה שלה נשלחת בוואטסאפ"),
  layersText: line("מספר השכבות", { slots: ["n"], description: `${blanks("n")} = המספר.` }),
  fillingLayer: line("מילוי בין שתי שכבות", {
    slots: ["n", "next", "filling"],
    description: `${blanks("n")} ו-${blanks("next")} = השכבות שהמילוי ביניהן (סופרים מלמטה), ${blanks("filling")} = המילוי.`,
  }),
  baseLayer: line("הבסיס של שכבה אחת", { slots: ["n", "base"], description: `כשהשכבות לא כולן מאותו בסיס. ${blanks("n")} = מספר השכבה (מלמטה), ${blanks("base")} = הבסיס.` }),
  fillingAll: line("אותו מילוי בכל השכבות", { slots: ["filling"], description: `${blanks("filling")} = המילוי.` }),
  exact: line("העוגה מהגלריה שרוצים בדיוק כמוה", { slots: ["title"], description: `${blanks("title")} = שם העוגה בגלריה.` }),
  keep: line("מה לשמור ממנה", { slots: ["list"], description: `${blanks("list")} = הדברים שסומנו.` }),
  keepWords: obj("הדברים שאפשר לשמור", { all: line("הכול"), colors: line("הצבעים"), decor: line("הקישוטים"), shape: line("הצורה והגודל") }),
  change: line("מה לשנות בה", { slots: ["text"], description: `${blanks("text")} = מה שהלקוח כתב.` }),
  colors: obj(
    "שמות הצבעים",
    {
      cream: line("לבן שמנת"),
      blush: line("ורוד עתיק"),
      peach: line("אפרסק"),
      sky: line("תכלת"),
      sage: line("ירוק מרווה"),
      lilac: line("לילך"),
      gold: line("זהב"),
      black: line("שחור"),
    },
    { description: "הגוונים עצמם קבועים; כאן השמות שלהם." },
  ),
  exclusions: obj(
    "בקשות ההסרה",
    {
      noNuts: obj("ללא אגוזים", { label: line("הבקשה"), note: line("הסבר") }),
      noDairy: obj("ללא מוצרי חלב", { label: line("הבקשה"), note: line("הסבר") }),
      noGluten: obj("ללא גלוטן", { label: line("הבקשה"), note: line("הסבר") }),
      noEggs: obj("ללא ביצים", { label: line("הבקשה"), note: line("הסבר") }),
      noColors: obj("ללא צבעי מאכל", { label: line("הבקשה"), note: line("הסבר") }),
      noAlcohol: obj("ללא אלכוהול", { label: line("הבקשה"), note: line("הסבר") }),
    },
    { description: "הבקשות עצמן קבועות (הבונה בודק אותן מול הקרמים); כאן המילים." },
  ),
  clash: obj("למה קרם לא מתאים", {
    nuts: line("כשמכיל אגוזים"),
    dairy: line("כשחלבי בלי גרסה פרווה"),
    gluten: line("כשמכיל גלוטן"),
  }),
  conflict: para("הודעת ההתנגשות", {
    slots: ["cream", "reason", "request"],
    description: `${blanks("cream")} = הקרם, ${blanks("reason")} = למה (למעלה), ${blanks("request")} = הבקשה.`,
  }),
  conflictFix: line("הכפתור לתיקון"),
  conflictBase: para("הודעת ההתנגשות של בסיס", {
    slots: ["base", "reason", "request"],
    description: `${blanks("base")} = הבסיס, ${blanks("reason")} = למה, ${blanks("request")} = הבקשה.`,
  }),
  conflictBaseFix: line("הכפתור לתיקון הבסיס"),
  conflictFilling: para("הודעת ההתנגשות של מילוי", {
    slots: ["filling", "reason", "request"],
    description: `${blanks("filling")} = המילוי, ${blanks("reason")} = למה, ${blanks("request")} = הבקשה.`,
  }),
  conflictFillingFix: line("הכפתור לתיקון המילוי"),
  conflictCoating: para("הודעת ההתנגשות של ציפוי", {
    slots: ["coating", "reason", "request"],
    description: `${blanks("coating")} = הציפוי, ${blanks("reason")} = למה, ${blanks("request")} = הבקשה.`,
  }),
  conflictCoatingFix: line("הכפתור לתיקון הציפוי"),
  notices: obj("הערות", {
    gluten: para("כשביקשו ללא גלוטן"),
    eggs: para("כשביקשו ללא ביצים"),
  }),
}, { collapsed: true, description: "המילים של הסיכום בשלב 5, של העוגה שבצד ושל ההודעה שנשלחת בוואטסאפ." });

const tag = (what: string) => line(what, { max: 20 });

export const CAKE_PAGE_SPEC: DocSpec = {
  name: "cakePage",
  title: "דף הזמנת עוגה",
  id: "cakePage",
  pages: [{ title: "דף הזמנת עוגה", href: "/custom-cake" }],
  groups: [
    { name: "page", title: "הדף" },
    { name: "wizard", title: "בונה העוגה" },
  ],
  fields: {
    seo: {
      ...obj("גוגל ושיתוף קישורים", {
        title: line("כותרת הדף", { max: 50, description: "בלשונית ובגוגל, ולפניה שם העסק." }),
        description: para("תיאור הדף", { max: 170 }),
      }),
      group: "page",
    },
    heading: { ...line("כותרת הדף לקוראי מסך", { description: "הכותרת הגלויה היא של הבונה (למטה)." }), group: "page" },
    back: { ...line("הקישור חזרה לדף הבית"), group: "page" },
    wizard: {
      ...obj(
        "בונה העוגה",
        {
          eyebrow: line("מעל הכותרת", { fieldset: "frame" }),
          title: line("כותרת", { fieldset: "frame" }),
          intro: para("פתיחה", { fieldset: "frame" }),
          steps: list(
            "חמשת השלבים",
            obj("שלב", {
              title: line("שם השלב", { max: 20, description: "בפס ההתקדמות." }),
              heading: line("כותרת השלב"),
              sub: para("הסבר"),
            }),
            [5, 5],
            { fixed: true, item: "wizardStep", label: "title", fieldset: "frame", description: "סוג העוגה, גודל ובסיס, קרם ועיצוב, הסרות ובקשות, סיכום. השלבים קבועים: אפשר לשנות את הטקסטים." },
          ),
          stepOf: line("מספור השלבים", { slots: ["n", "total"], fieldset: "frame", description: `${blanks("n")} = השלב, ${blanks("total")} = כמה שלבים.` }),
          progressLabel: line("שם פס ההתקדמות לקוראי מסך", { fieldset: "frame" }),

          next: line("\"המשך\"", { fieldset: "buttons" }),
          toSummary: line("\"לסיכום\"", { fieldset: "buttons" }),
          back: line("\"חזרה\"", { fieldset: "buttons" }),
          edit: line("\"עריכה\"", { fieldset: "buttons", description: "ליד כל שורה בסיכום." }),

          figure: line("השאלה על הספרה", { fieldset: "size" }),
          figureHint: line("הסבר מתחתיה", { fieldset: "size" }),
          size: line("כותרת: גודל", { fieldset: "size" }),
          base: line("כותרת: טעם הבסיס", { fieldset: "size" }),
          perFigure: line("\"לספרה\"", { fieldset: "size", description: "אחרי המנות והמחיר בעוגת מספרים." }),
          totalFor: line("סך הכול בעוגת מספרים", {
            slots: ["figure", "servings"],
            fieldset: "size",
            description: `${blanks("figure")} = הספרות שנכתבו, ${blanks("servings")} = כמה מנות.`,
          }),

          startNote: line("הסבר על נקודת ההתחלה", { fieldset: "size", description: "מתחת לכותרת של שלב הגודל והבסיס: העוגה מתחילה מהטעמים הראשונים בכל רשימה." }),
          cream: line("כותרת: קרם", { fieldset: "design" }),
          creamTags: obj(
            "התגיות על הקרמים",
            { dairy: tag("חלבי"), parve: tag("אפשר פרווה"), nuts: tag("מכיל אגוזים"), gluten: tag("מכיל גלוטן") },
            { fieldset: "design" },
          ),
          notFor: line("בסיס, קרם או מילוי שלא מתאימים לבקשה", { slots: ["request"], fieldset: "design", description: `${blanks("request")} = בקשת ההסרה.` }),
          filling: line("כותרת: מילוי", { fieldset: "design" }),
          fillingHint: line("הסבר על המילוי", { fieldset: "design" }),
          noFilling: line("\"בלי מילוי\"", { fieldset: "design" }),
          layersHint: line("הסבר על מספר השכבות", { fieldset: "design" }),
          sameFilling: line("\"אותו מילוי בכל השכבות\"", { fieldset: "design" }),
          layerTab: line("לשונית של שכבה", { slots: ["n"], fieldset: "design", description: `${blanks("n")} = מספר השכבה.` }),
          coatingHint: line("הסבר על הציפוי", { fieldset: "design" }),
          layersTitle: line("כותרת: מה יש בתוך העוגה", { fieldset: "design" }),
          layerTop: line("\"עליונה\"", { fieldset: "design" }),
          layerBottom: line("\"תחתונה\"", { fieldset: "design" }),
          sameAsBase: line("שכבה בטעם הבסיס", { slots: ["base"], fieldset: "design", description: `${blanks("base")} = הבסיס שנבחר.` }),
          gapName: line("הרווח בין שתי שכבות", { slots: ["n", "next"], fieldset: "design", description: `${blanks("n")} ו-${blanks("next")} = מספרי השכבות, מלמטה.` }),
          creamOnly: line("\"רק קרם\"", { fieldset: "design" }),
          choose: line("\"שינוי\"", { fieldset: "design" }),
          pickBase: line("שאלה: הספוג של שכבה", { slots: ["n"], fieldset: "design", description: `${blanks("n")} = מספר השכבה.` }),
          pickGap: line("שאלה: מה בין שתי שכבות", { slots: ["n", "next"], fieldset: "design", description: `${blanks("n")} ו-${blanks("next")} = מספרי השכבות.` }),
          sameBase: line("\"אותו ספוג בכל השכבות\"", { fieldset: "design" }),
          themeQuestion: line("שאלת הנושא", { fieldset: "design" }),
          themeHint: line("הסבר על הנושא", { fieldset: "design" }),
          galleryTitle: line("כותרת: גלריית העוגות", { fieldset: "design" }),
          galleryHint: line("הסבר על הגלריה", { fieldset: "design" }),
          galleryEmpty: line("כשאין עוגה בנושא", { fieldset: "design" }),
          like: line("\"אהבתי\"", { fieldset: "design" }),
          exactPick: line("\"אני רוצה בדיוק כזו\"", { fieldset: "design" }),
          keepQuestion: line("מה לשמור מהעוגה שנבחרה", { fieldset: "design" }),
          changeLabel: line("מה לשנות בעוגה שנבחרה", { fieldset: "design" }),
          changePlaceholder: line("דוגמה בשדה מה לשנות", { fieldset: "design" }),
          linkHint: line("הסבר על קישור ההשראה", { fieldset: "design" }),
          linkError: line("קישור לא תקין", { fieldset: "design" }),
          imageByWhatsapp: line("תמונה בוואטסאפ", { fieldset: "design" }),
          addonFeatured: line("תוספת מומלצת", { fieldset: "design", description: "על דף הסוכר בעוגת גן ובעוגה מעוצבת." }),
          groups: obj(
            "הקבוצות ברשימות הטעמים",
            {
              all: tag("הכול"),
              classic: tag("קלאסי"),
              chocolate: tag("שוקולד"),
              fruity: tag("פירותי ורענן"),
              nutty: tag("אגוזים ופיסטוק"),
              sweets: tag("עוגיות וממתקים"),
              special: tag("מיוחדים ומתובלים"),
            },
            { fieldset: "design", description: "הלשוניות מעל רשימה ארוכה של בסיסים, קרמים ומילויים. לכל טעם בוחרים קבוצה ברשימה שלו." },
          ),
          colors: line("כותרת: צבעים", { fieldset: "design" }),
          colorsHint: line("הסבר על הצבעים", { slots: ["max"], fieldset: "design", description: `${blanks("max")} = כמה צבעים אפשר לבחור.` }),
          optional: line("\"לא חובה\"", { fieldset: "design" }),
          ideaPlaceholder: line("דוגמה בשדה הנושא", { fieldset: "design" }),
          messagePlaceholder: line("דוגמה בשדה הכיתוב", { fieldset: "design" }),
          messagePreview: line("לפני שכותבים כיתוב", { fieldset: "design", description: "במקום הכיתוב, על הפלאק." }),
          addons: line("כותרת: תוספות", { fieldset: "design", description: "התוספות עצמן: \"תוספות לבונה\"." }),
          addonsHint: line("הסבר על התוספות", { fieldset: "design" }),
          addonColor: line("\"צבע\" בתוספת", { fieldset: "design" }),
          addonAnyColor: line("\"בלי העדפה\" בצבע של תוספת", { fieldset: "design" }),
          addonText: line("השאלה על הטקסט בתוספת", { fieldset: "design", description: "בטופר ובדמות מבצק סוכר." }),
          addonQty: line("\"כמות\" בתוספת", { fieldset: "design" }),

          exclusionsLegend: line("שם הרשימה לקוראי מסך", { fieldset: "remove" }),
          nutsPreset: para("הסבר על \"ללא אגוזים\" בעוגת גן", { fieldset: "remove" }),
          allergy: line("המתג \"זו אלרגיה\"", { fieldset: "remove" }),
          allergyNote: line("הסבר מתחתיו", { fieldset: "remove" }),
          notes: line("כותרת: בקשות נוספות", { fieldset: "remove" }),
          notesPlaceholder: line("דוגמה בשדה הבקשות", { fieldset: "remove" }),

          date: line("השאלה על התאריך", { fieldset: "summary" }),
          yourCake: line("\"העוגה שלכם\"", { fieldset: "summary" }),
          notChosen: line("\"עוד לא נבחר\"", { fieldset: "summary" }),
          noCategory: line("לפני שבוחרים סוג", { fieldset: "summary" }),
          ready: line("\"הכול מוכן?\"", { fieldset: "summary" }),
          quote: line("כפתור השליחה בוואטסאפ", { fieldset: "summary" }),
          quoteNote: para("הסבר מתחת לכפתור", { fieldset: "summary" }),
          approval: line("\"לפני האפייה תראו ותאשרו\"", { fieldset: "summary" }),
          blocked: para("כשיש התנגשות בין הקרם להסרות", { fieldset: "summary" }),
          addToCart: line("כפתור הסל", { fieldset: "cart" }),
          adding: line("בזמן ההוספה", { fieldset: "cart" }),
          failed: line("כשההוספה נכשלה", { fieldset: "cart" }),
          added: line("אחרי שנוסף", { fieldset: "cart" }),
          another: line("\"לבנות עוגה נוספת\"", { fieldset: "cart" }),

          preview: obj(
            "ההדמיה התלת־ממדית",
            {
              label: line("תיאור ההדמיה לקוראי מסך"),
              hint: line("\"גררו כדי לסובב\""),
              note: para("ההערה מתחת להדמיה", { description: "שההדמיה להמחשה בלבד." }),
            },
            { fieldset: "summary" },
          ),

          request: obj(
            "שליחת הבקשה מהאתר",
            {
              title: line("כותרת הטופס"),
              note: para("הסבר מתחת לכותרת"),
              name: line("השדה: שם"),
              phone: line("השדה: טלפון"),
              email: line("השדה: אימייל"),
              dateAny: line("כשעוד אין תאריך"),
              few: line("ליד יום שנשארו בו מקומות אחרונים"),
              full: line("ליד יום מלא"),
              robot: line("שם בדיקת הרובוט לקוראי מסך"),
              send: line("כפתור השליחה"),
              sending: line("בזמן השליחה"),
              orWhatsapp: line("הקישור לוואטסאפ מתחת לכפתור"),
              sent: line("כותרת אחרי השליחה"),
              sentNote: para("הסבר אחרי השליחה", { slots: ["code"], description: `${blanks("code")} = מספר הבקשה.` }),
              sentImage: para("כשנבחר הדפס תמונה"),
              sentWhatsapp: line("כפתור הוואטסאפ אחרי השליחה"),
              errors: obj("הודעות שגיאה", {
                fields: line("שדה לא תקין"),
                name: line("שם לא מלא"),
                phone: line("טלפון לא תקין"),
                email: line("אימייל לא תקין"),
                robot: line("בדיקת הרובוט נכשלה"),
                busy: line("יותר מדי ניסיונות"),
                date: line("תאריך לא פתוח"),
                dateFull: line("היום התמלא"),
                tooMany: para("יותר מדי בקשות פתוחות"),
                error: para("תקלה כללית"),
              }),
            },
            { fieldset: "request" },
          ),

          errors: obj(
            "כשחסר משהו",
            {
              category: line("בלי סוג עוגה"),
              figure: line("בלי ספרה (או לא תקינה)"),
              size: line("בלי גודל"),
              base: line("בלי טעם בסיס"),
              cream: line("בלי קרם"),
            },
            { fieldset: "errors" },
          ),

          order: ORDER_SPEC,
        },
        {
          fieldsets: [
            { name: "frame", title: "כותרת ושלבים" },
            { name: "buttons", title: "כפתורי המעבר" },
            { name: "size", title: "שלב 2: גודל ובסיס" },
            { name: "design", title: "שלב 3: קרם ועיצוב" },
            { name: "remove", title: "שלב 4: הסרות ובקשות" },
            { name: "summary", title: "שלב 5: סיכום ושליחה" },
            { name: "cart", title: "סל קניות", description: "מופיעים רק כשהבונה מחובר לסל. היום הסיכום נשלח בוואטסאפ." },
            { name: "request", title: "שלב 5: שליחת הבקשה", description: "כשמסד ההזמנות מחובר, הבקשה נשמרת אצלכם ונשלחת אליכם במייל. בלעדיו, היא נשלחת בוואטסאפ." },
            { name: "errors", title: "הודעות כשחסר משהו" },
          ],
        },
      ),
      group: "wizard",
    },
  },
};


/** the three documents, in the Studio's order */
export const SITE_DOCS = [SITE_SETTINGS, HOME_PAGE, CAKE_PAGE_SPEC];

/* ───────── the site's built-in texts, as the Studio stores them ───────── */

/**
 * A document's fields filled from the site's built-in texts (content.ts), the way the Studio
 * stores them: only the fields its form has, list items with the _type and _key Sanity needs, and
 * nothing for what's empty (an optional field left empty is simply not filled in). The seed
 * writes this; the site's tests read it back through the site's own rules.
 */
export function stored(spec: DocSpec, value: unknown): Record<string, unknown> {
  const fields: Fields = {};
  for (const [name, { group: _group, ...field }] of Object.entries(spec.fields)) fields[name] = field as Field;
  return storedObject(fields, value, "");
}

function storedObject(fields: Fields, value: unknown, path: string): Record<string, unknown> {
  const source = (value ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    const v = storedValue(field, source[name], `${path}${name}`);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

function storedValue(field: Field, value: unknown, path: string): unknown {
  switch (field.kind) {
    case "object":
      return storedObject(field.fields, value, `${path}.`);
    case "list": {
      const items = Array.isArray(value) ? value : [];
      const of = field.of;
      const name = path.split(".").pop();
      if (of.kind === "object") return items.map((item, i) => ({ _type: field.item, _key: `${name}-${i + 1}`, ...storedObject(of.fields, item, `${path}[].`) }));
      return items.filter((item) => typeof item === "string" && item !== "");
    }
    case "number":
      return typeof value === "number" ? value : undefined;
    case "days":
      return Array.isArray(value) ? value : undefined;
    default:
      return typeof value === "string" && value !== "" ? value : undefined;
  }
}
