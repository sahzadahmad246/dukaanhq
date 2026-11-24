import SettingsPage from "@/app/settings/page";

export default async function ShopSettingsPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;

  return <SettingsPage searchParams={Promise.resolve({ shop: shopSlug })} />;
}
