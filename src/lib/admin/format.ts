export const adminMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(value ?? 0));
export const adminNumber = (value: number | null | undefined) => new Intl.NumberFormat("en-IN").format(value ?? 0);
export function adminDate(value: string | null | undefined, withTime = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(new Date(value));
}
export function pageNumber(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100000) : 1;
}
export function reportDays(value?: string) { return value === "7" ? 7 : value === "90" ? 90 : 30; }
export function reportStart(days: number, now = new Date()) {
  // Calendar days in India, including today.
  const indiaDate = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  return new Date(new Date(`${indiaDate}T00:00:00+05:30`).getTime() - (days - 1) * 86400000).toISOString();
}
export function searchText(value?: string) {
  return (value ?? "").trim().replace(/[,%()"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
export function accessEnd(row: { billing_status: string; trial_ends_at?: string | null; subscription_valid_until?: string | null; access_expires_at?: string | null }) {
  return row.billing_status === "trialing" ? row.trial_ends_at : row.subscription_valid_until ?? row.access_expires_at;
}
