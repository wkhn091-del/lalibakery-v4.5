/*
  The ordering calendar for pages that are static (the cake builder): each open day with its
  status (free, few left, full) and its delivery windows. Never the counts. Limited per client.
*/
import { type NextRequest, NextResponse } from "next/server";
import { availableDays } from "@/lib/checkout/availability";
import { clientKey } from "@/lib/edge/ip";
import { allow } from "@/lib/ratelimit";
import { getStoreSettings } from "@/sanity/shop";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  if (!(await allow("availability", clientKey(req.headers)))) return NextResponse.json({ error: "busy" }, { status: 429, headers: NO_STORE });
  try {
    const settings = await getStoreSettings({ published: true });
    if (!settings) return NextResponse.json({ days: [] }, { headers: NO_STORE });
    const days = await availableDays(settings);
    return NextResponse.json({ days, windows: settings.deliveryWindows.map(({ id, from, to }) => ({ id, from, to })) }, { headers: NO_STORE });
  } catch (error) {
    console.error("[availability]", error);
    return NextResponse.json({ error: "error" }, { status: 500, headers: NO_STORE });
  }
}
