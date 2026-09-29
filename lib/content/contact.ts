/*
  The links made from the business details in "הגדרות כלליות": call, WhatsApp, mail and Waze.
  The owner types the phone as it's shown ("050-873-9090"); the links need it international.
*/
import { clean } from "@/lib/stega";
import type { SiteSettings } from "./types";

/**
 * The number as the call and WhatsApp links need it, however it was typed:
 * "050-873-9090", "+972 50-873-9090", "+972-050-873-9090", "00972 50 873 9090" → "972508739090".
 * "" when there are no digits.
 */
export function international(phone: string): string {
  let digits = clean(phone).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("9720")) return `972${digits.slice(4)}`;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

/** An Israeli number the links can dial: 972, then 8 digits (a landline) or 9 (a mobile) */
export const ISRAELI = /^972[1-9]\d{7,8}$/;

export type ContactLinks = { tel: string; whatsapp: string; mail: string; waze: string; phoneIntl: string };

export function linksOf(business: SiteSettings["business"]): ContactLinks {
  const phone = international(business.phone);
  const address = clean(business.address).trim();
  return {
    tel: `tel:+${phone}`,
    whatsapp: `https://wa.me/${international(business.whatsapp) || phone}`,
    mail: `mailto:${clean(business.email).trim()}`,
    waze: address ? `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` : "",
    phoneIntl: `+${phone}`,
  };
}
