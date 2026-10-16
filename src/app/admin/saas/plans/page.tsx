import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SaasPlansBoard, type BillingInterval, type PlanRow } from "@/app/admin/saas/plans/_components/saas-plans-board";
import { getAdminReadClient } from "@/lib/admin/auth";

export default async function SaasPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string; error?: string; billing?: string }>;
}) {
  const supabase = await getAdminReadClient();
  const query = await searchParams;
  const billingInterval: BillingInterval = query.billing === "year" ? "year" : "month";

  const { data: plans, error } = await supabase
    .from("saas_plans")
    .select("*, saas_plan_prices(*)")
    .order("sort_order", { ascending: true });

  const typedPlans = (plans ?? []) as PlanRow[];

  return (
    <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><p className="max-w-2xl leading-relaxed">The displayed price and the Dodo product price must match. Editing an app price does not reprice existing subscriptions.</p><Link href="/admin/saas/subscriptions/health" className="inline-flex min-h-10 items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Check billing setup →</Link></div>
    <SaasPlansBoard
      plans={typedPlans}
      initialBilling={billingInterval}
      initialEditId={query.edit ?? null}
      tableError={Boolean(error)}
    />
    </div>
  );
}
