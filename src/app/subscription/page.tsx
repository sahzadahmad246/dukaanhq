import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Ban,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Layers3,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { WorkspaceShell } from "@/app/_components/workspace-shell";
import { CancelRenewalConfirmButton } from "@/app/subscription/_components/cancel-renewal-confirm-button";
import {
  cancelCurrentShopSubscriptionAction,
  changeCurrentShopSubscriptionPlanAction,
  resumeCurrentShopSubscriptionRenewalAction,
} from "@/app/subscription/actions";
import { PaidSubscriptionPhoneModal } from "@/app/subscribe/start/paid-subscription-phone-modal";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { listDodoPaymentsForSubscription, retrieveDodoSubscription } from "@/lib/dodo/client";
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

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-IN") : "—";
}

function planRank(code: "starter" | "growth" | "pro") {
  return code === "starter" ? 1 : code === "growth" ? 2 : 3;
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

function compactDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function SubscriptionManagePage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; updated?: string; scheduled?: string; resumed?: string; error?: string }>;
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
    .select("id, status, billing_interval, current_period_start, current_period_end, trial_started_at, trial_ends_at, next_payment_at, last_payment_at, last_payment_status, cancel_at_period_end, provider, provider_subscription_id, provider_customer_id, plan_id, price_id")
    .eq("shop_id", state.membership.shop_id)
    .maybeSingle<{
      id: string;
      status: string;
      billing_interval: "month" | "year";
      current_period_start: string | null;
      current_period_end: string | null;
      trial_started_at: string | null;
      trial_ends_at: string | null;
      next_payment_at: string | null;
      last_payment_at: string | null;
      last_payment_status: string | null;
      cancel_at_period_end: boolean;
      provider: string | null;
      provider_subscription_id: string | null;
      provider_customer_id: string | null;
      plan_id: string | null;
      price_id: string | null;
    }>();

  const { data: plans } = await supabase
    .from("saas_plans")
    .select("id, code, display_name, tagline, limits, entitlements, support_level, saas_plan_prices(id, interval, regular_price_paise, discounted_price_paise, discount_enabled, provider_product_id, is_active)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<Array<{
      id: string;
      code: "starter" | "growth" | "pro";
      display_name: string;
      tagline: string;
      limits: { products?: number | null; invoices_per_month?: number | null; staff?: number | null } | null;
      entitlements: Record<string, boolean> | null;
      support_level: "standard" | "priority";
      saas_plan_prices: Array<{
        id: string;
        interval: "month" | "year";
        regular_price_paise: number;
        discounted_price_paise: number | null;
        discount_enabled: boolean;
        provider_product_id: string | null;
        is_active: boolean;
      }> | null;
    }>>();

  const { data: latestPlanChange } = await supabase
    .from("subscription_events")
    .select("payload, created_at")
    .eq("shop_id", state.membership.shop_id)
    .eq("provider", "dodo")
    .eq("event_type", "OWNER_SCHEDULED_PLAN_CHANGE")
    .eq("processed_status", "scheduled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ payload: Record<string, unknown>; created_at: string }>();

  const currentPlan = plans?.find((plan) => plan.id === ent?.plan_id || plan.id === currentSubscription?.plan_id) ?? null;
  const billingInterval = currentSubscription?.billing_interval ?? "month";
  const currentPrice = currentPlan?.saas_plan_prices?.find((price) => price.interval === billingInterval) ?? null;
  const latestPlanChangePayload = latestPlanChange?.payload ?? null;
  const scheduledPlanName =
    typeof latestPlanChangePayload?.target_plan_name === "string" ? latestPlanChangePayload.target_plan_name : null;
  const scheduledBillingInterval =
    latestPlanChangePayload?.target_billing_interval === "year" ? "year" : latestPlanChangePayload?.target_billing_interval === "month" ? "month" : null;
  const scheduledEffectiveDate =
    typeof latestPlanChangePayload?.current_period_end === "string" ? latestPlanChangePayload.current_period_end : currentSubscription?.current_period_end;
  const hasDodoSubscription = Boolean(currentSubscription?.provider_subscription_id || ent?.provider_subscription_id);
  const dodoSubscriptionId = currentSubscription?.provider_subscription_id ?? ent?.provider_subscription_id ?? null;
  const dodoSubscription = dodoSubscriptionId
    ? await retrieveDodoSubscription(dodoSubscriptionId).catch(() => null)
    : null;
  const dodoPayments = dodoSubscriptionId
    ? await listDodoPaymentsForSubscription(dodoSubscriptionId).catch(() => null)
    : null;
  const succeededPayments = (dodoPayments?.items ?? []).filter((payment) => payment.status === "succeeded");
  const dodoTrialing =
    Boolean(dodoSubscription?.trial_period_days && dodoSubscription.trial_period_days > 0) &&
    succeededPayments.length === 1 &&
    succeededPayments[0]?.total_amount === 0 &&
    Boolean(dodoSubscription?.next_billing_date);
  const trialStartedAt = ent?.trial_started_at ?? currentSubscription?.trial_started_at ?? (dodoTrialing ? dodoSubscription?.created_at : null);
  const trialEndsAt = ent?.trial_ends_at ?? currentSubscription?.trial_ends_at ?? (dodoTrialing ? dodoSubscription?.next_billing_date : null);
  const canAddPaymentForCurrentPlan =
    Boolean(currentPlan) &&
    state.membership.role === "owner" &&
    (!hasDodoSubscription || ent?.billing_status === "trialing" || ent?.billing_status === "locked");
  const cancelAtPeriodEnd =
    currentSubscription?.cancel_at_period_end === true ||
    dodoSubscription?.cancel_at_next_billing_date === true ||
    (!cancelColError && cancelRow?.cancel_at_period_end === true);
  const accessUntil = ent?.subscription_valid_until ?? currentSubscription?.current_period_end ?? dodoSubscription?.next_billing_date ?? null;
  const nextPaymentAt = currentSubscription?.next_payment_at ?? dodoSubscription?.next_billing_date ?? currentSubscription?.current_period_end ?? null;
  const cancelEffectiveAt = currentSubscription?.current_period_end ?? dodoSubscription?.next_billing_date ?? ent?.subscription_valid_until ?? null;

  const statusLabel =
    dodoTrialing
      ? "Free trial"
      : ent?.billing_status === "active"
      ? "Active (paid)"
      : ent?.billing_status === "trialing"
        ? "Free trial"
        : ent?.billing_status === "locked"
          ? "Locked"
          : "Unknown";

  return (
    <WorkspaceShell
      title="Subscription"
      activeNav={null}
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
            {query.scheduled === "1"
              ? "Plan change scheduled for the next billing cycle."
              : query.resumed === "1"
                ? "Future renewals are active again."
                : "Subscription updated successfully."}
          </div>
        ) : null}
        {query.error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-950">
            Could not update subscription. Please check the selected plan and payment setup.
          </div>
        ) : null}

        <div className="rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className={["flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", hasAccess ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"].join(" ")}>
              {hasAccess ? <ShieldCheck className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Subscription</p>
                <span className={["rounded-full px-2.5 py-1 text-[11px] font-bold", hasAccess ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"].join(" ")}>
                  {statusLabel}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-normal text-stone-950">{currentPlan?.display_name ?? "No plan linked"}</h1>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                {hasAccess
                  ? currentPlan?.tagline ?? "Your shop can use active subscription features."
                  : blockReason === "trial_ended"
                    ? "Trial ended. Subscribe to restore access."
                    : blockReason === "subscription_ended"
                      ? "Paid period ended. Renew to restore access."
                      : "Subscribe to use DukaanHQ for this shop."}
              </p>
            </div>
          </div>
          {!hasAccess ? (
            <Link href={shop?.slug ? buildShopRoute(shop.slug, "subscribe") : "/subscribe"} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-bold text-white">
              Go to subscribe
            </Link>
          ) : null}
        </div>

        {cancelAtPeriodEnd ? (
          <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700">
                <Ban className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-950">Renewal is cancelled</p>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  Your plan benefits stay active until {compactDate(cancelEffectiveAt)}. You can resume future renewals anytime before that date.
                </p>
              </div>
            </div>
            {currentSubscription?.provider === "dodo" && currentSubscription.provider_subscription_id ? (
              <form action={resumeCurrentShopSubscriptionRenewalAction} className="mt-4">
                <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-amber-950 px-4 text-sm font-bold text-white transition hover:bg-amber-900">
                  <RotateCcw className="h-4 w-4" />
                  Resume future renewals
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-700"><Layers3 className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Current plan</p>
                <p className="mt-1 text-base font-bold text-stone-950">{currentPlan?.display_name ?? "No plan linked"}</p>
              </div>
            </div>
            <p className="mt-4 text-lg font-black text-stone-950">{planPriceText(currentPrice)}</p>
            <p className="mt-1 text-xs font-medium text-stone-500">{billingInterval === "year" ? "Yearly billing" : "Monthly billing"} · Prices include taxes.</p>
          </div>

          <div className="rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-700"><CalendarClock className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Billing timeline</p>
                <p className="mt-1 text-base font-bold text-stone-950">{cancelAtPeriodEnd ? `Ends ${compactDate(cancelEffectiveAt)}` : `Next payment ${compactDate(nextPaymentAt)}`}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {trialStartedAt || trialEndsAt ? (
                <>
                  <div className="flex justify-between gap-3 rounded-2xl bg-stone-50 px-3 py-2">
                    <span className="text-stone-500">Trial started</span>
                    <span className="font-semibold text-stone-900">{formatDateTime(trialStartedAt)}</span>
                  </div>
                  <div className="flex justify-between gap-3 rounded-2xl bg-stone-50 px-3 py-2">
                    <span className="text-stone-500">Trial ends</span>
                    <span className="font-semibold text-stone-900">{formatDateTime(trialEndsAt)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-3 rounded-2xl bg-stone-50 px-3 py-2">
                <span className="text-stone-500">{cancelAtPeriodEnd ? "Benefits until" : "Access valid until"}</span>
                <span className="font-semibold text-stone-900">{formatDateTime(accessUntil)}</span>
              </div>
            </div>
          </div>
        </div>

        {canAddPaymentForCurrentPlan && currentPlan ? (
          <div className="rounded-[1.75rem] border border-sky-200 bg-sky-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-700"><CreditCard className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-sky-950">{ent?.billing_status === "trialing" || dodoTrialing ? "Keep this plan after trial" : "Activate payment for this plan"}</p>
                <p className="mt-1 text-sm leading-6 text-sky-900">Add a payment method now so billing can continue after your current access ends.</p>
              </div>
            </div>
            <div className="mt-4">
              <PaidSubscriptionPhoneModal planCode={currentPlan.code} billingInterval={billingInterval} planName={currentPlan.display_name} />
            </div>
          </div>
        ) : null}

        <div className="rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-700"><RefreshCw className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Change plan</p>
              <p className="mt-1 text-sm font-medium text-stone-600">Changes apply on the next billing date for your {billingInterval === "year" ? "yearly" : "monthly"} cycle.</p>
            </div>
          </div>
          {scheduledPlanName ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">
              Scheduled: {scheduledPlanName} ({scheduledBillingInterval === "year" ? "yearly" : "monthly"}) from {formatDateTime(scheduledEffectiveDate)}.
            </div>
          ) : null}
          <div className="mt-4 grid gap-2">
            {(plans ?? []).map((plan) => {
              const periodPrice = plan.saas_plan_prices?.find((price) => price.interval === billingInterval) ?? null;
              const isCurrent = currentPlan?.id === plan.id;
              const direction = currentPlan && planRank(plan.code) > planRank(currentPlan.code) ? "Upgrade" : currentPlan && planRank(plan.code) < planRank(currentPlan.code) ? "Downgrade" : "Switch";
              const actionLabel = isCurrent ? hasDodoSubscription ? "Current plan" : "Add payment above" : `${direction} to ${plan.display_name}`;
              return (
                <div key={plan.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-stone-950">{plan.display_name}</p>
                        {isCurrent ? <span className="rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-bold text-white">Active</span> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-stone-600">{plan.tagline}</p>
                      <p className="mt-2 text-xs font-bold text-stone-800">{planPriceText(periodPrice)}</p>
                    </div>
                    {isCurrent || !hasDodoSubscription ? (
                      <Link href={isCurrent ? "#" : `/subscribe/start?plan=${plan.code}&billing=${billingInterval}`} aria-disabled={isCurrent} className={["inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-3 text-xs font-bold transition", isCurrent ? "pointer-events-none bg-stone-200 text-stone-500" : "bg-stone-950 text-white hover:bg-stone-800"].join(" ")}>
                        {actionLabel}
                      </Link>
                    ) : (
                      <form action={changeCurrentShopSubscriptionPlanAction} className="shrink-0">
                        <input type="hidden" name="plan_code" value={plan.code} />
                        <input type="hidden" name="billing_interval" value={billingInterval} />
                        <button type="submit" disabled={!periodPrice?.provider_product_id} className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-950 px-3 text-xs font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500">
                          {periodPrice?.provider_product_id ? actionLabel : "Not configured"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-700"><CircleCheck className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Payment refs</p>
                <p className="mt-1 text-sm font-medium text-stone-600">For support only</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-3 rounded-2xl bg-stone-50 px-3 py-2">
                <dt className="text-stone-500">Subscription</dt>
                <dd className="font-mono text-xs text-stone-800">{maskReference(dodoSubscriptionId)}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-2xl bg-stone-50 px-3 py-2">
                <dt className="text-stone-500">Customer</dt>
                <dd className="font-mono text-xs text-stone-800">{maskReference(currentSubscription?.provider_customer_id ?? ent?.provider_customer_id)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[1.75rem] border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-stone-700"><Sparkles className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Renewal</p>
                <p className="mt-1 text-sm font-medium text-stone-600">{hasDodoSubscription ? "Managed securely by your payment provider." : "No active payment subscription yet."}</p>
              </div>
            </div>
            {!cancelAtPeriodEnd && currentSubscription?.provider === "dodo" && currentSubscription.provider_subscription_id ? (
              <form action={cancelCurrentShopSubscriptionAction} className="mt-4">
                <CancelRenewalConfirmButton benefitsUntil={compactDate(cancelEffectiveAt)} />
              </form>
            ) : null}
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
