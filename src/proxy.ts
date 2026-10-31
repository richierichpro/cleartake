import type { NextRequest } from "next/server";
import { authorized, unauthorized } from "@/lib/auth";

// Password gate for a deployed copy (see lib/auth.ts); does nothing unless APP_PASSWORD is set.
export async function proxy(request: NextRequest) {
  if (!(await authorized(request))) return unauthorized();
}

export const config = {
  // Not static files. Not the video upload: Proxy buffers request bodies (cut off at 10MB), so the
  // upload route checks the password itself and streams the video to disk.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/upload).*)"],
};
