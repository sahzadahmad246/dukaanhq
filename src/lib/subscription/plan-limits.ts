import type { SupabaseClient } from "@supabase/supabase-js";

type LimitKind = "products" | "invoices_per_month" | "staff";
type EntitlementKind = "staff_access" | "whatsapp_invoice_sending";

type PlanLimitResult =
  | { ok: true; planName: string | null; limit: number | null; used: number }
  | { ok: false; message: string; planName: string | null; limit: number | null; used: number };

type PlanAccessResult =
  | { ok: true; planName: string | null }
  | { ok: false; message: string; planName: string | null };

type PlanRow = {
  id: string;
  code: string;
  display_name: string;
  limits: Record<string, number | null | undefined> | null;
  entitlements: Record<string, boolean | undefined> | null;
};

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfNextMonth() {
  const start = startOfCurrentMonth();
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

async function getShopPlan(supabase: SupabaseClient, shopId: string): Promise<PlanRow | null> {
  const { data: entitlement } = await supabase
    .from("shop_entitlements")
    .select("plan_id")
    .eq("shop_id", shopId)
    .maybeSingle<{ plan_id: string | null }>();

  if (!entitlement?.plan_id) {
    return null;
  }

  const { data: plan } = await supabase
    .from("saas_plans")
    .select("id, code, display_name, limits, entitlements")
    .eq("id", entitlement.plan_id)
    .maybeSingle<PlanRow>();

  return plan ?? null;
}

async function countUsed(supabase: SupabaseClient, shopId: string, kind: LimitKind) {
  if (kind === "products") {
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId);
    return count ?? 0;
  }

  if (kind === "staff") {
    const { count } = await supabase
      .from("shop_members")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("status", "ACTIVE");
    return count ?? 0;
  }

  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .gte("invoice_date", startOfCurrentMonth().toISOString())
    .lt("invoice_date", startOfNextMonth().toISOString());
  return count ?? 0;
}

function limitLabel(kind: LimitKind) {
  if (kind === "products") return "inventory products";
  if (kind === "staff") return "active team members";
  return "invoices this month";
}

export async function checkPlanLimit(
  supabase: SupabaseClient,
  shopId: string,
  kind: LimitKind,
): Promise<PlanLimitResult> {
  const plan = await getShopPlan(supabase, shopId);
  if (!plan) {
    return { ok: true, planName: null, limit: null, used: 0 };
  }

  const limit = plan.limits?.[kind] ?? null;
  const used = await countUsed(supabase, shopId, kind);
  if (limit === null || limit === undefined) {
    return { ok: true, planName: plan.display_name, limit: null, used };
  }

  if (used >= limit) {
    return {
      ok: false,
      planName: plan.display_name,
      limit,
      used,
      message: `${plan.display_name} allows ${limit} ${limitLabel(kind)}. Upgrade your plan to add more.`,
    };
  }

  return { ok: true, planName: plan.display_name, limit, used };
}

export async function checkPlanEntitlement(
  supabase: SupabaseClient,
  shopId: string,
  entitlementKey: EntitlementKind,
  featureLabel: string,
): Promise<PlanAccessResult> {
  const plan = await getShopPlan(supabase, shopId);
  if (!plan) {
    return { ok: true, planName: null };
  }

  if (plan.entitlements?.[entitlementKey] === true) {
    return { ok: true, planName: plan.display_name };
  }

  return {
    ok: false,
    planName: plan.display_name,
    message: `${featureLabel} is not included in ${plan.display_name}. Upgrade your plan to use it.`,
  };
}
