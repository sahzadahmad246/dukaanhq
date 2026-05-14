"use client";

import { useState } from "react";
import Link from "next/link";
import { Boxes, Check, Minus, ReceiptText, Sparkles, Users } from "lucide-react";

export type BillingInterval = "month" | "year";
export type PlanCode = "starter" | "growth" | "pro";

export type PublicPlanPrice = {
  interval: BillingInterval;
  regular_price_paise: number;
  discounted_price_paise: number | null;
  discount_enabled: boolean;
  discount_type: "none" | "percent" | "amount";
  discount_value: number;
  discount_ends_at: string | null;
  provider_trial_days?: number | null;
};

export type PublicPlan = {
  id: string;
  code: PlanCode;
  display_name: string;
  tagline: string;
  description: string | null;
  features: string[];
  limits: {
    products?: number | null;
    invoices_per_month?: number | null;
    staff?: number | null;
  };
  entitlements: Record<string, boolean>;
  support_level: "standard" | "priority";
  saas_plan_prices: PublicPlanPrice[];
};

const planTone: Record<PlanCode, string> = {
  starter: "border-sky-200 bg-sky-50 text-sky-800",
  growth: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pro: "border-stone-950 bg-stone-950 text-white",
};

const comparisonRows = [
  { label: "Inventory products", type: "limit", key: "products", suffix: "products" },
  { label: "Invoices per month", type: "limit", key: "invoices_per_month", suffix: "invoices" },
  { label: "Staff access", type: "entitlement", key: "staff_access" },
  { label: "Basic PDF invoice", type: "entitlement", key: "basic_pdf_invoice" },
  { label: "Loan/EMI details in bill", type: "entitlement", key: "loan_emi_details" },
  { label: "Customer signature", type: "entitlement", key: "customer_signature" },
  { label: "Shop stamp on PDF", type: "entitlement", key: "shop_stamp" },
  { label: "Public shop page", type: "entitlement", key: "public_shop_page" },
  { label: "WhatsApp invoice sending", type: "entitlement", key: "whatsapp_invoice_sending" },
  { label: "Auto EMI reminders", type: "entitlement", key: "auto_emi_reminders" },
  { label: "Support", type: "support", key: "support_level" },
] as const;

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function priceFor(plan: PublicPlan, interval: BillingInterval) {
  return plan.saas_plan_prices.find((price) => price.interval === interval) ?? null;
}

function effectivePrice(price: PublicPlanPrice | null) {
  if (!price) return null;
  const discountStillValid = !price.discount_ends_at || new Date(price.discount_ends_at).getTime() >= Date.now();
  if (price.discount_enabled && discountStillValid && price.discounted_price_paise !== null) {
    return price.discounted_price_paise;
  }
  return price.regular_price_paise;
}

function discountText(price: PublicPlanPrice | null) {
  if (!price?.discount_enabled || price.discounted_price_paise === null) return null;
  const isValid = !price.discount_ends_at || new Date(price.discount_ends_at).getTime() >= Date.now();
  if (!isValid) return null;

  if (price.discount_type === "percent") {
    return `${price.discount_value}% off`;
  }
  if (price.discount_type === "amount") {
    return `${money(Math.round(Number(price.discount_value) * 100))} off`;
  }
  return "Discount active";
}

function yearlySavingsText(plan: PublicPlan) {
  const monthly = effectivePrice(priceFor(plan, "month"));
  const yearly = effectivePrice(priceFor(plan, "year"));
  if (monthly === null || yearly === null || monthly <= 0) return null;

  const annualizedMonthly = monthly * 12;
  if (yearly >= annualizedMonthly) return null;

  const percentage = Math.round(((annualizedMonthly - yearly) / annualizedMonthly) * 100);
  return percentage > 0 ? `Save ${percentage}%` : null;
}

function limitText(value: number | null | undefined, suffix: string) {
  return value == null ? `Unlimited ${suffix}` : `${new Intl.NumberFormat("en-IN").format(value)} ${suffix}`;
}

function comparisonValue(plan: PublicPlan, row: (typeof comparisonRows)[number]) {
  if (row.type === "limit") {
    const value = plan.limits[row.key as keyof PublicPlan["limits"]];
    return limitText(value, row.suffix);
  }

  if (row.type === "support") {
    return plan.support_level === "priority" ? "Priority" : "Standard";
  }

  return plan.entitlements[row.key] ? "yes" : "no";
}

