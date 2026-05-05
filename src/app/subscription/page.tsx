import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { cancelCurrentShopSubscriptionAction } from "@/app/subscription/actions";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { buildShopRoute } from "@/lib/shop-routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
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

function planPriceText(
  price: { interval: string; regular_price_paise: number; discounted_price_paise: number | null; discount_enabled: boolean } | null,
) {
  if (!price) return "Price not configured";
  const amount = price.discount_enabled && price.discounted_price_paise !== null
    ? price.discounted_price_paise
    : price.regular_price_paise;
  return `${formatInrFromPaise(amount)} / ${price.interval === "year" ? "year" : "month"}`;
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

export default async function SubscriptionManagePage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; updated?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);
  const query = await searchParams;

  if (!state.user) {
    redirect("/auth/login");
  }

  if (!state.membership || !state.hasCompletedOnboarding) {
    redirect(getSignedInLandingPath(state));
  }

  if (state.membership.role !== "owner") {
    redirect(state.shopSlug ? buildShopRoute(state.shopSlug, "dashboard") : "/dashboard");
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id, name, slug, logo_url, address_line_1, city, state")
    .eq("id", state.membership.shop_id)
    .maybeSingle();

  if (shop?.slug) {
    if (!query.shop) {
      redirect(buildShopRoute(shop.slug, "subscription"));
    }

    if (query.shop !== shop.slug) {
      redirect(buildShopRoute(shop.slug, "subscription"));
    }
  }

  const { data: cancelRow, error: cancelColError } = await supabase
    .from("shop_entitlements")
    .select("cancel_at_period_end")
    .eq("shop_id", state.membership.shop_id)
    .maybeSingle();
  const ent = state.shopEntitlement;
  const hasAccess = shopHasProductAccess(ent, state.saasPlatform);
  const blockReason = subscriptionBlockReason(ent, state.saasPlatform);
  const { data: currentSubscription } = await supabase
    .from("shop_subscriptions")
    .select("id, status, billing_interval, current_period_start, current_period_end, next_payment_at, last_payment_at, last_payment_status, cancel_at_period_end, cashfree_subscription_id, cashfree_customer_id, plan_id")
    .eq("shop_id", state.membership.shop_id)
    .maybeSingle<{
      id: string;
      status: string;
      billing_interval: "month" | "year";
      current_period_start: string | null;
      current_period_end: string | null;
      next_payment_at: string | null;
      last_payment_at: string | null;
      last_payment_status: string | null;
      cancel_at_period_end: boolean;
      cashfree_subscription_id: string | null;
      cashfree_customer_id: string | null;
      plan_id: string | null;
    }>();

  const { data: plans } = await supabase
    .from("saas_plans")
    .select("id, code, display_name, tagline, limits, entitlements, saas_plan_prices(interval, regular_price_paise, discounted_price_paise, discount_enabled)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<Array<{
      id: string;
      code: "starter" | "growth" | "pro";
      display_name: string;
      tagline: string;
      limits: { products?: number | null; invoices_per_month?: number | null; staff?: number | null } | null;
      entitlements: Record<string, boolean> | null;
      saas_plan_prices: Array<{
        interval: "month" | "year";
        regular_price_paise: number;
        discounted_price_paise: number | null;
        discount_enabled: boolean;
      }> | null;
    }>>();

  const currentPlan = plans?.find((plan) => plan.id === ent?.plan_id || plan.id === currentSubscription?.plan_id) ?? null;
  const billingInterval = currentSubscription?.billing_interval ?? "month";
  const currentPrice = currentPlan?.saas_plan_prices?.find((price) => price.interval === billingInterval) ?? null;
  const cancelAtPeriodEnd =
    currentSubscription?.cancel_at_period_end === true ||
    (!cancelColError && cancelRow?.cancel_at_period_end === true);

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
      shopSlug={shop?.slug ?? null}
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
        {query.updated === "1" ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-950">
            Subscription updated successfully.
          </div>
        ) : null}

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
              href={shop?.slug ? buildShopRoute(shop.slug, "subscribe") : "/subscribe"}
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-stone-950 py-3 text-sm font-semibold text-white"
            >
              Go to subscribe
            </Link>
          ) : null}
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white px-4 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Plan</p>
          <p className="mt-2 text-lg font-semibold text-stone-950">{currentPlan?.display_name ?? "No plan linked"}</p>
          <p className="mt-1 text-sm text-stone-600">{currentPlan?.tagline ?? "Choose a plan to unlock subscription benefits."}</p>
          <p className="mt-3 text-base font-bold text-stone-950">{planPriceText(currentPrice)}</p>
          <p className="mt-1 text-xs font-medium text-stone-500">Prices include taxes.</p>
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
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Next payment</dt>
              <dd className="text-right font-medium text-stone-900">
                {currentSubscription?.next_payment_at
                  ? new Date(currentSubscription.next_payment_at).toLocaleString("en-IN")
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white px-4 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Change plan</p>
          <div className="mt-4 grid gap-3">
            {(plans ?? []).map((plan) => {
              const monthly = plan.saas_plan_prices?.find((price) => price.interval === "month") ?? null;
              const yearly = plan.saas_plan_prices?.find((price) => price.interval === "year") ?? null;
              const isCurrent = currentPlan?.id === plan.id;
              const actionLabel = isCurrent ? "Current plan" : plan.code === "starter" ? "Contact support" : "Switch to plan";
              return (
                <div key={plan.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-stone-950">{plan.display_name}</p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">{plan.tagline}</p>
                    </div>
                    {isCurrent ? (
                      <span className="rounded-full bg-stone-950 px-3 py-1 text-xs font-bold text-white">Active</span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-stone-700">
                    <span className="rounded-xl bg-white px-3 py-2">{planPriceText(monthly)}</span>
                    <span className="rounded-xl bg-white px-3 py-2">{planPriceText(yearly)}</span>
                  </div>
                  <Link
                    href={
                      isCurrent || plan.code === "starter"
                        ? "#"
                        : `/subscribe/start?plan=${plan.code}&billing=${billingInterval}`
                    }
                    aria-disabled={isCurrent || plan.code === "starter"}
                    className={[
                      "mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl text-sm font-bold transition",
                      isCurrent || plan.code === "starter"
                        ? "pointer-events-none bg-stone-200 text-stone-500"
                        : "bg-stone-950 text-white hover:bg-stone-800",
                    ].join(" ")}
                  >
                    {actionLabel}
                  </Link>
                </div>
              );
            })}
          </div>
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
              <dd className="font-mono text-xs text-stone-800">{maskReference(currentSubscription?.cashfree_subscription_id ?? ent?.cashfree_subscription_id)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Customer ref.</dt>
              <dd className="font-mono text-xs text-stone-800">{maskReference(currentSubscription?.cashfree_customer_id ?? ent?.cashfree_customer_id)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-5">
          <p className="text-sm font-semibold text-amber-950">Cancel or change plan</p>
          <p className="mt-2 text-sm text-amber-900">
            {cancelAtPeriodEnd
              ? "Cashfree reported a cancellation — access stays until the current period ends, then the app may lock until you resubscribe."
              : "Cancel stops future Cashfree charges. Access remains until the current paid period ends."}
          </p>
          {!cancelAtPeriodEnd && currentSubscription?.cashfree_subscription_id ? (
            <form action={cancelCurrentShopSubscriptionAction} className="mt-4">
              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-amber-300 bg-white text-sm font-bold text-amber-950 transition hover:bg-amber-100"
              >
                Cancel future renewals
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </WorkspaceShell>
  );
}
