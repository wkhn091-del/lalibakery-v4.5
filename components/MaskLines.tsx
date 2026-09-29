// תגיות טקסט בלבד: ElementType הכללי כולל גם את אלמנטי התלת־ממד של react-three-fiber (ב-hero),
// ו-TypeScript לא מצליח ליישב ביניהם.
type TextTag = "h1" | "h2" | "h3" | "h4" | "p" | "div" | "span";

export default function MaskLines({
  lines,
  as: Tag = "h2",
  className = "",
}: {
  lines: string[];
  as?: TextTag;
  className?: string;
}) {
  return (
    <Tag className={className}>
      {lines.map((line, i) => (
        <span key={i} className="mask-line">
          <span>{line}</span>
        </span>
      ))}
    </Tag>
  );
}
