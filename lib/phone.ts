/*
  An Israeli phone number as people type it (050-123-4567, 0501234567, +972 50 123 4567,
  972501234567), in the form the database keeps (E.164: +972501234567). Mobile numbers (05x) and
  landlines (02, 03, 04, 08, 09, 07x). Anything else is null: the form asks again.
*/
const IL_NATIONAL = /^(?:5\d{8}|[23489]\d{7}|7\d{8})$/;

export function israeliPhone(raw: string): string | null {
  if (raw.length > 32) return null;
  const digits = raw.normalize("NFKC").replace(/[\s\-().\u200e\u200f]/g, "");
  let national: string;
  if (/^\+972\d+$/.test(digits)) national = digits.slice(4);
  else if (/^00972\d+$/.test(digits)) national = digits.slice(5);
  else if (/^972\d+$/.test(digits)) national = digits.slice(3);
  else if (/^0\d+$/.test(digits)) national = digits.slice(1);
  else return null;
  if (national.startsWith("0")) national = national.slice(1);
  return IL_NATIONAL.test(national) ? `+972${national}` : null;
}

/** For showing a stored number back: +972501234567 → 050-123-4567 */
export function localPhone(e164: string): string {
  if (!e164.startsWith("+972")) return e164;
  const n = `0${e164.slice(4)}`;
  return n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
}
