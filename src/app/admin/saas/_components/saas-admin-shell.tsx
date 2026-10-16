"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Building2, CreditCard, Home, LayoutDashboard, LifeBuoy, Menu, Settings, ShieldCheck, Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaasAdminToastListener } from "./saas-admin-toast-listener";
import { SaasAdminDrawer } from "./saas-admin-drawer";

type HeaderConfig = { title?: string; backHref?: string; rightContent?: React.ReactNode };
const HeaderContext = createContext<{ setConfig: (config: HeaderConfig) => void }>({ setConfig: () => {} });
export function SaasAdminHeader({ title, backHref, rightContent }: HeaderConfig) {
  const { setConfig } = useContext(HeaderContext);
  useEffect(() => { setConfig({ title, backHref, rightContent }); return () => setConfig({}); }, [title, backHref, rightContent, setConfig]);
  return null;
}
const navItems = [
  { href: "/admin/saas", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/saas/shops", label: "Shops", icon: Building2 },
  { href: "/admin/saas/plans", label: "Plans", icon: Tags },
  { href: "/admin/saas/subscriptions", label: "Billing", icon: CreditCard },
  { href: "/admin/saas/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/saas/support", label: "Operations", icon: LifeBuoy },
  { href: "/admin/saas/settings", label: "Settings", icon: Settings },
];
const mobileItems = [navItems[0], navItems[1], navItems[3]];
function isActive(pathname: string, href: string, exact?: boolean) { return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }

export function SaasAdminShell({ children, userName, userEmail, userRole, userAvatarUrl }: { children: React.ReactNode; userName: string; userEmail: string; userRole: string; userAvatarUrl: string | null }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [header, setHeader] = useState<HeaderConfig>({});
  const activePage = navItems.find(item => isActive(pathname, item.href, item.exact));
  return <HeaderContext.Provider value={{ setConfig: setHeader }}>
    <div className="min-h-screen bg-[#f3f6f5] text-stone-950 lg:bg-[#f6f7f9]">
      <SaasAdminToastListener />
      <SaasAdminDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} userName={userName} userEmail={userEmail} userRole={userRole} userAvatarUrl={userAvatarUrl} />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-stone-200 bg-white lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-stone-200 px-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-stone-950 text-white"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-base font-bold">DukaanHQ Admin</p><p className="mt-0.5 text-xs text-stone-500">SaaS control center</p></div></div>
        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Admin pages">{navItems.map(item => <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href, item.exact) ? "page" : undefined} className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition", isActive(pathname, item.href, item.exact) ? "bg-stone-950 text-white" : "text-stone-700 hover:bg-stone-100")}><item.icon className="h-4 w-4" />{item.label}</Link>)}</nav>
        <div className="border-t border-stone-200 p-3"><button type="button" onClick={() => setDrawerOpen(true)} className="mb-2 flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-stone-50" aria-label="Open admin account menu"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold">{userName.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{userName}</span><span className="mt-1 block truncate text-[11px] text-stone-400">{userEmail}</span></span></button><Link href="/" className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-stone-700 hover:bg-stone-50"><Home className="h-4 w-4" />App home</Link></div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-[#dfe8e3] bg-[#f3f6f5]/95 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3">
            {header.backHref ? <Link aria-label="Go back" href={header.backHref} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm"><ArrowLeft className="h-4 w-4" /></Link> : <Link href="/admin/saas" aria-label="Admin overview" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#183f35] text-[#c7eebd] shadow-sm"><ShieldCheck className="h-5 w-5" strokeWidth={1.6} /></Link>}
            <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#789184]">DukaanHQ · Admin</p><p className="mt-0.5 truncate text-base font-semibold tracking-tight text-[#183f35]">{header.title || activePage?.label || "Control center"}</p></div>
            {header.rightContent ?? <button type="button" aria-label="Open admin account menu" onClick={() => setDrawerOpen(true)} className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-[#e2ebe5] text-sm font-semibold text-[#234b3f] shadow-sm">{userAvatarUrl ? <Image src={userAvatarUrl} alt="" fill sizes="44px" className="object-cover" /> : userName.slice(0, 1).toUpperCase()}</button>}
          </div>
        </header>
        {header.title && header.backHref ? <div className="hidden items-center gap-3 border-b border-stone-200 bg-white px-6 py-3 lg:flex"><Link href={header.backHref} aria-label="Go back" className="flex h-10 w-10 items-center justify-center"><ArrowLeft className="h-5 w-5" /></Link><p className="min-w-0 flex-1 truncate text-sm font-medium">{header.title}</p>{header.rightContent}</div> : null}
        <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-5 pb-32 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">{children}</main>
      </div>
      <nav aria-label="Quick admin navigation" className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 rounded-[1.6rem] border border-white/90 bg-white/95 p-1.5 shadow-[0_8px_40px_rgba(21,57,43,0.16)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-4 gap-1">{mobileItems.map(item => {
          const active = isActive(pathname, item.href, item.exact);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-[58px] flex-col items-center justify-center gap-1.5 rounded-[1.15rem] text-[10px] font-semibold transition ${active ? "bg-[#183f35] text-[#d4f5c8]" : "text-[#88978e] hover:bg-[#edf3ef]"}`}><item.icon className="h-[19px] w-[19px]" strokeWidth={1.7} />{item.label}</Link>;
        })}<button type="button" onClick={() => setDrawerOpen(true)} className="flex min-h-[58px] flex-col items-center justify-center gap-1.5 rounded-[1.15rem] text-[10px] font-semibold text-[#88978e] hover:bg-[#edf3ef]" aria-label="Open all admin pages"><Menu className="h-[19px] w-[19px]" strokeWidth={1.7} />More</button></div>
      </nav>
    </div>
  </HeaderContext.Provider>;
}
