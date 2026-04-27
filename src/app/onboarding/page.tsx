import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileMenu } from "@/app/_components/profile-menu";
import { OnboardingForm } from "@/app/onboarding/_components/onboarding-form";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);
  const { user, profile, profileSyncReady, isOwner, hasCompletedOnboarding } = state;

  if (!user) {
    redirect("/auth/login");
  }

  if (isOwner && hasCompletedOnboarding) {
    redirect(getSignedInLandingPath(state));
  }

  const displayName = profile?.full_name ?? user.user_metadata.full_name ?? user.email ?? "User";
  const userEmail = profile?.email ?? user.email ?? "";
  const userInitials = (displayName.slice(0, 1) || "U").toUpperCase();

  return (
    <main className="h-screen bg-stone-100 text-stone-950">
      <div className="mx-auto flex h-screen w-full max-w-[645px] flex-col overflow-y-auto bg-white px-4 py-4 md:px-6">
        <header className="relative z-[1200] flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
              aria-label="Back to home"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12.5 15 7.5 10l5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">Onboarding</h1>
          </div>

          <ProfileMenu
            userInitials={userInitials}
            userName={displayName}
            userEmail={userEmail}
            userAvatarUrl={profile?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null}
            theme="light"
          />
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
