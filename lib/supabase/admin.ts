/*
  Supabase with the service role, for jobs that act on no customer's behalf (the cart reminder
  callback). It bypasses row-level security, so it stays on the server, and only ever calls the
  job functions the migrations grant to service_role.
  NEXT_PUBLIC_SUPABASE_URL, and the secret key: SUPABASE_SECRET_KEY (sb_secret_…), or the older
  SUPABASE_SERVICE_ROLE_KEY. null while either is missing.
*/
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | undefined;

export function supabaseAdmin(env: Record<string, string | undefined> = process.env): SupabaseClient | null {
  if (admin) return admin;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return (admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
