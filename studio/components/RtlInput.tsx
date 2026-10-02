import type { InputProps } from "sanity";
import { isLtrLocale } from "../locales";

/**
 * Every text field types right to left, for Hebrew (the Studio's own menus and buttons stay in
 * English, left to right: Sanity has no Hebrew interface). The English and Russian of a field in
 * every language (schemaTypes/localized.ts) type left to right.
 */
export function RtlInput(props: InputProps) {
  const last = props.path[props.path.length - 1];
  // the Hebrew of formatted text (the legal pages) is an array of paragraphs, not a string
  const hebrewBlocks = props.schemaType.jsonType === "array" && last === "he";
  if (props.schemaType.jsonType !== "string" && !hebrewBlocks) return props.renderDefault(props);
  return <div dir={typeof last === "string" && isLtrLocale(last) ? "ltr" : "rtl"}>{props.renderDefault(props)}</div>;
}
