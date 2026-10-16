"use client";

import { useMemo, useState } from "react";
import { Boxes, Check, Pencil, ReceiptText, Sparkles, Users, X } from "lucide-react";

import { SubscriptionActionButton } from "../../subscriptions/_components/subscription-action-button";
import { updateSaasPlanAction } from "@/app/admin/saas/actions";

export type PlanCode = "starter" | "growth" | "pro";
export type BillingInterval = "month" | "year";

export type PlanPriceRow = {
  id: string;
  interval: BillingInterval;
  regular_price_paise: number;
  discounted_price_paise: number | null;
  discount_enabled: boolean;
  discount_type: "none" | "percent" | "amount";
  discount_value: number;
  discount_ends_at: string | null;
  provider_product_id: string | null;
  provider_price_id: string | null;
  provider_trial_days: number | null;
};

export type PlanRow = {
  id: string;
  code: PlanCode;
  display_name: string;
  tagline: string;
  description: string | null;
  features: string[] | null;
  limits: {
    products?: number | null;
    invoices_per_month?: number | null;
    staff?: number | null;
    whatsapp_messages_per_month?: number | null;
  } | null;
  entitlements: Record<string, boolean> | null;
  support_level: "standard" | "priority";
  is_active: boolean;
  sort_order: number;
  saas_plan_prices: PlanPriceRow[] | null;
};

const planTone: Record<PlanCode, string> = {
  starter: "border-sky-200 bg-sky-50 text-sky-800",
  growth: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pro: "border-stone-900 bg-stone-950 text-white",
};

const entitlementLabels: Array<[keyof NonNullable<PlanRow["entitlements"]>, string]> = [
  ["inventory", "Inventory"],
  ["invoices", "Invoices"],
  ["basic_pdf_invoice", "Basic PDF invoices"],
  ["loan_emi_details", "Loan/EMI details"],
  ["customer_signature", "Customer signature"],
  ["shop_stamp", "Shop stamp"],
  ["staff_access", "Staff access"],
  ["public_shop_page", "Public shop page"],
  ["whatsapp_invoice_sending", "WhatsApp invoices"],
  ["auto_emi_reminders", "Auto EMI reminders"],
];

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function priceFor(plan: PlanRow, interval: BillingInterval) {
  return plan.saas_plan_prices?.find((price) => price.interval === interval) ?? null;
}

function effectivePrice(price: PlanPriceRow | null) {
  if (!price) return null;
  const discountStillValid = !price.discount_ends_at || new Date(price.discount_ends_at).getTime() >= Date.now();
  if (price.discount_enabled && discountStillValid && price.discounted_price_paise !== null) {
    return price.discounted_price_paise;
  }
  return price.regular_price_paise;
}

function discountSavings(price: PlanPriceRow | null) {
  const effective = effectivePrice(price);
  if (!price || effective === null || !price.discount_enabled || price.discounted_price_paise === null) return null;
  const savings = price.regular_price_paise - effective;
  return savings > 0 ? savings : null;
}

function rupees(price: PlanPriceRow | null) {
  return price ? price.regular_price_paise / 100 : 0;
}

