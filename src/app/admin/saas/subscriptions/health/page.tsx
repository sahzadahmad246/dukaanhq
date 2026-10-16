import Link from "next/link";
import { scheduleAdminPriceCorrectionAction } from "../../actions";
import { ConfirmForm } from "../../_components/confirm-form";
import { SubscriptionActionButton } from "../_components/subscription-action-button";
import { CircleCheck, CircleAlert, ShieldCheck } from "lucide-react";
import { getAdminReadClient } from "@/lib/admin/auth";
import { checkAdminQuery } from "@/lib/admin/data";
import { adminDate, pageNumber } from "@/lib/admin/format";
import { retrieveDodoProduct } from "@/lib/dodo/client";
import { effectivePlanAmount, formatProviderAmount, validateDodoProductPrice, validateRecordedSubscription, type ExpectedDodoPrice, type RecordedSubscriptionPrice } from "@/lib/dodo/price-validation";
import { AdminHeading, AdminPanel, EmptyState, Pagination, adminButton, adminSecondary } from "../../_components/admin-ui";

type Price = ExpectedDodoPrice & { id: string; saas_plans: { display_name: string } | { display_name: string }[] | null };
export default async function BillingHealthPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const db = await getAdminReadClient(), page = pageNumber((await searchParams).page);
  const [pricesResult, subscriptionsResult] = await Promise.all([
    db.from("saas_plan_prices").select("id, interval, interval_count, currency, regular_price_paise, discounted_price_paise, discount_enabled, discount_ends_at, provider_product_id, is_active, saas_plans(display_name)").eq("is_active", true).order("regular_price_paise"),
    db.from("shop_subscriptions").select("id, shop_id, price_id, provider_subscription_id, status, shops(name, slug)", { count: "exact" }).eq("provider", "dodo").order("updated_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1),
  ]);
  checkAdminQuery(pricesResult.error, "billing prices"); checkAdminQuery(subscriptionsResult.error, "billing subscriptions");
  const prices = (pricesResult.data ?? []) as Price[];
  const checks = await Promise.all(prices.map(async price => {
    try {
      if (!price.provider_product_id) return { price, issue: "No Dodo product is configured.", actual: null };
      const product = await retrieveDodoProduct(price.provider_product_id);
      return { price, issue: validateDodoProductPrice(price, product), actual: product.price };
    } catch (error) { return { price, issue: error instanceof Error ? error.message : "Could not contact Dodo.", actual: null }; }
  }));
  const verifiedProducts = new Set(checks.filter(check => !check.issue).map(check => check.price.id));
  // Include inactive catalogue rows when evaluating existing subscriptions.
  const priceIds = [...new Set((subscriptionsResult.data ?? []).map(row => row.price_id).filter((id): id is string => Boolean(id)))];
  const historicPrices = priceIds.length ? await db.from("saas_plan_prices").select("id, interval, interval_count, currency, regular_price_paise, discounted_price_paise, discount_enabled, discount_ends_at, provider_product_id, is_active").in("id", priceIds) : { data: [], error: null };
  checkAdminQuery(historicPrices.error, "subscription prices");
  const priceById = new Map((historicPrices.data as (ExpectedDodoPrice & { id: string })[] ?? []).map(price => [price.id, price]));
  const subscriptions = await Promise.all((subscriptionsResult.data ?? []).map(async sub => {
    const result = await db.from("subscription_events").select("payload, created_at").eq("provider", "dodo").eq("shop_id", sub.shop_id)
      .eq("payload->data->>subscription_id", sub.provider_subscription_id ?? "")
      .not("payload->data->>recurring_pre_tax_amount", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    checkAdminQuery(result.error, "recorded billing snapshot");
    const payload = result.data?.payload as { data?: RecordedSubscriptionPrice } | null;
    const snapshot = payload?.data ?? null, price = priceById.get(sub.price_id ?? "");
    const issue = !snapshot ? "No recorded recurring-price snapshot. Check the subscription in Dodo." : !price ? "App plan price is missing." : validateRecordedSubscription(price, snapshot);
    return { sub, snapshot, price, issue, recordedAt: result.data?.created_at };
  }));
  const mode = process.env.DODO_PAYMENTS_ENVIRONMENT?.trim() || "not explicitly set (development defaults to test)";
  return <div className="space-y-6">
    <AdminHeading title="Billing health" description="Compare advertised app prices with Dodo products and recorded subscription renewals."><Link href="/admin/saas/subscriptions" className={adminSecondary}>Subscriptions</Link></AdminHeading>
    <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-xs leading-relaxed text-stone-500"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" /><div><p className="font-semibold text-stone-800">Dodo environment: {mode}</p><p className="mt-1">This check is read-only. It does not reprice, charge, cancel, or change customer access.</p></div></div>
    <AdminPanel title="Product price checks" description="Current Dodo product details are read live. Both amount and currency must match before checkout is allowed.">
      <div className="divide-y divide-stone-100">{checks.map(({ price, issue, actual }) => {
        const plan = Array.isArray(price.saas_plans) ? price.saas_plans[0] : price.saas_plans;
        return <div key={price.id} className="space-y-3 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{plan?.display_name ?? "Plan"} · {price.interval === "year" ? "Yearly" : "Monthly"}</p><p className="mt-1 text-xs text-stone-500">App: {formatProviderAmount(effectivePlanAmount(price), price.currency)}</p>{actual ? <p className="mt-1 text-xs text-stone-500">Dodo base: {formatProviderAmount(actual.price, actual.currency)} · {actual.payment_frequency_count} {actual.payment_frequency_interval}</p> : null}</div>{issue ? <CircleAlert className="h-5 w-5 text-amber-600" /> : <CircleCheck className="h-5 w-5 text-emerald-600" />}</div><p className={`rounded-xl p-3 text-xs leading-relaxed ${issue ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{issue ?? "Verified: amount, currency, and billing interval match."}</p><p className="break-all font-mono text-[10px] text-stone-400">{price.provider_product_id ?? "No product ID"}</p></div>;
      })}</div>
    </AdminPanel>
    <AdminPanel title="Existing subscription checks" description="Uses the latest stored recurring-price webhook for each subscription, not a current provider quote. Older customer prices can differ legitimately; verify the agreement before changing billing.">
      {subscriptions.length ? <div className="divide-y divide-stone-100">{subscriptions.map(({ sub, snapshot, price, issue, recordedAt }) => {
        const shop = Array.isArray(sub.shops) ? sub.shops[0] : sub.shops;
        return <div key={sub.id} className="space-y-3 p-4 sm:p-5"><Link className="text-sm font-semibold hover:underline" href={`/admin/saas/shops/${sub.shop_id}?tab=access`}>{shop?.name ?? sub.shop_id} →</Link><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-stone-400">Advertised plan</p><p className="mt-1 font-medium">{price ? formatProviderAmount(effectivePlanAmount(price), price.currency) : "Not found"}</p></div><div><p className="text-stone-400">Recorded renewal · before tax</p><p className="mt-1 font-medium">{snapshot?.recurring_pre_tax_amount != null && snapshot.currency ? formatProviderAmount(snapshot.recurring_pre_tax_amount, snapshot.currency) : "Not available"}</p></div></div><p className={`rounded-xl p-3 text-xs leading-relaxed ${issue ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{issue ?? "Recorded pricing matches the current app plan."}</p><p className="text-[11px] text-stone-400">Recorded {adminDate(recordedAt, true)}{snapshot?.status ? ` · provider status then: ${snapshot.status}` : ""}</p>{snapshot?.next_billing_date ? <p className="text-[11px] text-stone-400">Next billing date in snapshot: {adminDate(snapshot.next_billing_date)}</p> : null}{issue && price && verifiedProducts.has(price.id) && snapshot?.status === "active" ? <div className="space-y-2 border-t border-stone-100 pt-3"><p className="text-xs leading-relaxed text-stone-500">After verifying the customer&apos;s agreed price, schedule the verified app price for the next renewal. This does not collect historical differences or charge immediately.</p><ConfirmForm action={scheduleAdminPriceCorrectionAction} message={`Schedule ${formatProviderAmount(effectivePlanAmount(price), price.currency)} per ${price.interval} for ${shop?.name ?? "this shop"} from its next renewal? No immediate charge.`}><input type="hidden" name="shop_id" value={sub.shop_id} /><input type="hidden" name="price_id" value={price.id} /><SubscriptionActionButton className={adminButton}>Schedule corrected renewal</SubscriptionActionButton></ConfirmForm></div> : null}</div>;
      })}</div> : <EmptyState title="No Dodo subscriptions" />}
      <Pagination page={page} count={subscriptionsResult.count ?? 0} base="/admin/saas/subscriptions/health" />
    </AdminPanel>
  </div>;
}
