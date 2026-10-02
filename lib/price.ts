// מחירים בשקלים, באותו פורמט בשרת ובדפדפן: "1,200 ₪".
// לא Intl עם he-IL: הוא מוסיף סימני כיווניות נסתרים, ואז מה שהשרת רינדר לא תמיד זהה למה שהדפדפן מרנדר.
import { fill } from "./text";

export const shekels = (n: number) => `${Math.round(n).toLocaleString("en-US")} ₪`;

/** המבנה המובנה של מחיר; ב-CMS: "הגדרות כלליות", "מחיר" */
export const PRICE_FROM = "החל מ-{price}";

/** "החל מ-1,200 ₪": כל מחיר באתר הוא מחיר התחלתי, העוגה הסופית מתומחרת בשיחה */
export const priceText = (n: number, template: string = PRICE_FROM) => fill(template, { price: shekels(n) });

/** מחיר בחנות, מאגורות: "120 ₪", ועם אגורות רק כשיש: "49.90 ₪" */
export function agorotText(agorot: number): string {
  const n = Math.round(agorot) / 100;
  const digits = Number.isInteger(n) ? 0 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₪`;
}
