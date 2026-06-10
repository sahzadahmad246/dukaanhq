import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { loadInventoryData } from "@/app/inventory/load-inventory-data";

export type DashboardStats = {
  totalRevenue: number;
  todayRevenue: number;
  monthRevenue: number;
  totalInvoices: number;
  todayInvoices: number;
  totalProducts: number;
  inStockItems: number;
  lowStockProducts: number;
  totalCustomers: number;
};

export type RecentInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_mobile?: string | null;
  billing_address?: string | null;
  customer_gst_number?: string | null;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  grand_total: number;
  payment_method: string;
  payment_details?: {
    methods?: string[];
    loan_provider?: string | null;
    loan_number?: string | null;
  } | null;
  payment_status: string;
  notes?: string | null;
  shop_name_snapshot: string;
  shop_address_snapshot?: string | null;
  shop_phone_snapshot?: string | null;
  shop_gst_snapshot?: string | null;
  invoice_footer_snapshot?: string | null;
  customer_signature_url?: string | null;
  send_ready_pdf_url?: string | null;
  invoice_items?: Array<{
    id: string;
    product_id: string | null;
    variant_id: string | null;
    inventory_item_id: string | null;
    product_name_snapshot: string;
    brand_name_snapshot?: string | null;
    category_name_snapshot?: string | null;
    variant_name_snapshot?: string | null;
    identifier_snapshot?: string | null;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    discount_amount: number;
    line_total: number;
  }>;
};

export type RecentProduct = {
  id: string;
  name: string;
  image_url: string | null;
  base_purchase_price: number;
  base_selling_price: number;
  tracking_type: string;
  total_quantity: number;
  brand_name: string | null;
  category_name: string | null;
  created_at: string;
};

export type SubscriptionNotice = {
  tone: "info" | "warning" | "danger" | "success";
  title: string;
  message: string;
  href?: string;
  actionLabel?: string;
};

type VariantQuantityRow = {
  quantity: number | null;
};

type RecentProductRow = {
  id: string;
  name: string;
  image_url: string | null;
  base_purchase_price: number;
  base_selling_price: number;
  tracking_type: string;
  created_at: string;
  product_variants?: VariantQuantityRow[] | null;
  brands?: { name?: string | null } | { name?: string | null }[] | null;
  categories?: { name?: string | null } | { name?: string | null }[] | null;
};

type LowStockProductRow = {
  id: string;
  low_stock_threshold: number | null;
  product_variants?: VariantQuantityRow[] | null;
};

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - Date.now()) / (24 * 60 * 60 * 1000));
}

function buildSubscriptionNotice(input: {
  entitlement: Awaited<ReturnType<typeof getWorkspaceData>>["shopEntitlement"];
  subscription: {
    status: string;
    next_payment_at: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    last_payment_status: string | null;
  } | null;
  shopSlug: string | null | undefined;
}): SubscriptionNotice | null {
  const href = input.shopSlug ? `/${input.shopSlug}/subscription` : "/subscription";
  const ent = input.entitlement;
  const sub = input.subscription;

  if (sub?.status === "past_due" || sub?.last_payment_status === "FAILED") {
    const graceRemaining = daysUntil(ent?.grace_ends_at);
    return {
      tone: "danger",
      title: "Payment needs attention",
      message:
        graceRemaining !== null && graceRemaining >= 0
          ? `The latest payment failed. Access remains for ${graceRemaining} day${graceRemaining === 1 ? "" : "s"} while you fix payment.`
          : "The latest subscription payment failed. Renew or update payment details to avoid losing access.",
      href,
      actionLabel: "Manage subscription",
    };
  }

  if (ent?.billing_status === "locked") {
    return {
      tone: "danger",
      title: "Subscription locked",
      message: "This shop is locked because the subscription is inactive or expired.",
      href,
      actionLabel: "Restore access",
    };
  }

  if (sub?.cancel_at_period_end) {
    const remaining = daysUntil(sub.current_period_end);
    return {
      tone: "warning",
      title: "Renewal cancelled",
      message:
        remaining !== null && remaining >= 0
          ? `Access remains for ${remaining} more day${remaining === 1 ? "" : "s"}.`
          : "Access remains until the current paid period ends.",
      href,
      actionLabel: "Manage subscription",
    };
  }

  if (ent?.billing_status === "trialing") {
    const remaining = daysUntil(ent.trial_ends_at);
    if (remaining !== null && remaining <= 7) {
      return {
        tone: remaining <= 2 ? "danger" : "warning",
        title: "Trial ending soon",
        message:
          remaining >= 0
            ? `Your trial ends in ${remaining} day${remaining === 1 ? "" : "s"}. Choose a paid plan to keep access.`
            : "Your trial has ended. Choose a paid plan to restore access.",
        href,
        actionLabel: "Choose plan",
      };
    }
  }

  if (ent?.billing_status === "active") {
    const nextPaymentDays = daysUntil(sub?.next_payment_at ?? ent.subscription_valid_until);
    if (nextPaymentDays !== null && nextPaymentDays >= 0 && nextPaymentDays <= 7) {
      return {
        tone: "info",
        title: "Subscription renewal soon",
        message: `Next payment is due in ${nextPaymentDays} day${nextPaymentDays === 1 ? "" : "s"}.`,
        href,
        actionLabel: "View subscription",
      };
    }
  }

  return null;
}

