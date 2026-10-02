import { Card, Select, Spinner, Text } from "@sanity/ui";
import { useEffect, useState, type ChangeEvent } from "react";
import { set, unset, useClient, useFormValue, type StringInputProps } from "sanity";

type Variant = { _key: string; label?: string; price?: number };

const QUERY = `coalesce(*[_id == $id][0], *[_id == "drafts." + $id][0]).variants[]{ _key, "label": label.he, price }`;

/**
 * Which size of the chosen product goes into a bundle: a list of that product's sizes, instead of
 * the size's internal key. Reads the sizes the product has now (published, or the draft of a new one).
 */
export function VariantKeyInput(props: StringInputProps) {
  const { onChange, value, path, elementProps } = props;
  const client = useClient({ apiVersion: "2025-09-01" });
  const product = useFormValue([...path.slice(0, -1), "product"]) as { _ref?: string } | undefined;
  const productId = product?._ref;
  const [variants, setVariants] = useState<Variant[] | null>(null);

  useEffect(() => {
    if (!productId) return;
    let live = true;
    setVariants(null);
    client
      .fetch<Variant[] | null>(QUERY, { id: productId })
      .then((list) => live && setVariants(list ?? []))
      .catch(() => live && setVariants([]));
    return () => {
      live = false;
    };
  }, [client, productId]);

  if (!productId) {
    return (
      <Card padding={3} radius={2} tone="caution">
        <Text size={1}>קודם בוחרים מוצר, ואז את הגודל שלו</Text>
      </Card>
    );
  }
  if (variants === null) return <Spinner muted />;
  if (!variants.length) {
    return (
      <Card padding={3} radius={2} tone="critical">
        <Text size={1}>למוצר הזה עוד אין גדלים: מוסיפים אותם במוצר עצמו</Text>
      </Card>
    );
  }

  const known = !value || variants.some((v) => v._key === value);
  return (
    <Select
      {...elementProps}
      value={value ?? ""}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value ? set(event.currentTarget.value) : unset())}
    >
      <option value="">בחרו גודל</option>
      {!known && <option value={value}>גודל שנמחק מהמוצר: בחרו אחר</option>}
      {variants.map((v) => (
        <option key={v._key} value={v._key}>
          {[v.label || "גודל בלי שם", typeof v.price === "number" ? `${v.price} ₪` : null].filter(Boolean).join(" · ")}
        </option>
      ))}
    </Select>
  );
}
