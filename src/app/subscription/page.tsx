import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mergePlatformSettings,
  shopHasProductAccess,
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

function maskReference(id: string | null | undefined) {
  if (!id) {
    return "—";
  }
  if (id.length <= 10) {
    return `••••${id.slice(-4)}`;
  }
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export default async function SubscriptionManagePage() {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user) {
    redirect("/auth/login");
  }

  if (!state.membership || !state.hasCompletedOnboarding) {
    redirect(getSignedInLandingPath(state));
  }

  if (state.membership.role !== "owner") {
    redirect("/dashboard");
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, slug, logo_url, address_line_1, city, state")
    .eq("id", state.membership.shop_id)
    .maybeSingle();

  const { data: cancelRow, error: cancelColError } = await supabase
    .from("shop_entitlements")
    .select("cancel_at_period_end")
    .eq("shop_id", state.membership.shop_id)
    .maybeSingle();
  const cancelAtPeriodEnd =
    !cancelColError && cancelRow?.cancel_at_period_end === true;

  const platform = mergePlatformSettings(state.saasPlatform);
  const ent = state.shopEntitlement;
  const hasAccess = shopHasProductAccess(ent, state.saasPlatform);
  const blockReason = subscriptionBlockReason(ent, state.saasPlatform);

  const statusLabel =
    ent?.billing_status === "active"
      ? "Active (paid)"
      : ent?.billing_status === "trialing"
        ? "Free trial"
        : ent?.billing_status === "locked"
          ? "Locked"
          : "Unknown";

  return (
    <WorkspaceShell
      title="Subscription"
      activeNav="staff"
      shopName={shop?.name ?? "Shop"}
      shopAddress={[shop?.address_line_1, shop?.city, shop?.state].filter(Boolean).join(", ")}
      shopLogoUrl={shop?.logo_url ?? null}
      ownerName={state.profile?.full_name ?? state.user.user_metadata.full_name ?? "Shop owner"}
      ownerEmail={state.profile?.email ?? state.user.email ?? ""}
      ownerRole="owner"
      saasAdminHref={state.profile?.role === "superadmin" ? "/admin/saas" : undefined}
      userAvatarUrl={
        state.profile?.avatar_url ??
        state.user.user_metadata.avatar_url ??
        state.user.user_metadata.picture ??
        null
      }
    >
      <section className="grid gap-4">
        <div className="rounded-3xl border border-stone-200 bg-white px-4 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Status</p>
          <p className="mt-2 text-xl font-semibold text-stone-950">{statusLabel}</p>
          <p className="mt-2 text-sm text-stone-600">
            {hasAccess
              ? "Your team can use inventory, billing, and staff features for this shop."
              : blockReason === "trial_ended"
                ? "Trial ended — subscribe to restore access."
                : blockReason === "subscription_ended"
                  ? "Paid period ended — renew to restore access."
                  : "Subscribe to use DukaanHQ for this shop."}
          </p>
          {!hasAccess ? (
            <Link
              href="/subscribe"
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-stone-950 py-3 text-sm font-semibold text-white"
            >
              Go to subscribe
            </Link>
          ) : null}
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white px-4 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Plan</p>
          <p className="mt-2 text-lg font-semibold text-stone-950">{platform.plan_display_name}</p>
          <p className="text-sm text-stone-600">{formatInrFromPaise(platform.plan_price_paise)} / month (excl. tax)</p>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white px-4 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Trial &amp; billing dates</p>
          <dl className="mt-3 grid gap-2 text-sm text-stone-700">
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Trial started</dt>
              <dd className="text-right font-medium text-stone-900">
                {ent?.trial_started_at ? new Date(ent.trial_started_at).toLocaleString("en-IN") : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Trial ends</dt>
              <dd className="text-right font-medium text-stone-900">
                {ent?.trial_ends_at ? new Date(ent.trial_ends_at).toLocaleString("en-IN") : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Subscription valid until</dt>
              <dd className="text-right font-medium text-stone-900">
                {ent?.subscription_valid_until
                  ? new Date(ent.subscription_valid_until).toLocaleString("en-IN")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white px-4 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Cashfree references</p>
          <p className="mt-2 text-sm text-stone-600">
            Shown for support. Full IDs live in your{" "}
            <a
              href="https://merchant.cashfree.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-stone-900 underline underline-offset-2"
            >
              Cashfree merchant dashboard
            </a>
            .
          </p>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Subscription ref.</dt>
              <dd className="font-mono text-xs text-stone-800">{maskReference(ent?.cashfree_subscription_id)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Customer ref.</dt>
              <dd className="font-mono text-xs text-stone-800">{maskReference(ent?.cashfree_customer_id)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-5">
          <p className="text-sm font-semibold text-amber-950">Cancel or change plan</p>
          <p className="mt-2 text-sm text-amber-900">
            {cancelAtPeriodEnd
              ? "Cashfree reported a cancellation — access stays until the current period ends, then the app may lock until you resubscribe."
              : "When Cashfree checkout is connected, customers manage mandates and cancellations in the Cashfree flow. Until then, email your support contact or use the merchant dashboard to stop charges."}
          </p>
        </div>
      </section>
    </WorkspaceShell>
  );
}
