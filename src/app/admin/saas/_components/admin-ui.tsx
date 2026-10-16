import Link from "next/link";
import { ArrowLeft, ArrowRight, Inbox, Building2, Package, ReceiptText, Users, CircleDollarSign, CreditCard } from "lucide-react";
import type { ReactNode } from "react";

export const adminInput = "min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-100";
export const adminButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed";
export const adminSecondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50";
export function AdminHeading({ eyebrow = "Platform management", title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{eyebrow}</p><h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">{description}</p></div>{children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}</div>;
}
export function StatusBadge({ value }: { value?: string | null }) {
  const status = value?.toLowerCase() ?? "unknown";
  const color = ["active", "paid", "processed", "completed", "accepted", "success", "approved"].includes(status) ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70" : ["trialing", "pending", "received", "partial", "payment_pending", "selected", "cancel_at_period_end"].includes(status) ? "bg-amber-50 text-amber-800 ring-amber-200/70" : ["locked", "suspended", "failed", "error", "past_due", "unpaid", "expired", "pricing_mismatch"].includes(status) ? "bg-rose-50 text-rose-700 ring-rose-200/70" : "bg-stone-100 text-stone-600 ring-stone-200";
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ring-1 ring-inset ${color}`}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />{status.replaceAll("_", " ")}</span>;
}
export function MetricCards({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  const icons = [Building2, Package, ReceiptText, Users];
  const tones = ["bg-[#e4efe4] text-[#497648]", "bg-[#e7ebf7] text-[#6677a6]", "bg-[#fcf0d9] text-[#a4823d]", "bg-[#f1e8f0] text-[#9b7391]"];
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{items.map((item, index) => {
    const Icon = /sales|amount|value|average/i.test(item.label) ? CircleDollarSign : /payment|subscription/i.test(item.label) ? CreditCard : icons[index % icons.length];
    return <div key={item.label} className="relative min-w-0 overflow-hidden rounded-[1.35rem] border border-white bg-white p-4 shadow-[0_3px_16px_rgba(33,62,44,0.035)] lg:rounded-2xl lg:border-stone-200/80 lg:p-5 lg:shadow-none"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl lg:hidden ${tones[index % tones.length]}`}><Icon className="h-[17px] w-[17px]" strokeWidth={1.6} /></div><p className="text-[11px] font-medium text-[#85928a] lg:text-xs lg:text-stone-500">{item.label}</p><p className="mt-1.5 break-words text-[1.65rem] font-semibold tracking-tight tabular-nums text-[#203e31] lg:mt-3 lg:text-3xl lg:text-stone-950">{item.value}</p>{item.hint ? <p className="mt-2 text-[10px] leading-relaxed text-[#a1aca5] lg:text-[11px] lg:text-stone-400">{item.hint}</p> : null}</div>;
  })}</div>;
}
export function AdminPanel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-[1.4rem] border border-[#e2eae4] bg-white lg:rounded-2xl lg:border-stone-200/80"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-4 sm:px-5"><div><h2 className="text-sm font-semibold text-stone-900">{title}</h2>{description ? <p className="mt-1 text-xs leading-relaxed text-stone-500">{description}</p> : null}</div>{action}</div>{children}</section>;
}
export function EmptyState({ title = "Nothing here yet", description = "Records will appear here when available." }: { title?: string; description?: string }) {
  return <div className="flex flex-col items-center px-5 py-12 text-center"><Inbox className="mb-3 h-7 w-7 text-stone-300" /><p className="text-sm font-medium text-stone-700">{title}</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-stone-500">{description}</p></div>;
}
export function AdminTable({ headers, rows, empty }: { headers: string[]; rows: { id: string; cells: ReactNode[] }[]; empty?: string }) {
  if (!rows.length) return <EmptyState title={empty ?? "No records found"} />;
  const Icon = /shop/i.test(headers[0]) ? Building2 : /invoice/i.test(headers[0]) ? ReceiptText : /member|customer/i.test(headers[0]) ? Users : CreditCard;
  return <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-stone-50/80"><tr>{headers.map(h => <th key={h} className="whitespace-nowrap px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-stone-400">{h}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{rows.map(row => <tr key={row.id} className="hover:bg-stone-50/70">{row.cells.map((cell, index) => <td key={index} className="max-w-xs break-words px-5 py-4 align-top text-stone-600">{cell}</td>)}</tr>)}</tbody></table></div>
    <div className="space-y-3 bg-[#f3f6f5] p-3 md:hidden">{rows.map(row => <div key={row.id} className="overflow-hidden rounded-[1.15rem] border border-[#e2eae4] bg-white shadow-[0_2px_8px_rgba(33,62,44,0.025)]"><div className="flex items-start gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] bg-[#edf4ec] text-[#5d7f60]"><Icon className="h-[18px] w-[18px]" strokeWidth={1.6} /></span><div className="min-w-0 flex-1 break-words text-sm text-[#2f493b]">{row.cells[0]}</div></div><div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[#f0f3ef] px-4 py-3">{row.cells.slice(1).map((cell, index) => <div key={index} className={`min-w-0 break-words text-xs leading-relaxed text-[#4c6152] ${headers[index + 1] === "Manage" ? "col-span-2 border-t border-[#f0f3ef] pt-3" : ""}`}><p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#9ca99e]">{headers[index + 1]}</p>{cell}</div>)}</div></div>)}</div>
  </>;
}
export function Pagination({ page, count, size = 25, base, params = {} }: { page: number; count: number; size?: number; base: string; params?: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(count / size));
  const href = (next: number) => { const query = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value) query.set(key, value); }); query.set("page", String(next)); return `${base}?${query}`; };
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-4 py-3 text-xs text-stone-500"><span>{count.toLocaleString("en-IN")} records · Page {page} of {pages}</span><div className="flex gap-2">{page > 1 ? <Link aria-label="Previous page" href={href(page - 1)} className={adminSecondary}><ArrowLeft className="h-4 w-4" /></Link> : null}{page < pages ? <Link aria-label="Next page" href={href(page + 1)} className={adminSecondary}><ArrowRight className="h-4 w-4" /></Link> : null}</div></div>;
}
export function PeriodPicker({ days, base, params = {} }: { days: number; base: string; params?: Record<string, string> }) {
  return <div className="inline-flex rounded-xl border border-stone-200 bg-white p-1">{[7, 30, 90].map(value => <Link key={value} href={`${base}?${new URLSearchParams({ ...params, days: String(value) })}`} aria-current={value === days ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs font-medium ${value === days ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-50"}`}>{value} days</Link>)}</div>;
}
