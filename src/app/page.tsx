import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fef3c7,_#fff7ed_35%,_#f5f5f4_72%)] px-4 py-6 text-stone-950">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm flex-col justify-between rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(146,64,14,0.12)] backdrop-blur md:max-w-md lg:max-w-lg">
        <section className="space-y-6">
          <div className="flex items-center justify-between text-sm">
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">
              DukaanHQ
            </span>
            <span className="text-stone-500">Retail OS for shops</span>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
              {user ? "Back in your workspace" : "Start your shop online"}
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Billing, inventory, and storefronts in one mobile-first system.
            </h1>
            <p className="text-sm leading-6 text-stone-600">
              Built for electronics shops first. Create your shop, manage stock,
              generate bills, and later open your own online storefront.
            </p>
          </div>

          {user ? (
            <div className="grid gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-stone-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">
                    Signed in
                  </p>
                  <p className="mt-2 text-lg font-medium">
                    Welcome back, {user.user_metadata.full_name ?? user.email}.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700">
                  Active session
                </span>
              </div>
              <p className="text-sm leading-6 text-stone-700">
                Your account is connected. Continue to your dashboard or start the
                onboarding flow for your shop.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 rounded-3xl bg-stone-950 p-4 text-stone-50">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-amber-300">
                  Launch flow
                </p>
                <p className="mt-2 text-lg font-medium">
                  Sign in with Google, onboard your shop, and start selling.
                </p>
              </div>
              <ul className="space-y-2 text-sm text-stone-300">
                <li>Inventory for mobiles and accessories</li>
                <li>Fast billing with invoice generation</li>
                <li>Multi-tenant setup for many shops</li>
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-3">
          {user ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/app"
                className="flex h-12 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Open Dashboard
              </Link>
              <Link
                href="/onboarding"
                className="flex h-12 items-center justify-center rounded-full border border-stone-300 text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
              >
                Go to Onboarding
              </Link>
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="flex h-12 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-stone-950 transition hover:bg-amber-400"
            >
              Get Started
            </Link>
          )}

          <div className="grid grid-cols-3 gap-2 text-center text-xs text-stone-500">
            <div className="rounded-2xl border border-stone-200 p-3">Google Auth</div>
            <div className="rounded-2xl border border-stone-200 p-3">Cloudinary</div>
            <div className="rounded-2xl border border-stone-200 p-3">Supabase</div>
          </div>
        </section>
      </div>
    </main>
  );
}
