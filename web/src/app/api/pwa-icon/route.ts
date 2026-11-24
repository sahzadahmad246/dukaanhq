import { NextRequest, NextResponse } from "next/server";

import { getPwaBranding } from "@/lib/pwa/branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getPwaBranding();
  return NextResponse.redirect(new URL(branding.iconUrl, request.url), 307);
}
