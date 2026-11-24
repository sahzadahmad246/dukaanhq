import SubscriptionManagePage from "@/app/subscription/page";

export default async function ShopSubscriptionPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;

  return <SubscriptionManagePage searchParams={Promise.resolve({ shop: shopSlug })} />;
}
