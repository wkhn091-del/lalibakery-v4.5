/*
  Grow (formerly Meshulam), the "Light" server API: form-data in, JSON out ({status, err, data}).
  Server to server only; the page code, user id and API key never reach the browser.
*/
import "server-only";
import { growEnv } from "@/lib/env/server";

export type GrowAnswer = { status: number; err: unknown; data: unknown };

/** our own credentials: never taken from the fields passed in (an update's fields are passed back) */
const OWN = new Set(["pageCode", "userId", "apiKey"]);

export class GrowError extends Error {
  constructor(
    readonly method: string,
    readonly detail: string,
  ) {
    super(`Grow ${method} failed: ${detail}`);
  }
}

export async function growCall(method: "createPaymentProcess" | "getTransactionInfo" | "approveTransaction", fields: Record<string, string>): Promise<GrowAnswer> {
  const env = growEnv();
  if (!env) throw new GrowError(method, "not configured");
  const body = new FormData();
  body.set("pageCode", env.pageCode);
  if (method === "createPaymentProcess") body.set("userId", env.userId);
  if (env.apiKey) body.set("apiKey", env.apiKey);
  for (const [k, v] of Object.entries(fields)) if (!OWN.has(k)) body.set(k, v);

  const res = await fetch(`${env.apiUrl}/api/light/server/1.0/${method}`, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new GrowError(method, `HTTP ${res.status}`);
  const json = (await res.json()) as Partial<GrowAnswer>;
  const status = Number(json.status);
  if (status !== 1) {
    // err is {id, message} or a string; the message is Grow's, never the customer's details
    const err = json.err as { id?: unknown; message?: unknown } | string | undefined;
    const detail = typeof err === "string" ? err : `${String(err?.id ?? "?")} ${String(err?.message ?? "")}`.trim();
    throw new GrowError(method, detail.slice(0, 200));
  }
  return { status, err: json.err, data: json.data };
}

/** Agorot to Grow's sum ("123.40") and back */
export const toSum = (agorot: number) => (agorot / 100).toFixed(2);
export const fromSum = (sum: unknown) => {
  const n = typeof sum === "number" ? sum : Number.parseFloat(String(sum ?? ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
