import DashboardPage from "@/app/dashboard/page";

export default async function ShopDashboardPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;

  return <DashboardPage searchParams={Promise.resolve({ shop: shopSlug })} />;
}
