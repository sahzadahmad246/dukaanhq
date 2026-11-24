import StaffPage from "@/app/staff/page";

export default async function ShopStaffPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;

  return <StaffPage searchParams={Promise.resolve({ shop: shopSlug })} />;
}
