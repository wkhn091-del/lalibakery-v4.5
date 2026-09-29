import type { InputProps } from "sanity";

/**
 * Every text field types right to left, for Hebrew (the Studio's own menus and buttons stay in
 * English, left to right: Sanity has no Hebrew interface).
 */
export function RtlInput(props: InputProps) {
  if (props.schemaType.jsonType !== "string") return props.renderDefault(props);
  return <div dir="rtl">{props.renderDefault(props)}</div>;
}
