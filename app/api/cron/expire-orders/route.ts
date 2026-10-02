/*
  Daily (vercel.json): online orders whose 30 minutes to pay ran out are cancelled.
  Their day and coupon were already free (the database counts only live holds); this tidies the
  owner's list. Only Vercel Cron, with CRON_SECRET.
*/
import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { cronAllowed } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  if (!cronAllowed(req.headers)) return new NextResponse(null, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const { data, error } = await db.rpc("expire_pending_orders");
  if (error) {
    Sentry.captureException(new Error(`expire_pending_orders: ${error.message}`), { tags: { area: "cron" } });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, expired: Number(data) || 0 }, { headers: { "Cache-Control": "no-store" } });
}
