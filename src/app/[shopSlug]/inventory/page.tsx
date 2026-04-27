import InventoryPage from "@/app/inventory/page";

export default async function ShopInventoryPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;

  return <InventoryPage searchParams={Promise.resolve({ shop: shopSlug })} />;
}
