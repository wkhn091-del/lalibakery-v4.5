import { revalidateTag } from "next/cache";
import { after, NextResponse, type NextRequest } from "next/server";
import { isValidSignature, SIGNATURE_HEADER_NAME } from "@sanity/webhook";
import { SANITY_TAG, sanityIsReachable } from "@/sanity/fetch";

/*
  Sanity calls this when the owner publishes, changes or deletes a text document ("הגדרות כלליות",
  "דף הבית", "דף הזמנת עוגה"), a cake, a category, a flavour or a cream (the GROQ webhook in
  CMS.md). Drafts never call it: the Studio's preview reads them live (app/api/draft-mode). The request is signed with SANITY_REVALIDATE_SECRET; anything
  unsigned or signed with another secret gets 401 and changes nothing.

  All this endpoint can do is mark the cached CMS content as stale, so the next visitor gets a
  freshly built page. It changes nothing in the CMS, and it holds no CMS token.
*/

// Sanity's payload is a few hundred bytes (the webhook's projection is {_id, _type})
const MAX_BODY_BYTES = 64 * 1024;
/** the pages built from the CMS, rebuilt right after a change (below) */
const PAGES = ["/", "/custom-cake", "/accessibility"];
/** the refresh is recorded as this response ends; the rebuild starts a moment after */
const REBUILD_AFTER_MS = 1500;

export async function POST(request: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) {
    console.error("[sanity] SANITY_REVALIDATE_SECRET is not set, so CMS changes can't refresh the site");
    return NextResponse.json({ message: "Not configured" }, { status: 500 });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ message: "Payload too large" }, { status: 413 });
  }
  // the raw text, exactly as signed (re-serialised JSON can differ and fail the check)
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return NextResponse.json({ message: "Payload too large" }, { status: 413 });

  let valid: boolean;
  try {
    valid = await isValidSignature(body, request.headers.get(SIGNATURE_HEADER_NAME) ?? "", secret);
  } catch (error) {
    console.error("[sanity] the webhook signature couldn't be checked", error);
    return NextResponse.json({ message: "Signature check failed" }, { status: 500 });
  }
  if (!valid) return NextResponse.json({ message: "Invalid signature" }, { status: 401 });

  // Refreshing makes the next visit rebuild the page from the CMS. If the CMS doesn't answer right
  // now, keep the current pages and tell Sanity to deliver this again later.
  if (!(await sanityIsReachable())) {
    console.warn("[sanity] the CMS isn't answering, so the refresh waits for Sanity to retry this webhook");
    return NextResponse.json({ message: "CMS unreachable, retry later" }, { status: 503, headers: { "Retry-After": "60" } });
  }

  revalidateTag(SANITY_TAG);
  // Rebuild the pages now, while the CMS is known to answer, rather than on the next visit: the
  // next visitor gets the new page at once, and a CMS outage in the meantime can't leave a page
  // with no version to show (a failed rebuild keeps the previous page; see whenCmsFails).
  const origin = new URL(request.url).origin;
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, REBUILD_AFTER_MS));
    await Promise.allSettled(PAGES.map((path) => fetch(new URL(path, origin), { cache: "no-store", headers: { "user-agent": "lalibakery-rebuild" } })));
  });
  let changed: unknown;
  try {
    changed = (JSON.parse(body) as { _type?: unknown })._type;
  } catch {
    changed = undefined;
  }
  console.info(`[sanity] content changed${typeof changed === "string" ? ` (${changed})` : ""}, the site will rebuild it on the next visit`);
  return NextResponse.json({ revalidated: true, now: Date.now() });
}