function dateInputValue(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function limitText(value: number | null | undefined, unit: string) {
  return value == null ? `Unlimited ${unit}` : `${new Intl.NumberFormat("en-IN").format(value)} ${unit}`;
}

function discountText(price: PlanPriceRow | null) {
  if (!price?.discount_enabled || price.discounted_price_paise === null) return null;
  const isValid = !price.discount_ends_at || new Date(price.discount_ends_at).getTime() >= Date.now();
  if (!isValid) return null;

  const suffix = price.discount_ends_at ? ` until ${new Date(price.discount_ends_at).toLocaleDateString("en-IN")}` : "";
  if (price.discount_type === "percent") {
    return `${price.discount_value}% off${suffix}`;
  }
  if (price.discount_type === "amount") {
    return `${money(Math.round(Number(price.discount_value) * 100))} off${suffix}`;
  }
  return `Discount active${suffix}`;
}

function yearlySavingsText(plan: PlanRow) {
  const monthly = effectivePrice(priceFor(plan, "month"));
  const yearly = effectivePrice(priceFor(plan, "year"));
  if (monthly === null || yearly === null || monthly <= 0) return null;

  const annualizedMonthly = monthly * 12;
  if (yearly >= annualizedMonthly) return null;

  const percentage = Math.round(((annualizedMonthly - yearly) / annualizedMonthly) * 100);
  return percentage > 0 ? `Save ${percentage}%` : null;
}

function updatePlansUrl(interval: BillingInterval, editPlanId: string | null) {
  const params = new URLSearchParams();
  params.set("billing", interval);
  if (editPlanId) params.set("edit", editPlanId);
  window.history.pushState(null, "", `/admin/saas/plans?${params.toString()}`);
}

function DiscountFields({ prefix, price }: { prefix: "monthly" | "yearly"; price: PlanPriceRow | null }) {
  const enabled = price?.discount_enabled ?? false;
  const type = price?.discount_type ?? "none";

  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-[1fr_140px_150px]">
      <label className="flex items-center gap-3 text-sm font-semibold text-stone-800 sm:col-span-3">
        <input type="checkbox" name={`${prefix}_discount_enabled`} defaultChecked={enabled} className="h-4 w-4 rounded border-stone-300" />
        Temporary discount
      </label>
      <label className="grid gap-1 text-sm font-semibold text-stone-800">
        Discount type
        <select
          name={`${prefix}_discount_type`}
          defaultValue={type}
          className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-stone-950"
        >
          <option value="none">No discount</option>
          <option value="percent">Percent off</option>
          <option value="amount">Amount off</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-stone-800">
        Value
        <input
          name={`${prefix}_discount_value`}
          type="number"
          min={0}
          step={1}
          defaultValue={price?.discount_value ?? 0}
          className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-stone-950"
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-stone-800">
        Ends on
        <input
          name={`${prefix}_discount_ends_at`}
          type="date"
          defaultValue={dateInputValue(price?.discount_ends_at)}
          className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-stone-950"
        />
      </label>
    </div>
  );
}

