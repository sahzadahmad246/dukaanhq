"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Building2, CreditCard, Home, LayoutDashboard, LifeBuoy, LogOut, Settings, ShieldCheck, Tags, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const pages = [
  { href: "/admin/saas", label: "Overview", hint: "Platform at a glance", icon: LayoutDashboard },
  { href: "/admin/saas/shops", label: "Shops", hint: "Tenants & their data", icon: Building2 },
  { href: "/admin/saas/subscriptions", label: "Billing", hint: "Plans & renewals", icon: CreditCard },
  { href: "/admin/saas/reports", label: "Reports", hint: "Sales & exports", icon: BarChart3 },
  { href: "/admin/saas/plans", label: "Plans", hint: "Pricing & features", icon: Tags },
  { href: "/admin/saas/subscriptions/health", label: "Billing checks", hint: "Verify Dodo prices", icon: ShieldCheck },
  { href: "/admin/saas/support", label: "Operations", hint: "Payments & events", icon: LifeBuoy },
  { href: "/admin/saas/settings", label: "Settings", hint: "Platform preferences", icon: Settings },
];
export function SaasAdminDrawer({ open, onClose, userName, userEmail, userRole, userAvatarUrl }: { open: boolean; onClose: () => void; userName: string; userEmail: string; userRole: string; userAvatarUrl: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null), pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  async function logout() {
    setLoggingOut(true); setLogoutError("");
    try { const { error } = await createSupabaseBrowserClient().auth.signOut(); if (error) throw error; window.location.replace("/"); }
    catch { setLogoutError("Could not log out. Please try again."); setLoggingOut(false); }
  }
  return <dialog ref={dialog} aria-labelledby="admin-menu-title" onClose={onClose} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-[2rem] border-0 bg-[#f3f6f5] p-5 pb-[max(24px,env(safe-area-inset-bottom))] text-stone-900 shadow-2xl backdrop:bg-[#102e25]/45 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-dvh lg:max-h-none lg:w-[400px] lg:rounded-none lg:p-6">
    <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#d5e0d8] lg:hidden" />
    <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#789184]">DukaanHQ</p><h2 id="admin-menu-title" className="mt-1 text-xl font-semibold tracking-tight text-[#183f35]">Your control center</h2></div><button type="button" aria-label="Close admin menu" onClick={() => dialog.current?.close()} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-stone-500"><X className="h-5 w-5" /></button></div>
    <div className="my-5 flex items-center gap-3 rounded-2xl bg-white p-4"><span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e2ebe5] font-semibold text-[#234b3f]">{userAvatarUrl ? <Image src={userAvatarUrl} alt="" fill sizes="44px" className="object-cover" /> : userName.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{userName}<span className="ml-2 text-[10px] font-medium capitalize text-[#789184]">{userRole}</span></p><p className="mt-1 truncate text-xs text-stone-400">{userEmail}</p></div></div>
    <nav aria-label="All admin pages" className="grid grid-cols-2 gap-3">{pages.map(item => {
      const active = pathname === item.href;
      return <Link key={item.href} href={item.href} onClick={onClose} className={`rounded-2xl border p-4 transition ${active ? "border-[#183f35] bg-[#183f35] text-[#d4f5c8]" : "border-white bg-white text-[#294b3d] hover:border-[#c6d8ca]"}`}><item.icon className="h-5 w-5" strokeWidth={1.6} /><p className="mt-3 text-sm font-semibold">{item.label}</p><p className={`mt-1 text-[10px] ${active ? "text-[#aac3ad]" : "text-[#8a9a8e]"}`}>{item.hint}</p></Link>;
    })}</nav>
    <div className="mt-5 flex gap-3"><Link href="/" onClick={onClose} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-xs font-medium text-stone-600"><Home className="h-4 w-4" />App home</Link><button type="button" onClick={() => void logout()} disabled={loggingOut} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 text-xs font-medium text-rose-600 disabled:opacity-50"><LogOut className="h-4 w-4" />{loggingOut ? "Logging out…" : "Log out"}</button></div>{logoutError ? <p role="alert" className="mt-3 text-xs text-rose-600">{logoutError}</p> : null}
  </dialog>;
}
