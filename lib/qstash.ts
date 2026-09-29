/*
  Delayed messages to ourselves, through Upstash QStash: "ask about this draft at 16:30".
  QStash calls /api/cart/remind at that time, signed (the route checks the signature), and
  retries if the route fails. QSTASH_TOKEN, and QSTASH_URL for a region other than the default.
  Nothing here is sent while the token is missing: scheduleCartReminder returns false.

  Each message carries its own deduplication id (the draft and the time), so a retried request
  never queues a second copy.
*/
import "server-only";
import { Client } from "@upstash/qstash";

export const REMIND_PATH = "/api/cart/remind";

let client: Client | undefined;
function qstash(env: Record<string, string | undefined>): Client | null {
  if (client) return client;
  if (!env.QSTASH_TOKEN) return null;
  return (client = new Client({ token: env.QSTASH_TOKEN, ...(env.QSTASH_URL ? { baseUrl: env.QSTASH_URL } : {}) }));
}

/** Asks /api/cart/remind about this draft at the given time; false when QStash or the site address isn't set */
export async function scheduleCartReminder(draftId: string, at: Date, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const q = qstash(env);
  const site = env.NEXT_PUBLIC_SITE_URL;
  if (!q || !site) return false;
  const notBefore = Math.ceil(at.getTime() / 1000);
  await q.publishJSON({
    url: new URL(REMIND_PATH, site).toString(),
    body: { draftId },
    notBefore,
    deduplicationId: `cart-${draftId}-${notBefore}`,
    retries: 3,
  });
  return true;
}
