import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { loadInventoryData } from "@/app/inventory/load-inventory-data";
import { EMPTY_INVOICE_HISTORY, readInvoiceHistoryPage, type InvoiceHistoryPage } from "@/lib/billing/invoice-history";

export type BillingInvoiceSummary = {
  id: string;
  is_second_hand?: boolean;
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
    loan_tenure_months?: number | null;
    down_payment?: number | null;
    monthly_emi_amount?: number | null;
    first_emi_date?: string | null;
    emi_day_of_month?: number | null;
  } | null;
  customer_signature_url?: string | null;
  send_ready_pdf_url?: string | null;
  payment_status: string;
  notes?: string | null;
  shop_name_snapshot: string;
  shop_address_snapshot?: string | null;
  shop_phone_snapshot?: string | null;
  shop_gst_snapshot?: string | null;
  invoice_footer_snapshot?: string | null;
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

export async function loadBillingData(searchParams?: { q?: string; period?: string }, isSecondHand = false) {
  const workspace = await getWorkspaceData(isSecondHand ? { requireOwner: true } : undefined);
  const inventoryPromise = loadInventoryData(workspace, isSecondHand);
  const supabase = await createSupabaseServerClient();

  let invoiceHistory: InvoiceHistoryPage = EMPTY_INVOICE_HISTORY;
  let planEntitlements: Record<string, boolean> | null = null;

  const planPromise = workspace.shopEntitlement?.plan_id
    ? supabase.from("saas_plans").select("entitlements")
        .eq("id", workspace.shopEntitlement.plan_id)
        .maybeSingle<{ entitlements: Record<string, boolean> | null }>().then((result) => result)
    : Promise.resolve({ data: null });

  if (workspace.shop) {
    const period = searchParams?.period;
    invoiceHistory = await readInvoiceHistoryPage(supabase, {
      shopId: workspace.shop.id,
      isSecondHand,
      search: (searchParams?.q ?? "").trim().slice(0, 200),
      period: period === "today" || period === "week" || period === "month" ? period : "all",
      cursor: null,
    });
  }

  const [inventory, { data: plan }] = await Promise.all([inventoryPromise, planPromise]);
  planEntitlements = plan?.entitlements ?? null;

  return {
    ...workspace,
    products: inventory.products,
    categories: inventory.categories,
    brands: inventory.brands,
    invoices: invoiceHistory.invoices,
    invoiceHistory,
    planEntitlements,
  };
}