export async function loadDashboardData() {
  const workspace = await getWorkspaceData();
  const inventory = await loadInventoryData(workspace);
  const supabase = await createSupabaseServerClient();

  const stats: DashboardStats = {
    totalRevenue: 0,
    todayRevenue: 0,
    monthRevenue: 0,
    totalInvoices: 0,
    todayInvoices: 0,
    totalProducts: 0,
    inStockItems: 0,
    lowStockProducts: 0,
    totalCustomers: 0,
  };

  let recentInvoices: RecentInvoice[] = [];
  let recentProducts: RecentProduct[] = [];
  let subscriptionNotice: SubscriptionNotice | null = null;
  let planEntitlements: Record<string, boolean> | null = null;

  if (workspace.shopEntitlement?.plan_id) {
    const { data: plan } = await supabase
      .from("saas_plans")
      .select("entitlements")
      .eq("id", workspace.shopEntitlement.plan_id)
      .maybeSingle<{ entitlements: Record<string, boolean> | null }>();
    planEntitlements = plan?.entitlements ?? null;
  }

  if (!workspace.shop) {
    return {
      ...workspace,
      stats,
      recentInvoices,
      recentProducts,
      products: inventory.products,
      categories: inventory.categories,
      brands: inventory.brands,
      subscriptionNotice,
      planEntitlements,
    };
  }

  const shopId = workspace.shop.id;
  const { data: subscription } = await supabase
    .from("shop_subscriptions")
    .select("status, next_payment_at, current_period_end, cancel_at_period_end, last_payment_status")
    .eq("shop_id", shopId)
    .maybeSingle<{
      status: string;
      next_payment_at: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      last_payment_status: string | null;
    }>();

  subscriptionNotice = buildSubscriptionNotice({
    entitlement: workspace.shopEntitlement,
    subscription: subscription ?? null,
    shopSlug: workspace.shop.slug,
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Fetch all invoices for stats
  const { data: allInvoices } = await supabase
    .from("invoices")
    .select("id, grand_total, invoice_date")
    .eq("shop_id", shopId);

  if (allInvoices) {
    stats.totalInvoices = allInvoices.length;
    stats.totalRevenue = allInvoices.reduce((s, i) => s + Number(i.grand_total || 0), 0);
    stats.todayRevenue = allInvoices
      .filter((i) => i.invoice_date >= todayStart)
      .reduce((s, i) => s + Number(i.grand_total || 0), 0);
    stats.todayInvoices = allInvoices.filter((i) => i.invoice_date >= todayStart).length;
    stats.monthRevenue = allInvoices
      .filter((i) => i.invoice_date >= monthStart)
      .reduce((s, i) => s + Number(i.grand_total || 0), 0);
  }

  stats.totalProducts = inventory.products.length;

  // Total in-stock items (quantity-based stock + serialized IN_STOCK items)
  stats.inStockItems = (inventory.products ?? []).reduce(
    (sum: number, p: any) => sum + (p.total_quantity || 0),
    0
  );

  // Customers count
  const { count: customerCount } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId);
  stats.totalCustomers = customerCount ?? 0;

  // Low stock products
  const { data: lowStockData } = await supabase
    .from("products")
    .select("id, low_stock_threshold, product_variants(quantity)")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .eq("tracking_type", "QUANTITY_BASED");

  if (lowStockData) {
    stats.lowStockProducts = (lowStockData as LowStockProductRow[]).filter((p) => {
      const totalQty = (p.product_variants ?? []).reduce((sum, variant) => sum + (variant.quantity ?? 0), 0);
      return totalQty <= (p.low_stock_threshold ?? 0);
    }).length;
  }

  // Recent invoices (last 5) with items for card display
  const { data: recent } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, invoice_date, customer_name, customer_mobile, billing_address, customer_gst_number,
      subtotal, tax_total, discount_total, grand_total, payment_method, payment_details, payment_status, notes,
      shop_name_snapshot, shop_address_snapshot, shop_phone_snapshot, shop_gst_snapshot, invoice_footer_snapshot, invoice_pdf_url, customer_signature_url,
      invoice_items (
        id, product_id, variant_id, inventory_item_id, product_name_snapshot, brand_name_snapshot, category_name_snapshot,
        variant_name_snapshot, identifier_snapshot, quantity, unit_price, tax_rate, discount_amount, line_total
      )
    `)
    .eq("shop_id", shopId)
    .order("invoice_date", { ascending: false })
    .limit(5);

  if (recent) {
    recentInvoices = recent.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      customer_name: inv.customer_name,
      customer_mobile: inv.customer_mobile,
      billing_address: inv.billing_address,
      customer_gst_number: inv.customer_gst_number,
      subtotal: Number(inv.subtotal ?? 0),
      tax_total: Number(inv.tax_total ?? 0),
      discount_total: Number(inv.discount_total ?? 0),
      grand_total: Number(inv.grand_total),
      payment_method: inv.payment_method,
      payment_details: inv.payment_details as RecentInvoice["payment_details"],
      payment_status: inv.payment_status,
      notes: inv.notes,
      shop_name_snapshot: inv.shop_name_snapshot,
      shop_address_snapshot: inv.shop_address_snapshot,
      shop_phone_snapshot: inv.shop_phone_snapshot,
      shop_gst_snapshot: inv.shop_gst_snapshot,
      invoice_footer_snapshot: inv.invoice_footer_snapshot,
      customer_signature_url: inv.customer_signature_url,
      send_ready_pdf_url: inv.invoice_pdf_url,
      invoice_items: inv.invoice_items as RecentInvoice["invoice_items"],
    }));
  }

  // Recent products (last 5 added)
  const { data: recentProds } = await supabase
    .from("products")
    .select("id, name, image_url, base_purchase_price, base_selling_price, tracking_type, created_at, brands(name), categories(name), product_variants(quantity)")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (recentProds) {
    recentProducts = (recentProds as RecentProductRow[]).map((p) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url,
      base_purchase_price: Number(p.base_purchase_price),
      base_selling_price: Number(p.base_selling_price),
      tracking_type: p.tracking_type,
      total_quantity: (p.product_variants ?? []).reduce((sum, variant) => sum + (variant.quantity ?? 0), 0),
      brand_name: (Array.isArray(p.brands) ? p.brands[0] : p.brands)?.name ?? null,
      category_name: (Array.isArray(p.categories) ? p.categories[0] : p.categories)?.name ?? null,
      created_at: p.created_at,
    }));
  }

  return {
    ...workspace,
    stats,
    recentInvoices,
    recentProducts,
    products: inventory.products,
    categories: inventory.categories,
    brands: inventory.brands,
    subscriptionNotice,
    planEntitlements,
  };
}
