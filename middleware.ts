import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSession, updateSessionWithResponse } from "@/lib/supabase/middleware";

const SHOP_APP_SEGMENTS = new Set([
  "dashboard",
  "billing",
  "inventory",
  "staff",
  "profile",
  "settings",
  "subscribe",
  "subscription",
]);

const RESERVED_ROOT_SEGMENTS = new Set([
  "",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "dashboard",
  "inventory",
  "onboarding",
  "profile",
  "settings",
  "staff",
  "subscribe",
  "subscription",
  "suspended",
]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length >= 2 && !RESERVED_ROOT_SEGMENTS.has(segments[0]) && SHOP_APP_SEGMENTS.has(segments[1])) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/${segments[1]}`;
    rewriteUrl.searchParams.set("shop", segments[0]);
    return updateSessionWithResponse(request, NextResponse.rewrite(rewriteUrl));
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
