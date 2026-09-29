/*
  Texts with blanks, as the owner writes them in the Studio: "שלב {n} מתוך {total}".
  A blank the text doesn't use is simply ignored, and one it names that isn't given stays as
  written, so a typo in the Studio shows up on the page instead of breaking it.

  In the Studio's preview (draft mode) the texts carry invisible characters that link each one to
  its field (stega, added by @sanity/client). They sit at the end of the text, so filling in the
  blanks keeps them there, and the filled-in sentence still opens its field when clicked.
*/
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (blank, name: string) => (name in values ? String(values[name]) : blank));
}
