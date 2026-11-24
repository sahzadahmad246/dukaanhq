import SecondHandPage from "@/app/second-hand/page";

export default async function ShopSecondHandPage({ params, searchParams }: {
  params: Promise<{ shopSlug: string }>;
  searchParams: Promise<{ tab?: string; q?: string; period?: string }>;
}) {
  const { shopSlug } = await params;
  const query = await searchParams;
  return <SecondHandPage searchParams={Promise.resolve({ ...query, shop: shopSlug })} />;
}
