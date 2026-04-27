export type ShopAppRoute =
  | "dashboard"
  | "billing"
  | "inventory"
  | "staff"
  | "profile"
  | "settings"
  | "subscribe"
  | "subscription";

export function buildShopRoute(shopSlug: string, route?: ShopAppRoute) {
  const base = `/${shopSlug}`;
  return route ? `${base}/${route}` : base;
}
