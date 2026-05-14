import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, Navigation, Phone, Store } from "lucide-react";
import { notFound } from "next/navigation";

import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPlanEntitlement } from "@/lib/subscription/plan-limits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PublicShop = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  category: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

export default async function PublicShopPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;
  const adminSupabase = createSupabaseAdminClient();

  if (!adminSupabase) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const userState = await getUserAppState(supabase);

  const { data: shop } = await adminSupabase
    .from("shops")
    .select("id, name, slug, logo_url, category, address_line_1, address_line_2, city, state, postal_code, phone, email, latitude, longitude")
    .eq("slug", shopSlug)
    .maybeSingle<PublicShop>();

  if (!shop) {
    notFound();
  }

  const publicPageAccess = await checkPlanEntitlement(
    adminSupabase,
    shop.id,
    "public_shop_page",
    "Public shop page",
  );
  if (!publicPageAccess.ok) {
    notFound();
  }

  const address = [shop.address_line_1, shop.address_line_2, shop.city, shop.state, shop.postal_code]
    .filter(Boolean)
    .join(", ");
  const latitude = typeof shop.latitude === "string" ? Number(shop.latitude) : shop.latitude;
  const longitude = typeof shop.longitude === "string" ? Number(shop.longitude) : shop.longitude;
  const hasCoordinates =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude);
  const directionsHref = hasCoordinates
    ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
    : null;
  const workspaceHref =
    userState.hasWorkspaceAccess && userState.hasCompletedOnboarding && userState.shopSlug
      ? `/${userState.shopSlug}/dashboard`
      : null;

  return (
    <main className="min-h-screen bg-[#F7F6F3] font-sans">

      {/* Top nav bar */}
      <header className="sticky top-0 z-40 bg-[#F7F6F3]/90 backdrop-blur-md border-b border-black/6">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black">
              {shop.logo_url ? (
                <Image
                  src={shop.logo_url}
                  alt={shop.name}
                  width={36}
                  height={36}
                  className="h-9 w-9 object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-white">
                  {shop.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-black leading-tight">{shop.name}</p>
              <p className="truncate text-[11px] text-black/40 leading-tight">{shop.category || "Retail"}</p>
            </div>
          </div>

          {workspaceHref ? (
            <Link
              href={workspaceHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-black px-4 text-xs font-semibold text-white transition-opacity hover:opacity-75 active:opacity-60 shrink-0"
            >
              <Store className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Workspace</span>
              <span className="sm:hidden">Open</span>
            </Link>
          ) : (
            <div className="h-8 w-8 shrink-0" />
          )}
        </div>
      </header>

      <div className="mx-auto max-w-lg px-5">

        {/* Hero */}
        <section className="pt-10 pb-8">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-lg shadow-black/10">
              {shop.logo_url ? (
                <Image
                  src={shop.logo_url}
                  alt={shop.name}
                  width={80}
                  height={80}
                  className="h-20 w-20 object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-white">
                  {shop.name.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              {shop.category && (
                <span className="inline-block rounded-full bg-black/6 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-black/50 mb-2">
                  {shop.category}
                </span>
              )}
              <h1 className="text-2xl font-bold text-black leading-tight tracking-tight">
                {shop.name}
              </h1>
              <p className="mt-0.5 font-mono text-xs text-black/30">/{shop.slug}</p>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-black/55">
            Visit the shop, contact the team, and get help with electronics retail service, product availability, billing, and day-to-day support.
          </p>

          {(directionsHref || shop.phone) && (
            <div className="mt-6 flex gap-3">
              {directionsHref && (
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 h-11 items-center justify-center gap-2 rounded-xl bg-black text-white text-sm font-semibold transition-opacity hover:opacity-80 active:opacity-60"
                >
                  <Navigation className="h-4 w-4" />
                  Directions
                </a>
              )}
              {shop.phone && (
                <a
                  href={`tel:${shop.phone}`}
                  className="inline-flex flex-1 h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-black text-sm font-semibold transition-colors hover:bg-black/4 active:bg-black/8"
                >
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              )}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="h-px w-full bg-black/8" />

        {/* Info section */}
        <section className="py-8 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-black/30 mb-5">
            Contact & Location
          </p>

          {address && (
            <InfoRow
              icon={<MapPin className="h-4 w-4" />}
              label="Address"
              value={address}
            />
          )}

          {hasCoordinates && (
            <div className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-sm shadow-black/4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-black/50">
                <Navigation className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-black/30">Map</p>
                <p className="mt-0.5 font-mono text-xs text-black/50">{latitude}, {longitude}</p>
                {directionsHref && (
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-black transition-opacity hover:opacity-60"
                  >
                    Open in Google Maps
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {shop.phone && (
            <div className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-sm shadow-black/4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-black/50">
                <Phone className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-black/30">Phone</p>
                <a href={`tel:${shop.phone}`} className="mt-0.5 block text-sm font-medium text-black hover:opacity-60 transition-opacity">
                  {shop.phone}
                </a>
              </div>
            </div>
          )}

          {shop.email && (
            <div className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-sm shadow-black/4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-black/50">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-black/30">Email</p>
                <a href={`mailto:${shop.email}`} className="mt-0.5 block break-all text-sm font-medium text-black hover:opacity-60 transition-opacity">
                  {shop.email}
                </a>
              </div>
            </div>
          )}
        </section>

        {/* Bottom padding */}
        <div className="pb-10" />
      </div>
    </main>
  );
}

// Small helper component — purely presentational
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-sm shadow-black/4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5 text-black/50">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-black/30">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-black/80 leading-relaxed">{value}</p>
      </div>
    </div>
  );
}
