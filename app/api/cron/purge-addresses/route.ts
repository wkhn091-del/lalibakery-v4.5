/*
  Daily (vercel.json): a delivery's full address, notes and recipient are erased 24 months after
  its day (the retention rule agreed with the owner); the city stays, for her statistics. Only
  Vercel Cron, with CRON_SECRET.
*/
import * as Sentry from "@sentry/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { cronAllowed } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  if (!cronAllowed(req.headers)) return new NextResponse(null, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const { data, error } = await db.rpc("purge_old_addresses");
  if (error) {
    Sentry.captureException(new Error(`purge_old_addresses: ${error.message}`), { tags: { area: "cron" } });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, purged: Number(data) || 0 }, { headers: { "Cache-Control": "no-store" } });
}
