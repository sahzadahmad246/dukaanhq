"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CreditCard,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShieldCheck,
  Tags,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SaasAdminToastListener } from "@/app/admin/saas/_components/saas-admin-toast-listener";

const navItems = [
  { href: "/admin/saas", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/admin/saas/shops", label: "Shops", icon: Building2 },
  { href: "/admin/saas/plans", label: "Plans", icon: Tags },
  { href: "/admin/saas/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/saas/reports", label: "Reports", icon: BarChart3, disabled: true },
  { href: "/admin/saas/support", label: "Support", icon: LifeBuoy, disabled: true },
  { href: "/admin/saas/settings", label: "Settings", icon: Settings, disabled: true },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SaasAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-stone-950">
      <SaasAdminToastListener />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-stone-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-stone-200 px-5">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-stone-950 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-stone-950">DukaanHQ Admin</p>
            <p className="text-xs font-medium text-stone-500">SaaS control center</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);

            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-stone-400"
                  title="Coming soon"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition",
                  active ? "bg-stone-950 text-white" : "text-stone-700 hover:bg-stone-100 hover:text-stone-950",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-stone-200 p-3">
          <Link
            href="/"
            className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 hover:text-stone-950"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            App home
          </Link>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin/saas" className="flex items-center gap-2 text-sm font-bold text-stone-950">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              SaaS admin
            </Link>
            <Link href="/" className="text-sm font-semibold text-stone-600">
              Home
            </Link>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navItems
              .filter((item) => !item.disabled)
              .map((item) => {
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold",
                      active ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-700",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
