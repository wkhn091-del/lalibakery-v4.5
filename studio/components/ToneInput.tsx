import { Card, Flex, Text } from "@sanity/ui";
import { set, type StringInputProps } from "sanity";
import { swatch, TONES } from "../tones";

/** The colour of a base or cream: a row of named colour chips instead of a plain dropdown */
export function ToneInput({ value, onChange, readOnly, elementProps }: StringInputProps) {
  return (
    <Flex wrap="wrap" gap={2} dir="rtl" role="radiogroup" aria-describedby={elementProps["aria-describedby"]}>
      {TONES.map((tone) => {
        const selected = value === tone.value;
        return (
          <Card
            key={tone.value}
            as="button"
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={readOnly}
            onClick={() => onChange(set(tone.value))}
            padding={2}
            paddingLeft={3}
            radius={5}
            border
            selected={selected}
            tone={selected ? "primary" : "default"}
            __unstable_focusRing
          >
            <Flex align="center" gap={2}>
              <Swatch value={tone.value} />
              <Text size={1} weight={selected ? "semibold" : "regular"}>
                {tone.title}
              </Text>
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
}

export function Swatch({ value, size = 18 }: { value?: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        background: swatch(value),
        boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.18)",
      }}
    />
  );
}
