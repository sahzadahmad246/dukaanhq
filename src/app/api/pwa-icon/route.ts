import { NextRequest, NextResponse } from "next/server";

import { getPwaBranding } from "@/lib/pwa/branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const branding = await getPwaBranding();

  if (branding.iconUrl) {
    try {
      const response = await fetch(branding.iconUrl, {
        cache: "no-store",
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "image/png";
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, no-store, max-age=0",
          },
        });
      }
    } catch {
      // Fall through to default favicon below.
    }
  }

  return NextResponse.redirect(new URL("/favicon.ico", request.url), 307);
}
