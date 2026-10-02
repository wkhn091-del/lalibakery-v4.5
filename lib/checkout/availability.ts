/*
  The ordering calendar with the database's counts: how many orders each day already holds
  (booked_counts, which counts unpaid online orders only while their 30 minutes last), compared
  with the owner's capacity. What leaves the server is the status of each day, never the counts.
*/
import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { type CalendarSettings, israelDate, lastDate, type OpenDay, openDays } from "./calendar";

export async function bookedCounts(from: string, to: string): Promise<Map<string, number>> {
  const db = supabaseAdmin();
  if (!db) return new Map();
  const { data, error } = await db.rpc("booked_counts", { p_from: from, p_to: to });
  if (error) throw new Error(`booked_counts failed: ${error.message}`);
  const rows = Array.isArray(data) ? (data as { day: string; booked: number }[]) : [];
  return new Map(rows.map((r) => [String(r.day).slice(0, 10), Number(r.booked) || 0]));
}

/** The days a customer can choose now, each free, few or full */
export async function availableDays(settings: CalendarSettings, now = new Date()): Promise<OpenDay[]> {
  const today = israelDate(now);
  return openDays(settings, today, await bookedCounts(today, lastDate(settings, today)));
}
