import Link from "next/link";
import { redirect } from "next/navigation";

import { ProfileMenu } from "@/app/_components/profile-menu";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DevActivateSubscriptionButton } from "@/app/subscribe/dev-activate-button";
import {
  mergePlatformSettings,
  subscriptionBlockReason,
} from "@/lib/subscription/access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatInrFromPaise(paise: number) {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);
  const query = await searchParams;

  if (!state.user) {
    redirect("/auth/login");
  }

  if (!state.hasWorkspaceAccess || !state.hasCompletedOnboarding) {
    redirect(getSignedInLandingPath(state));
  }

  if (state.canUseShopProduct) {
    redirect(state.shopSlug ? buildShopRoute(state.shopSlug, "dashboard") : "/dashboard");
  }

  if (state.shopSlug) {
    if (!query.shop) {
      redirect(buildShopRoute(state.shopSlug, "subscribe"));
    }

    if (query.shop !== state.shopSlug) {
      redirect(buildShopRoute(state.shopSlug, "subscribe"));
    }
  }

  const platform = mergePlatformSettings(state.saasPlatform);
  const reason = subscriptionBlockReason(state.shopEntitlement, state.saasPlatform);

  const displayName =
    state.profile?.full_name ?? state.user.user_metadata.full_name ?? state.user.email ?? "User";
  const userEmail = state.profile?.email ?? state.user.email ?? "";
  const userInitials = (displayName.slice(0, 1) || "U").toUpperCase();

  const reasonCopy =
    reason === "trial_ended"
      ? "Your free trial has ended. Subscribe to keep using DukaanHQ for this shop."
      : reason === "trial_disabled"
        ? "New trials are currently disabled on the platform. Subscribe to continue."
        : reason === "subscription_ended"
          ? "Your paid period has ended. Renew to restore access."
          : "This shop needs an active subscription to use DukaanHQ.";

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-white px-4 py-6 shadow-sm md:my-8 md:min-h-0 md:rounded-3xl md:border md:border-stone-200">
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
            aria-label="Back to home"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12.5 15 7.5 10l5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold">Subscribe</h1>
          <ProfileMenu
            userInitials={userInitials}
            userName={displayName}
            userEmail={userEmail}
            userAvatarUrl={
              state.profile?.avatar_url ??
              state.user.user_metadata.avatar_url ??
              state.user.user_metadata.picture ??
              null
            }
            theme="light"
          />
        </header>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {reasonCopy}
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Plan</p>
          <p className="mt-2 text-2xl font-bold text-stone-950">{platform.plan_display_name}</p>
          <p className="mt-1 text-lg text-stone-700">{formatInrFromPaise(platform.plan_price_paise)} / month</p>
          <p className="mt-4 text-sm text-stone-600">
            Choose a plan and complete secure checkout to restore access for this shop.
          </p>
          <Link
            href="/pricing"
            className="mt-5 flex w-full items-center justify-center rounded-2xl bg-stone-950 py-3.5 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Choose plan
          </Link>
          {process.env.DUKAANHQ_DEV_ACTIVATE_SUBSCRIPTION === "true" ? <DevActivateSubscriptionButton /> : null}
        </div>

        {state.shopEntitlement?.trial_ends_at ? (
          <p className="mt-4 text-center text-xs text-stone-500">
            Trial ended: {new Date(state.shopEntitlement.trial_ends_at).toLocaleString("en-IN")}
          </p>
        ) : null}

        {state.membership?.role === "owner" ? (
          <Link
            href={state.shopSlug ? buildShopRoute(state.shopSlug, "subscription") : "/subscription"}
            className="mt-6 block text-center text-sm font-semibold text-stone-700 underline-offset-4 hover:underline"
          >
            Manage subscription
          </Link>
        ) : null}
      </div>
    </main>
  );
}
