import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, CreditCard } from "lucide-react";

import { ProfileMenu } from "@/app/_components/profile-menu";
import { DodoSubscriptionCheckout } from "@/app/subscribe/start/dodo-subscription-checkout";
import { PaidSubscriptionPhoneModal } from "@/app/subscribe/start/paid-subscription-phone-modal";
import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchActiveSaasPlanByCode } from "@/lib/subscription/public-plans";
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
  if (error === "server_not_configured") return "Server billing configuration is missing.";
  if (error === "valid_phone_required") return "Enter a valid 10-digit mobile number before continuing.";
  if (error === "owner_required") return "Only the active shop owner can change this subscription.";
  if (error) return decodeURIComponent(error);
  return null;
}

export default async function StartSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; billing?: string; error?: string; checkout?: string; intent?: string }>;
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

  const { data: plan } = await fetchActiveSaasPlanByCode<{
      id: string;
      code: "starter" | "growth" | "pro";
      display_name: string;
      tagline: string;
      description: string | null;
      features: string[] | null;
      limits: { products?: number | null; invoices_per_month?: number | null } | null;
      support_level: "standard" | "priority";
      saas_plan_prices: Array<{
        id: string;
        interval: "month" | "year";
        regular_price_paise: number;
        discounted_price_paise: number | null;
        discount_enabled: boolean;
        provider_trial_days: number | null;
      }> | null;
    }>(
      supabase,
      planCode,
      "id, code, display_name, tagline, description, features, limits, support_level, saas_plan_prices(id, interval, regular_price_paise, discounted_price_paise, discount_enabled, provider_trial_days)",
    );

  const price = plan?.saas_plan_prices?.find((item) => item.interval === billingInterval);
  const effectivePrice =
    price?.discount_enabled && price.discounted_price_paise !== null
      ? price.discounted_price_paise
      : price?.regular_price_paise;
  const trialDays = price?.provider_trial_days ?? 0;

  const displayName = state.profile?.full_name ?? state.user.user_metadata.full_name ?? state.user.email ?? "User";
  const userEmail = state.profile?.email ?? state.user.email ?? "";
  const userInitials = (displayName.slice(0, 1) || "U").toUpperCase();
  const message = errorCopy(query.error);
  const pendingIntentQuery = supabase
    .from("subscription_intents")
    .select("id, owner_user_id, provider_checkout_url, status")
    .eq("owner_user_id", state.user.id)
    .eq("plan_code", planCode)
    .eq("billing_interval", billingInterval)
    .eq("provider", "dodo")
    .eq("status", "payment_pending")
    .not("provider_checkout_url", "is", null)
    .neq("last_payment_status", "FAILED")
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: pendingIntent } = query.intent
    ? await pendingIntentQuery.eq("id", query.intent).maybeSingle<{
        id: string;
        owner_user_id: string;
        provider_checkout_url: string | null;
        status: string;
      }>()
    : await pendingIntentQuery.maybeSingle<{
        id: string;
        owner_user_id: string;
        provider_checkout_url: string | null;
        status: string;
      }>();

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

        {query.checkout === "created" ? (
          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            Your secure checkout is ready. Continue to add your payment method.
          </div>
        ) : null}

        {query.checkout === "returned" ? (
          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
            Payment setup received. If it was successful, your subscription will activate shortly. You can refresh this page in a moment; once confirmed, we will send you to shop setup.
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

        <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-1 h-5 w-5 text-stone-500" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-stone-950">{pendingIntent?.provider_checkout_url ? "Complete secure checkout" : "Payment setup"}</h3>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                {pendingIntent?.provider_checkout_url
                  ? "Your checkout link is ready. Continue securely to finish subscription setup."
                  : trialDays > 0
                    ? `Add a payment method now. Your ${trialDays}-day trial starts after setup, and billing begins automatically when it ends.`
                    : "Add a payment method now so your subscription renews automatically."}
              </p>
            </div>
          </div>
          {pendingIntent?.provider_checkout_url ? (
            <DodoSubscriptionCheckout checkoutUrl={pendingIntent.provider_checkout_url} />
          ) : (
            <PaidSubscriptionPhoneModal
              planCode={planCode}
              billingInterval={billingInterval}
              planName={plan?.display_name ?? planCode}
            />
          )}
        </section>

        <div className="mt-5 grid gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-700">
          {(plan?.features ?? ["Inventory", "Invoices", "Basic PDF invoice"]).slice(0, 5).map((feature) => (
            <div key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}
