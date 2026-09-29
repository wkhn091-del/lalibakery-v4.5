import { defineField } from "sanity";
import { ToneInput } from "../components/ToneInput";
import { TONES } from "../tones";

/** The colour of a base or a cream (the dot next to it in the cake builder) */
export const toneField = defineField({
  name: "tone",
  title: "צבע",
  type: "string",
  description: "הנקודה הצבעונית שמופיעה ליד האפשרות בבונה העוגה.",
  options: { list: TONES.map(({ title, value }) => ({ title, value })) },
  components: { input: ToneInput },
  initialValue: TONES[1].value,
  validation: (rule) => rule.required(),
});

/** Alt text of a photo: what a screen reader reads, and what Google understands of the photo */
export const altField = defineField({
  name: "alt",
  title: "מה רואים בתמונה",
  type: "string",
  description: "תיאור קצר, לקוראי מסך ולגוגל. למשל: עוגה לבנה עם הספרה 12 בזהב וזר גיבסנית.",
  validation: (rule) => rule.max(160),
});
