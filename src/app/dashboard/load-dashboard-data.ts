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
  grand_total: number;
  payment_method: string;
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

export async function loadDashboardData() {
  const workspace = await getWorkspaceData();
  const inventory = await loadInventoryData();
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

  if (!workspace.shop) {
    return { ...workspace, stats, recentInvoices, recentProducts, products: inventory.products, categories: inventory.categories, brands: inventory.brands };
  }

  const shopId = workspace.shop.id;
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

  // In-stock serialized items
  const { count: inStockCount } = await supabase
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("status", "IN_STOCK");
  stats.inStockItems = inStockCount ?? 0;

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
    stats.lowStockProducts = lowStockData.filter((p) => {
      const totalQty = (p.product_variants as any[])?.reduce(
        (s: number, v: any) => s + (v.quantity ?? 0),
        0
      ) ?? 0;
      return totalQty <= (p.low_stock_threshold ?? 0);
    }).length;
  }

  // Recent invoices (last 5) with items for card display
  const { data: recent } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, invoice_date, customer_name, customer_mobile, grand_total, payment_method,
      invoice_items (
        id, product_name_snapshot, brand_name_snapshot, category_name_snapshot,
        variant_name_snapshot, identifier_snapshot, quantity, unit_price, line_total
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
      grand_total: Number(inv.grand_total),
      payment_method: inv.payment_method,
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
    recentProducts = recentProds.map((p) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url,
      base_purchase_price: Number(p.base_purchase_price),
      base_selling_price: Number(p.base_selling_price),
      tracking_type: p.tracking_type,
      total_quantity: (p.product_variants as any[])?.reduce((s: number, v: any) => s + (v.quantity ?? 0), 0) ?? 0,
      brand_name: (p.brands as any)?.name ?? null,
      category_name: (p.categories as any)?.name ?? null,
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
  };
}
