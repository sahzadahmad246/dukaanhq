import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceData } from "@/lib/workspace/get-workspace-data";
import { loadInventoryData } from "@/app/inventory/load-inventory-data";

export type BillingInvoiceSummary = {
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

export async function loadBillingData(searchParams?: { q?: string; period?: string }) {
  const workspace = await getWorkspaceData();
  const inventoryPromise = loadInventoryData(workspace);
  const supabase = await createSupabaseServerClient();

  let invoices: BillingInvoiceSummary[] = [];
  let planEntitlements: Record<string, boolean> | null = null;

  const planPromise = workspace.shopEntitlement?.plan_id
    ? supabase.from("saas_plans").select("entitlements")
        .eq("id", workspace.shopEntitlement.plan_id)
        .maybeSingle<{ entitlements: Record<string, boolean> | null }>().then((result) => result)
    : Promise.resolve({ data: null });

  if (workspace.shop) {
    let query = supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        invoice_date,
        customer_name,
        customer_mobile,
        billing_address,
        customer_gst_number,
        subtotal,
        tax_total,
        discount_total,
        grand_total,
        payment_method,
        payment_details,
        customer_signature_url,
        invoice_pdf_url,
        payment_status,
        notes,
        shop_name_snapshot,
        shop_address_snapshot,
        shop_phone_snapshot,
        shop_gst_snapshot,
        invoice_footer_snapshot,
        invoice_items (
          id,
          product_id,
          variant_id,
          inventory_item_id,
          product_name_snapshot,
          brand_name_snapshot,
          category_name_snapshot,
          variant_name_snapshot,
          identifier_snapshot,
          quantity,
          unit_price,
          tax_rate,
          discount_amount,
          line_total
        )
      `)
      .eq("shop_id", workspace.shop.id);

    if (searchParams?.q) {
      query = query.or(`invoice_number.ilike.%${searchParams.q}%,customer_name.ilike.%${searchParams.q}%,customer_mobile.ilike.%${searchParams.q}%`);
    }

    if (searchParams?.period) {
      const now = new Date();
      let startDate: Date | null = null;
      
      switch (searchParams.period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          const day = now.getDay() || 7; 
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
      
      if (startDate) {
        query = query.gte("invoice_date", startDate.toISOString());
      }
    }

    query = query.order("invoice_date", { ascending: false }).limit(100);

    const { data } = await query;
    invoices = (data ?? []).map((invoice) => ({
      ...invoice,
      send_ready_pdf_url: invoice.invoice_pdf_url ?? null,
    }));
  }

  const [inventory, { data: plan }] = await Promise.all([inventoryPromise, planPromise]);
  planEntitlements = plan?.entitlements ?? null;

  return {
    ...workspace,
    products: inventory.products,
    categories: inventory.categories,
    brands: inventory.brands,
    invoices,
    planEntitlements,
  };
}
