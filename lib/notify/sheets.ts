/*
  The owner's order log in Google Sheets: one row per event, with only the order's code, its day,
  the city, the amount and the status (no names, phones or addresses: a sheet is easy to share by
  mistake). Written as RAW values, so nothing a customer typed can become a formula.

  A Google service account signs its own token (a JWT, RS256, with node:crypto) and exchanges it
  for an access token, kept until a minute before it expires. Without the three variables the log
  is off.
*/
import "server-only";
import { createSign } from "node:crypto";
import { serverEnv } from "@/lib/env/server";

let cached: { token: string; until: number } | null = null;

async function accessToken(email: string, key: string): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.replace(/\\n/g, "\n"), "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token: ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google token: no access token");
  cached = { token: json.access_token, until: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000 };
  return json.access_token;
}

export type LogRow = { code: string; day: string | null; city: string | null; totalAgorot: number | null; status: string };

export async function logOrder(row: LogRow, now = new Date()): Promise<boolean> {
  const env = serverEnv();
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_KEY || !env.ORDERS_SHEET_ID) return false;
  const token = await accessToken(env.GOOGLE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const at = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(now);
  const values = [[at, row.code, row.day ?? "", row.city ?? "", row.totalAgorot != null ? row.totalAgorot / 100 : "", row.status]];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.ORDERS_SHEET_ID)}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Sheets append: ${res.status}`);
  return true;
}