function BooleanMark({ value }: { value: string }) {
  if (value === "yes") {
    return (
      <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-emerald-50 text-emerald-700">
        <Check className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (value === "no") {
    return (
      <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-stone-100 text-stone-400">
        <Minus className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return <span>{value}</span>;
}

function planRank(code: PlanCode) {
  return code === "starter" ? 1 : code === "growth" ? 2 : 3;
}

function PlanCard({
  plan,
  interval,
  currentPlanCode,
  currentBillingInterval,
  subscriptionHref,
}: {
  plan: PublicPlan;
  interval: BillingInterval;
  currentPlanCode?: PlanCode | null;
  currentBillingInterval?: BillingInterval | null;
  subscriptionHref?: string | null;
}) {
  const price = priceFor(plan, interval);
  const effective = effectivePrice(price);
  const discount = discountText(price);
  const yearlySavings = interval === "year" ? yearlySavingsText(plan) : null;
  const trialDays = price?.provider_trial_days ?? 0;
  const isCurrentPlan = currentPlanCode === plan.code && (!currentBillingInterval || currentBillingInterval === interval);
  const isDifferentSubscribedPlan = Boolean(currentPlanCode) && !isCurrentPlan;
  const direction = currentPlanCode && planRank(plan.code) > planRank(currentPlanCode)
    ? "Upgrade"
    : currentPlanCode && planRank(plan.code) < planRank(currentPlanCode)
      ? "Downgrade"
      : "Switch";
  const actionHref = isCurrentPlan
    ? subscriptionHref ?? "#"
    : isDifferentSubscribedPlan && subscriptionHref
      ? subscriptionHref
      : `/subscribe/start?plan=${plan.code}&billing=${interval}`;
  const actionLabel = isCurrentPlan
    ? "Current plan"
    : isDifferentSubscribedPlan
      ? `${direction} plan`
      : plan.code === "starter"
        ? "Start free trial"
        : "Choose plan";

  return (
    <article className="flex min-h-[520px] flex-col rounded-lg border border-stone-200 bg-white text-stone-950 shadow-sm">
      <div className="flex flex-1 flex-col p-6">
        <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-bold uppercase tracking-wide ${planTone[plan.code]}`}>
          {plan.display_name}
        </span>

        <h2 className="mt-6 text-xl font-bold text-stone-950">{plan.display_name}</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">{plan.tagline}</p>

        <div className="mt-7">
          <div className="flex min-h-[76px] flex-wrap items-end gap-x-2 gap-y-1">
            <p className="text-4xl font-bold tracking-normal text-stone-950">{effective !== null ? money(effective) : "Contact us"}</p>
            <div className="pb-1 text-xs leading-4 text-stone-600">
              <p>INR / {interval === "month" ? "month" : "year"}</p>
              <p>{interval === "month" ? "billed monthly" : "billed annually"}</p>
            </div>
          </div>
          <div className="mt-1 min-h-6 text-sm text-stone-500">
            {discount && price ? (
              <p>
                <span className="line-through">{money(price.regular_price_paise)}</span>
                <span className="ml-2 text-emerald-700">{discount}</span>
              </p>
            ) : yearlySavings ? (
              <p className="text-blue-700">{yearlySavings} compared with monthly billing</p>
            ) : null}
          </div>
        </div>

        <Link
          href={actionHref}
          className={plan.code === "pro"
            ? "mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800"
            : "mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold text-stone-900 transition hover:border-stone-400 hover:bg-stone-50"}
        >
          {actionLabel}
        </Link>
        {isCurrentPlan ? (
          <p className="mt-2 text-center text-xs font-semibold text-stone-500">
            Managing {currentBillingInterval === "year" ? "yearly" : "monthly"} subscription
          </p>
        ) : null}
        {trialDays > 0 && !isCurrentPlan ? (
          <p className="mt-2 text-center text-xs font-semibold text-emerald-700">
            {trialDays}-day trial with payment method
          </p>
        ) : null}

        <div className="mt-6 grid gap-2 text-sm text-stone-700">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {limitText(plan.limits.products, "products")}
          </div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {limitText(plan.limits.invoices_per_month, "invoices/month")}
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {limitText(plan.limits.staff, "team seats")}
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {plan.support_level === "priority" ? "Priority support" : "Standard support"}
          </div>
        </div>

        <div className="my-6 h-px bg-stone-200" />

        <div className="grid gap-2">
          {plan.features.map((feature) => (
            <div key={feature} className="flex items-start gap-2 text-sm leading-6 text-stone-700">
              <Check className="mt-1 h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function PublicPricingBoard({
  plans,
  currentPlanCode,
  currentBillingInterval,
  subscriptionHref,
}: {
  plans: PublicPlan[];
  currentPlanCode?: PlanCode | null;
  currentBillingInterval?: BillingInterval | null;
  subscriptionHref?: string | null;
}) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");

  return (
    <div className="space-y-12">
      <section className="text-stone-950">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Pricing</p>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-stone-950 sm:text-5xl">Plans that grow with your shop</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-stone-600">
            Start with simple inventory and billing. Upgrade when your shop needs staff, branded invoices, public shop pages, and WhatsApp automation.
          </p>

          <div className="mt-8 inline-flex rounded-lg border border-stone-300 bg-stone-200/80 p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setBillingInterval("month")}
              className={`inline-flex h-10 min-w-28 items-center justify-center rounded-md px-4 text-sm font-semibold transition ${
                billingInterval === "month" ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("year")}
              className={`inline-flex h-10 min-w-28 items-center justify-center rounded-md px-4 text-sm font-semibold transition ${
                billingInterval === "year" ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="mt-9 grid gap-5 xl:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              interval={billingInterval}
              currentPlanCode={currentPlanCode}
              currentBillingInterval={currentBillingInterval}
              subscriptionHref={subscriptionHref}
            />
          ))}
        </div>

        <p className="mt-7 text-center text-xs leading-5 text-stone-500">
          Prices include applicable taxes. Trials require payment setup and billing starts after the trial ends.
        </p>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Compare</p>
          <h2 className="mt-2 text-2xl font-bold text-stone-950">Plan comparison</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">A clear view of limits and access before you choose.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs font-bold uppercase tracking-wide text-stone-500">
                <th className="px-5 py-4">Feature</th>
                {plans.map((plan) => (
                  <th key={plan.id} className="px-5 py-4 text-center">{plan.display_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.label} className="border-b border-stone-100 last:border-0">
                  <td className="px-5 py-4 font-semibold text-stone-800">{row.label}</td>
                  {plans.map((plan) => {
                    const value = comparisonValue(plan, row);
                    return (
                      <td key={`${plan.id}-${row.label}`} className="px-5 py-4 text-center text-stone-700">
                        <BooleanMark value={value} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
