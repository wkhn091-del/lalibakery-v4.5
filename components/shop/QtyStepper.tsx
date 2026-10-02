"use client";
import { MAX_QTY } from "@/lib/pricing/engine";

// Minus, the number, plus: 1 to MAX_QTY. The buttons say what they do to a screen reader too.
export default function QtyStepper({ value, onChange, label, decrease, increase }: { value: number; onChange: (n: number) => void; label: string; decrease: string; increase: string }) {
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" className="qty-btn" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={decrease}>
        <span aria-hidden>−</span>
      </button>
      <output className="qty-value" aria-live="polite">{value}</output>
      <button type="button" className="qty-btn" onClick={() => onChange(value + 1)} disabled={value >= MAX_QTY} aria-label={increase}>
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}
