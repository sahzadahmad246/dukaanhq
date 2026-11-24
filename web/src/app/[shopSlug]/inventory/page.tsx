import InventoryPage from "@/app/inventory/page";

export default async function ShopInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { shopSlug } = await params;
  const query = await searchParams;

  return <InventoryPage searchParams={Promise.resolve({ shop: shopSlug, filter: query.filter })} />;
}
