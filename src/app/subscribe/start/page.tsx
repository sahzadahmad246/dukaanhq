import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Clock, CreditCard } from "lucide-react";

import { ProfileMenu } from "@/app/_components/profile-menu";
import { startStarterTrialAction } from "@/app/subscribe/start/actions";
import { CashfreeSubscriptionCheckout } from "@/app/subscribe/start/cashfree-subscription-checkout";
import { PaidSubscriptionPhoneModal } from "@/app/subscribe/start/paid-subscription-phone-modal";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeBillingInterval,
  normalizePlanCode,
} from "@/lib/subscription/intents";

function formatMoney(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function errorCopy(error?: string) {
  if (error === "trial_already_used") return "This Google account has already used the Starter trial.";
  if (error === "server_not_configured") return "Server billing configuration is missing.";
  if (error === "trial_only_starter") return "Free trial is available only on Starter.";
  if (error === "valid_phone_required") return "Enter a valid 10-digit mobile number before starting Cashfree authorization.";
  if (error === "owner_required") return "Only the active shop owner can change this subscription.";
  if (error) return decodeURIComponent(error);
  return null;
}

export default async function StartSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; billing?: string; error?: string; cashfree?: string; intent?: string }>;
}) {
  const query = await searchParams;
  const planCode = normalizePlanCode(query.plan);
  const billingInterval = normalizeBillingInterval(query.billing);
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user) {
    redirect(`/auth/login?plan=${planCode}&billing=${billingInterval}`);
  }

  if (!state.hasCompletedOnboarding && state.hasApprovedSubscriptionIntent) {
    redirect("/onboarding");
  }

  const { data: plan } = await supabase
    .from("saas_plans")
    .select("id, code, display_name, tagline, description, features, limits, saas_plan_prices(id, interval, regular_price_paise, discounted_price_paise, discount_enabled)")
    .eq("code", planCode)
    .maybeSingle<{
      id: string;
      code: string;
      display_name: string;
      tagline: string;
      description: string | null;
      features: string[] | null;
      limits: { products?: number | null; invoices_per_month?: number | null } | null;
      saas_plan_prices: Array<{
        id: string;
        interval: "month" | "year";
        regular_price_paise: number;
        discounted_price_paise: number | null;
        discount_enabled: boolean;
      }> | null;
    }>();

  const price = plan?.saas_plan_prices?.find((item) => item.interval === billingInterval);
  const effectivePrice =
    price?.discount_enabled && price.discounted_price_paise !== null
      ? price.discounted_price_paise
      : price?.regular_price_paise;

  const displayName = state.profile?.full_name ?? state.user.user_metadata.full_name ?? state.user.email ?? "User";
  const userEmail = state.profile?.email ?? state.user.email ?? "";
  const userInitials = (displayName.slice(0, 1) || "U").toUpperCase();
  const message = errorCopy(query.error);
  const { data: pendingIntent } = query.intent
    ? await supabase
        .from("subscription_intents")
        .select("id, owner_user_id, cashfree_subscription_session_id, status")
        .eq("id", query.intent)
        .eq("owner_user_id", state.user.id)
        .maybeSingle<{
          id: string;
          owner_user_id: string;
          cashfree_subscription_session_id: string | null;
          status: string;
        }>()
    : { data: null };

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-white px-4 py-6 shadow-sm md:my-8 md:min-h-0 md:rounded-3xl md:border md:border-stone-200">
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <Link
            href="/pricing"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-50"
            aria-label="Back to pricing"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12.5 15 7.5 10l5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold">Start subscription</h1>
          <ProfileMenu
            userInitials={userInitials}
            userName={displayName}
            userEmail={userEmail}
            userAvatarUrl={state.profile?.avatar_url ?? state.user.user_metadata.avatar_url ?? state.user.user_metadata.picture ?? null}
            theme="light"
          />
        </header>

        {message ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            {message}
          </div>
        ) : null}

        {query.cashfree === "created" ? (
          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            Cashfree subscription intent was created. Open the authorization flow to approve recurring payments.
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Selected plan</p>
          <h2 className="mt-2 text-2xl font-bold text-stone-950">{plan?.display_name ?? planCode}</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">{plan?.tagline ?? "DukaanHQ subscription"}</p>
          <p className="mt-5 text-3xl font-black text-stone-950">
            {effectivePrice !== undefined ? formatMoney(effectivePrice) : "Not available"}
            <span className="ml-2 text-sm font-semibold text-stone-500">/ {billingInterval}</span>
          </p>
        </section>

        {planCode === "starter" ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3">
              <Clock className="mt-1 h-5 w-5 text-emerald-700" aria-hidden="true" />
              <div>
                <h3 className="font-bold text-emerald-950">7-day Starter trial</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-900">
                  Start the trial first. After trial approval, you can create your shop in onboarding. No shop data is created before this step.
                </p>
              </div>
            </div>
            <form action={startStarterTrialAction} className="mt-5">
              <input type="hidden" name="plan" value={planCode} />
              <input type="hidden" name="billing" value={billingInterval} />
              <button type="submit" className="w-full rounded-2xl bg-emerald-700 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-800">
                Start free trial and continue
              </button>
            </form>
          </section>
        ) : (
          <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <CreditCard className="mt-1 h-5 w-5 text-stone-500" aria-hidden="true" />
              <div>
                <h3 className="font-bold text-stone-950">Cashfree checkout is next</h3>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  This phase sets up the pre-onboarding subscription gate. Growth and Pro paid checkout will connect here in the Cashfree phase.
                </p>
              </div>
            </div>
            <PaidSubscriptionPhoneModal
              planCode={planCode}
              billingInterval={billingInterval}
              planName={plan?.display_name ?? planCode}
            />
            {pendingIntent?.cashfree_subscription_session_id ? (
              <CashfreeSubscriptionCheckout
                environment={process.env.CASHFREE_ENV === "production" ? "production" : "sandbox"}
                subscriptionSessionId={pendingIntent.cashfree_subscription_session_id}
              />
            ) : null}
          </section>
        )}

        <div className="mt-5 grid gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-700">
          {(plan?.features ?? ["Inventory", "Invoices", "Basic PDF invoice"]).slice(0, 5).map((feature) => (
            <div key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        <Link href={getSignedInLandingPath(state)} className="mt-6 text-center text-sm font-semibold text-stone-600 underline-offset-4 hover:text-stone-950 hover:underline">
          Continue without changing plan
        </Link>
      </div>
    </main>
  );
}
