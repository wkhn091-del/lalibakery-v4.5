import { Card, Flex, Text } from "@sanity/ui";
import { set, type StringInputProps } from "sanity";
import { swatch, TONES } from "../tones";

/** The colour of a base, cream or filling: named colour chips, the custom colour it has, and "another shade" */
export function ToneInput({ value, onChange, readOnly, elementProps }: StringInputProps) {
  const custom = value && !TONES.some((t) => t.value === value) ? value : null;
  return (
    <Flex wrap="wrap" gap={2} dir="rtl" role="radiogroup" aria-describedby={elementProps["aria-describedby"]}>
      {custom && (
        <Card as="span" role="radio" aria-checked padding={2} paddingLeft={3} radius={5} border selected tone="primary">
          <Flex align="center" gap={2}>
            <Swatch value={custom} />
            <Text size={1} weight="semibold">
              גוון משלו
            </Text>
          </Flex>
        </Card>
      )}
      <Card as="label" padding={2} paddingLeft={3} radius={5} border style={{ cursor: readOnly ? "default" : "pointer" }}>
        <Flex align="center" gap={2}>
          <input
            type="color"
            disabled={readOnly}
            value={(custom ?? value ?? TONES[1].value).split(",")[0]}
            onChange={(e) => onChange(set(e.currentTarget.value.toUpperCase()))}
            style={{ width: 18, height: 18, padding: 0, border: "none", background: "none" }}
          />
          <Text size={1}>גוון אחר</Text>
        </Flex>
      </Card>
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
