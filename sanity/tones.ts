// The colour dot of a base or cream, as the Studio stores it (studio/tones.ts): one colour, "#EFD9A8",
// or two for a swirl, "#EFD9A8,#5C3B2C". Anything else (a missing or malformed value) gets cream,
// so a stray value can never put anything but a colour into the page's styles.

const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK = "#F5E9CF";

export function toneHex(value: string | undefined): string | [string, string] {
  const [a, b, ...rest] = (value ?? "").split(",").map((part) => part.trim());
  if (!a || !HEX.test(a) || rest.length) return FALLBACK;
  if (b === undefined) return a;
  return HEX.test(b) ? [a, b] : a;
}
