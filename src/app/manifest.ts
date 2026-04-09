import type { MetadataRoute } from "next";

import { getPwaBranding } from "@/lib/pwa/branding";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getPwaBranding();

  return {
    name: branding.name,
    short_name: branding.shortName,
    description: branding.description,
    start_url: branding.startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f5ef",
    theme_color: "#f5c542",
    icons: [
      {
        src: branding.iconUrl,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: branding.iconUrl,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
