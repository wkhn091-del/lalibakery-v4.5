"use client";
import Link from "next/link";
import { cartCount, useCart, useCartReady } from "@/lib/cart/store";
import { fill } from "@/lib/text";

// "The cart" in the header, with how many items are in it once the stored cart is read
export default function CartLink({ href, label, labelWithCount }: { href: string; label: string; labelWithCount: string }) {
  const ready = useCartReady();
  const count = useCart((s) => cartCount(s.items));
  const n = ready ? count : 0;
  return (
    <Link href={href} className="nav-link cart-link" aria-label={n > 0 ? fill(labelWithCount, { n }) : label}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      <span>{label}</span>
      {n > 0 && <span className="cart-badge" aria-hidden>{n}</span>}
    </Link>
  );
}