function EditPlanModal({
  plan,
  onClose,
}: {
  plan: PlanRow;
  onClose: () => void;
}) {
  const monthly = priceFor(plan, "month");
  const yearly = priceFor(plan, "year");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl rounded-lg bg-white shadow-2xl">
        <form action={updateSaasPlanAction}>
          <input type="hidden" name="plan_id" value={plan.id} />
          <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Edit plan</p>
              <h2 className="mt-1 text-xl font-bold text-stone-950">{plan.display_name}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
              aria-label="Close plan editor"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="grid max-h-[calc(100vh-170px)] gap-5 overflow-y-auto px-5 py-5">
            <section className="grid gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Customer-facing info</h3>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Plan name
                <input name="display_name" required defaultValue={plan.display_name} className="h-11 rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-stone-950" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Short tagline
                <input name="tagline" required defaultValue={plan.tagline} className="h-11 rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-stone-950" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Description
                <textarea name="description" defaultValue={plan.description ?? ""} className="min-h-20 rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal outline-none focus:border-stone-950" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Support
                <select name="support_level" defaultValue={plan.support_level} className="h-11 rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-stone-950">
                  <option value="standard">Standard</option>
                  <option value="priority">Priority</option>
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm font-semibold text-stone-800">
                <input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="h-4 w-4 rounded border-stone-300" />
                Show this plan in pricing and allow new purchases
              </label>
            </section>

            <section className="grid gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Monthly price</h3>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Regular price in rupees
                <input name="monthly_price_rupees" type="number" min={0} step={1} defaultValue={rupees(monthly)} className="h-11 rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-stone-950" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Dodo monthly product ID
                <input
                  name="monthly_provider_product_id"
                  defaultValue={monthly?.provider_product_id ?? ""}
                  placeholder="prod_..."
                  className="h-11 rounded-lg border border-stone-300 px-3 font-mono text-sm font-normal outline-none focus:border-stone-950"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Dodo monthly trial days
                <input
                  name="monthly_provider_trial_days"
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  defaultValue={monthly?.provider_trial_days ?? 0}
                  className="h-11 rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-stone-950"
                />
              </label>
              <DiscountFields prefix="monthly" price={monthly} />
            </section>

            <section className="grid gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Yearly price</h3>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Regular price in rupees
                <input name="yearly_price_rupees" type="number" min={0} step={1} defaultValue={rupees(yearly)} className="h-11 rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-stone-950" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Dodo yearly product ID
                <input
                  name="yearly_provider_product_id"
                  defaultValue={yearly?.provider_product_id ?? ""}
                  placeholder="prod_..."
                  className="h-11 rounded-lg border border-stone-300 px-3 font-mono text-sm font-normal outline-none focus:border-stone-950"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-stone-800">
                Dodo yearly trial days
                <input
                  name="yearly_provider_trial_days"
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  defaultValue={yearly?.provider_trial_days ?? 0}
                  className="h-11 rounded-lg border border-stone-300 px-3 text-sm font-normal outline-none focus:border-stone-950"
                />
              </label>
              <DiscountFields prefix="yearly" price={yearly} />
            </section>

            <section className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
              <h3 className="text-sm font-semibold text-stone-700">Usage limits</h3>
              <p className="text-xs leading-relaxed text-stone-500">Leave a limit empty for unlimited usage. Changes apply to shops on this plan.</p>
              <div className="grid gap-3 sm:grid-cols-2">{([
                ["products", "Products"], ["invoices_per_month", "Invoices per month"], ["staff", "Team seats"], ["whatsapp_messages_per_month", "WhatsApp messages per month"],
              ] as const).map(([key, label]) => <label key={key} className="text-xs font-medium text-stone-600">{label}<input type="number" min="0" max="100000000" step="1" name={`limit_${key}`} defaultValue={plan.limits?.[key] ?? ""} placeholder="Unlimited" className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm" /></label>)}</div>
              <h3 className="pt-2 text-sm font-semibold text-stone-700">Feature access</h3>
              <div className="grid gap-3 sm:grid-cols-2">{entitlementLabels.map(([key, label]) => <label key={key} className="flex min-h-10 items-center gap-2 text-xs text-stone-600"><input type="checkbox" name={`entitlement_${key}`} defaultChecked={plan.entitlements?.[key] === true} className="h-4 w-4 accent-stone-900" />{label}</label>)}</div>
              <label className="block text-xs font-medium text-stone-600">Pricing page benefits (one per line)<textarea name="features" defaultValue={(plan.features ?? []).join("\n")} className="mt-2 min-h-32 w-full rounded-lg border border-stone-200 bg-white p-3 text-sm" /></label>
            </section>
          </div>

          <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-lg border border-stone-200 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
            >
              Cancel
            </button>
            <SubscriptionActionButton className="inline-flex min-h-11 items-center rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white hover:bg-stone-800">Save plan</SubscriptionActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  onEdit,
}: {
  plan: PlanRow;
  interval: BillingInterval;
  onEdit: () => void;
}) {
  const selectedPrice = priceFor(plan, interval);
  const selectedEffective = effectivePrice(selectedPrice);
  const enabledEntitlements = entitlementLabels.filter(([key]) => plan.entitlements?.[key]);
  const discount = discountText(selectedPrice);
  const savings = discountSavings(selectedPrice);
  const yearlySavings = interval === "year" ? yearlySavingsText(plan) : null;

  return (
    <article className="flex min-h-[520px] flex-col rounded-lg border border-stone-200 bg-white text-stone-950 shadow-sm">
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold uppercase tracking-wide ${planTone[plan.code]}`}>
              {plan.display_name}
            </span>
            <p className={`mt-3 inline-flex rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide ${
              plan.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"
            }`}>
              {plan.is_active ? "Active" : "Inactive"}
            </p>
            <h2 className="mt-6 text-xl font-bold text-stone-950">{plan.display_name}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">{plan.tagline}</p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-600 transition hover:bg-stone-50 hover:text-stone-950"
            aria-label={`Edit ${plan.display_name}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-7">
          {discount && savings ? (
            <div className="mb-3 inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
              {discount}
            </div>
          ) : null}
          <div className="flex min-h-[76px] flex-wrap items-end gap-x-2 gap-y-1">
            <p className="text-4xl font-bold tracking-normal text-stone-950">{selectedEffective !== null ? money(selectedEffective) : "Not set"}</p>
            <div className="pb-1 text-xs leading-4 text-stone-600">
              <p>INR / {interval === "month" ? "month" : "year"}</p>
              <p>{interval === "month" ? "billed monthly" : "billed annually"}</p>
            </div>
          </div>
          <div className="mt-1 min-h-6 text-sm text-stone-500">
            {discount && selectedPrice && savings ? (
              <p>
                <span className="line-through">{money(selectedPrice.regular_price_paise)}</span>
                <span className="ml-2 font-semibold text-emerald-700">Customers save {money(savings)}</span>
              </p>
            ) : yearlySavings ? (
              <p className="text-blue-700">{yearlySavings} compared with monthly billing</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-2 text-sm text-stone-700">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {limitText(plan.limits?.products, "products")}
          </div>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {limitText(plan.limits?.invoices_per_month, "invoices/month")}
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {limitText(plan.limits?.staff, "team seats")}
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-stone-400" aria-hidden="true" />
            {plan.support_level === "priority" ? "Priority support" : "Standard support"}
          </div>
        </div>

        <div className="my-6 h-px bg-stone-200" />

        <div className="grid gap-2">
          {(plan.features ?? []).map((feature) => (
            <div key={feature} className="flex items-start gap-2 text-sm leading-6 text-stone-700">
              <Check className="mt-1 h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-stone-200 p-5">
        <div className="flex flex-wrap gap-2">
          {enabledEntitlements.map(([, label]) => (
            <span key={label} className="rounded-md bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">
              {label}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function SaasPlansBoard({
  plans,
  initialBilling,
  initialEditId,
  tableError,
}: {
  plans: PlanRow[];
  initialBilling: BillingInterval;
  initialEditId: string | null;
  tableError?: boolean;
}) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(initialBilling);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(initialEditId);

  const editingPlan = useMemo(
    () => plans.find((plan) => plan.id === editingPlanId) ?? null,
    [editingPlanId, plans],
  );

  function setBilling(next: BillingInterval) {
    setBillingInterval(next);
    updatePlansUrl(next, editingPlanId);
  }

  function openEditor(planId: string) {
    setEditingPlanId(planId);
    updatePlansUrl(billingInterval, planId);
  }

  function closeEditor() {
    setEditingPlanId(null);
    updatePlansUrl(billingInterval, null);
  }

  return (
    <div className="space-y-6">
      {tableError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Plans table is not ready yet. Run <code className="font-mono">db/040_saas_plans.sql</code> in Supabase SQL Editor.
        </p>
      ) : null}

      <section className="rounded-lg border border-stone-200 bg-[#f7f7f5] px-4 py-10 text-stone-950 shadow-sm sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Pricing</p>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-stone-950 sm:text-4xl">Plans that grow with your shop</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Manage Starter, Growth, and Pro pricing, yearly billing, and temporary discounts from one place.
            </p>

            <div className="mt-8 inline-flex rounded-lg border border-stone-300 bg-stone-200/80 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setBilling("month")}
                className={`inline-flex h-10 min-w-28 items-center justify-center rounded-md px-4 text-sm font-semibold transition ${
                  billingInterval === "month" ? "bg-white text-stone-950 shadow-sm" : "text-stone-600 hover:text-stone-950"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling("year")}
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
              <PlanCard key={plan.id} plan={plan} interval={billingInterval} onEdit={() => openEditor(plan.id)} />
            ))}
          </div>

          <p className="mt-7 text-center text-xs leading-5 text-stone-500">
            Prices include applicable taxes. Temporary discounts only change the displayed/effective price, not the regular price.
          </p>
        </div>
      </section>

      {plans.length === 0 && !tableError ? (
        <div className="rounded-lg border border-stone-200 bg-white px-5 py-12 text-center text-sm text-stone-600">
          No plans found. Run <code className="font-mono">db/040_saas_plans.sql</code> to seed Starter, Growth, and Pro.
        </div>
      ) : null}

      {editingPlan ? <EditPlanModal plan={editingPlan} onClose={closeEditor} /> : null}
    </div>
  );
}
