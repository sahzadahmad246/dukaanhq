import SubscribePage from "@/app/subscribe/page";

export default async function ShopSubscribePage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;

  return <SubscribePage searchParams={Promise.resolve({ shop: shopSlug })} />;
}
