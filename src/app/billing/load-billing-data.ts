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
  } | null;
  payment_status: string;
  notes?: string | null;
  shop_name_snapshot: string;
  shop_address_snapshot?: string | null;
  shop_phone_snapshot?: string | null;
  shop_gst_snapshot?: string | null;
  invoice_footer_snapshot?: string | null;
  invoice_items?: Array<{
    id: string;
    product_name_snapshot: string;
    brand_name_snapshot?: string | null;
    category_name_snapshot?: string | null;
    variant_name_snapshot?: string | null;
    identifier_snapshot?: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

export async function loadBillingData(searchParams?: { q?: string; period?: string }) {
  const workspace = await getWorkspaceData();
  const inventory = await loadInventoryData();
  const supabase = await createSupabaseServerClient();

  let invoices: BillingInvoiceSummary[] = [];

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
        payment_status,
        notes,
        shop_name_snapshot,
        shop_address_snapshot,
        shop_phone_snapshot,
        shop_gst_snapshot,
        invoice_footer_snapshot,
        invoice_items (
          id,
          product_name_snapshot,
          brand_name_snapshot,
          category_name_snapshot,
          variant_name_snapshot,
          identifier_snapshot,
          quantity,
          unit_price,
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
    invoices = data ?? [];
  }

  return {
    ...workspace,
    products: inventory.products,
    invoices,
  };
}
