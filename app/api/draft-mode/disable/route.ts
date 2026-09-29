import { cookies, draftMode } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/** Back to the published site: ends the Studio's preview in this browser (the link it shows outside the Studio) */
export async function GET(request: NextRequest) {
  (await draftMode()).disable();
  (await cookies()).delete("sanity-preview-perspective");
  return NextResponse.redirect(new URL("/", request.url));
}
