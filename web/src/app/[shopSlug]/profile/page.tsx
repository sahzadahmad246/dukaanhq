import ProfilePage from "@/app/profile/page";

export default async function ShopProfilePage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;

  return <ProfilePage searchParams={Promise.resolve({ shop: shopSlug })} />;
}
