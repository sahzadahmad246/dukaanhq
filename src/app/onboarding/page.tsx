import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/_components/onboarding-form";
import { syncAuthenticatedUserProfile } from "@/lib/auth/sync-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const { user, profile, profileSyncReady } = await syncAuthenticatedUserProfile(supabase);

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <main className="h-screen bg-stone-100 text-stone-950">
      <div className="mx-auto flex h-screen w-full max-w-2xl flex-col overflow-y-auto bg-white px-4 py-4 md:px-6">
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
              aria-label="Back to app"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12.5 15 7.5 10l5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">Onboarding</h1>
          </div>

          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.full_name ?? "Profile"}
              width={44}
              height={44}
              className="h-11 w-11 rounded-full border border-stone-200 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">
              {(profile?.full_name ?? user.email ?? "U").slice(0, 1).toUpperCase()}
            </div>
          )}
        </header>

        {!profileSyncReady ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Run `db/001_profiles.sql` in Supabase first. Onboarding depends on the
            `profiles` table so we can upgrade the creator role from `customer` to `owner`.
          </div>
        ) : null}

        <div className="flex-1 pt-5">
          <OnboardingForm defaultBusinessEmail={profile?.email ?? user.email ?? ""} />
        </div>
      </div>
    </main>
  );
}
