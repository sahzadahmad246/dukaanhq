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

export async function loadBillingData() {
  const workspace = await getWorkspaceData();
  const inventory = await loadInventoryData();
  const supabase = await createSupabaseServerClient();

  let invoices: BillingInvoiceSummary[] = [];

  if (workspace.shop) {
    const { data } = await supabase
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
      .eq("shop_id", workspace.shop.id)
      .order("invoice_date", { ascending: false })
      .limit(20);

    invoices = data ?? [];
  }

  return {
    ...workspace,
    products: inventory.products,
    invoices,
  };
}
