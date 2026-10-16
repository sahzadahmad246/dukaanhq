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
    <SaasPlansBoard
      plans={typedPlans}
      initialBilling={billingInterval}
      initialEditId={query.edit ?? null}
      tableError={Boolean(error)}
    />
  );
}
