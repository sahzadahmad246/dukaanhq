import BillingPage from "@/app/billing/page";

export default async function ShopBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams: Promise<{ q?: string; period?: string }>;
}) {
  const { shopSlug } = await params;
  const query = await searchParams;

  return <BillingPage searchParams={Promise.resolve({ ...query, shop: shopSlug })} />;
}
