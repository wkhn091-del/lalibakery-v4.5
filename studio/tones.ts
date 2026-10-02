/**
 * The colours the owner can give a base or a cream, by name. The site draws the colour dot next to
 * each option in the cake builder straight from the stored value: one colour (#rrggbb), or two
 * separated by a comma for a swirl.
 */
export const TONES = [
  { title: "וניל", value: "#EFD9A8" },
  { title: "שמנת", value: "#F5E9CF" },
  { title: "לבן", value: "#FBF5EA" },
  { title: "שוקולד", value: "#5C3B2C" },
  { title: "שוקולד מריר", value: "#3F2519" },
  { title: "קרמל", value: "#C68A4C" },
  { title: "אדום (רד וולווט)", value: "#9A2E36" },
  { title: "לימון", value: "#F0DC86" },
  { title: "פיסטוק", value: "#B5BF86" },
  { title: "פירות יער", value: "#B45872" },
  { title: "ביסקוויט", value: "#C48A57" },
  { title: "בצק פריך", value: "#E4C28C" },
  { title: "שיש (וניל ושוקולד)", value: "#EFD9A8,#5C3B2C" },
  { title: "ורוד", value: "#F1C6CC" },
  { title: "תות", value: "#E0505E" },
  { title: "מנגו", value: "#F5B94F" },
  { title: "קפה", value: "#8B6447" },
  { title: "אגוזי לוז", value: "#A87A52" },
  { title: "דבש", value: "#E2B866" },
  { title: "מאצ'ה", value: "#A7B97A" },
  { title: "סגול", value: "#CDB6DD" },
] as const;

export type Tone = (typeof TONES)[number]["value"];

/** what a stored tone may be: one colour, or two for a swirl */
export const TONE_VALUE = /^#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6})?$/;

/** A CSS background for a stored tone: a flat colour, or half and half for a swirl */
export function swatch(value: string | undefined) {
  const [a, b] = (value ?? TONES[1].value).split(",");
  return b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a;
}
