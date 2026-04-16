import Link from "next/link";

import { HomePrimaryCta } from "@/app/_components/home-primary-cta";
import { MarketingHeader } from "@/app/_components/marketing-header";
import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    user,
    profile,
    isOwner,
    isSuperAdmin,
    hasWorkspaceAccess,
    hasCompletedOnboarding,
    canUseShopProduct,
  } = await getUserAppState(supabase);

  const displayName = profile?.full_name ?? user?.user_metadata.full_name ?? user?.email ?? "there";
  const userEmail = profile?.email ?? user?.email ?? "";
  const initials = getInitials(displayName || "DukaanHQ");
  const primaryHref = user
    ? hasWorkspaceAccess && hasCompletedOnboarding
      ? canUseShopProduct
        ? "/dashboard"
        : "/subscribe"
      : isOwner
        ? "/onboarding"
        : isSuperAdmin
          ? "/admin/saas"
          : "/"
    : "/auth/login";
  const primaryLabel = user
    ? hasWorkspaceAccess && hasCompletedOnboarding
      ? canUseShopProduct
        ? "Open Dashboard"
        : "Subscribe to continue"
      : isOwner
        ? "Set Up Your Shop"
        : isSuperAdmin
          ? "SaaS admin"
          : "Open Home"
    : "Get Started Free";
  const secondaryHref = "/auth/login";
  const secondaryLabel = "Sign In";

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-[645px] overflow-x-hidden bg-[#f7f3e8] pt-[72px] text-stone-900">
      <MarketingHeader
        containerClassName="max-w-[645px]"
        userInitials={user ? initials || "DH" : null}
        userName={user ? displayName : null}
        userEmail={user ? userEmail : null}
        userAvatarUrl={profile?.avatar_url ?? user?.user_metadata.avatar_url ?? user?.user_metadata.picture ?? null}
        actionHref="/auth/login"
        actionLabel="Sign in"
        theme="light"
      />

      <section
        className="relative overflow-hidden px-5 pb-16 pt-12"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(68,64,60,0.08) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div className="pointer-events-none absolute left-0 top-0 h-56 w-56 rounded-full bg-[#f5c542]/35 blur-[90px]" />
        <div className="pointer-events-none absolute right-[-3rem] top-24 h-56 w-56 rounded-full bg-[#93c5fd]/35 blur-[95px]" />

        <div className="relative">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#f5c542]/35 bg-[#fff4c9] px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a16207]">
              {user ? (hasWorkspaceAccess && hasCompletedOnboarding ? "Shop active" : "Account ready") : "Electronics retail OS"}
            </span>
          </div>

          <h1 className="mb-5 text-[40px] font-black leading-[1.0] tracking-[-0.04em] text-stone-950">
            The operating<br />
            system for your<br />
            <span className="text-[#a16207]">electronics shop.</span>
          </h1>

          <p className="mb-8 max-w-[360px] text-[14px] leading-[1.75] text-stone-600">
            Bill faster. Stock smarter. Sell everywhere. Built for the counter, designed for growth.
          </p>

          {user && (
            <div className="mb-8 max-w-[360px] border-l-4 border-[#f5c542] pl-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">Signed in</p>
              <p className="text-[15px] font-bold text-stone-950">{displayName}</p>
              <p className="mt-0.5 text-[13px] text-stone-600">{userEmail}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-stone-700">
                {hasWorkspaceAccess && hasCompletedOnboarding
                  ? "Your shop is live — jump back into your dashboard."
                  : isOwner
                    ? "Complete onboarding to activate your shop."
                    : "Your account is signed in, but shop access is not active yet."}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <HomePrimaryCta href={primaryHref} label={primaryLabel} />
            {!user && (
              <Link
                href={secondaryHref}
                className="flex h-12 items-center justify-center rounded-2xl border border-stone-200 bg-white text-[13px] font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950"
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-[#fffaf0]">
        <div className="grid grid-cols-3 divide-x divide-stone-200">
          {[
            { value: "3s", label: "Avg. bill time" },
            { value: "∞", label: "Stock items" },
            { value: "1", label: "OS for all" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center justify-center py-6 text-center px-2">
              <p className="text-[26px] font-black leading-none text-[#a16207]">{stat.value}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-stone-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        className="relative overflow-hidden px-5 py-12"
        style={{
          backgroundImage: "linear-gradient(rgba(120,113,108,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(120,113,108,0.08) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      >
        <div className="relative">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563eb]">Inside the product</p>
          <h2 className="mb-8 text-[26px] font-black leading-tight tracking-tight text-stone-950">
            Everything your shop runs on.
          </h2>

          <div className="flex flex-col gap-4">
            {[
              {
                tag: "Billing",
                icon: "⚡",
                title: "Bills out in seconds",
                desc: "Create invoices at the counter, save customer records, and print without friction.",
                accent: "#f5c542",
                bg: "rgba(245,197,66,0.05)",
                border: "rgba(245,197,66,0.12)",
              },
              {
                tag: "Inventory",
                icon: "📦",
                title: "One view for all stock",
                desc: "Manage mobiles, accessories, and serialized items — quantity or serial, all unified.",
                accent: "#4ade80",
                bg: "rgba(74,222,128,0.05)",
                border: "rgba(74,222,128,0.12)",
              },
              {
                tag: "Ecommerce",
                icon: "🛍️",
                title: "Your storefront, ready",
                desc: "Set up once and go online when you're ready. Built to grow with your business.",
                accent: "#60a5fa",
                bg: "rgba(96,165,250,0.05)",
                border: "rgba(96,165,250,0.12)",
              },
            ].map((f) => (
              <div
                key={f.tag}
                className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]"
                style={{ border: `1px solid ${f.border}` }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: f.bg, border: `1px solid ${f.accent}22` }}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: f.accent }}>
                      {f.tag}
                    </span>
                    <h3 className="mt-1 mb-1.5 text-[16px] font-bold leading-snug text-stone-950">{f.title}</h3>
                    <p className="text-[13px] leading-relaxed text-stone-600">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="relative overflow-hidden px-5 py-12"
        style={{
          background: "#f3efe3",
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 18px,
            rgba(120,113,108,0.06) 18px,
            rgba(120,113,108,0.06) 19px
          )`,
        }}
      >
        <div className="relative">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#a16207]">Built different</p>
          <h2 className="mb-8 text-[26px] font-black leading-tight tracking-tight text-stone-950">
            Made for how electronics shops actually work.
          </h2>

          <div className="flex flex-col gap-3">
            {[
              { num: "01", title: "Mobile-first", detail: "Designed for the phone in your pocket, not a desktop you don't have." },
              { num: "02", title: "No training needed", detail: "Counter-ready UI. Staff pick it up in minutes, not days." },
              { num: "03", title: "One subscription", detail: "Billing, inventory, and ecommerce — single flat plan, no hidden fees." },
              { num: "04", title: "India-ready", detail: "GST-compliant invoices, local print formats, and rupee billing out of the box." },
            ].map((item) => (
              <div
                key={item.num}
                className="flex items-start gap-4 rounded-2xl border border-stone-200 bg-white/85 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
              >
                <span className="mt-0.5 w-6 shrink-0 text-[11px] font-black text-[#2563eb]/40">{item.num}</span>
                <div>
                  <p className="mb-1 text-[15px] font-bold text-stone-950">{item.title}</p>
                  <p className="text-[13px] leading-relaxed text-stone-600">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-5 my-10 overflow-hidden rounded-3xl bg-[#fff4c9] p-7">
        <div
          className="absolute inset-0 opacity-[0.08] rounded-3xl"
          style={{
            backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[#080e1a]/45">Ready to start?</p>
          <h2 className="mb-2 text-[24px] font-black leading-[1.1] tracking-tight text-[#080e1a]">
            Your shop deserves a real OS.
          </h2>
          <p className="mb-7 text-[13px] leading-relaxed text-[#080e1a]/55">
            Join electronics shop owners running their entire business from one clean dashboard.
          </p>
          <HomePrimaryCta href={primaryHref} label={primaryLabel} />
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-[#fffdf7] px-5 pb-8 pt-10">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5c542] text-[#080e1a] text-[10px] font-black">
            DH
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight text-stone-950">DukaanHQ</p>
            <p className="text-[11px] text-stone-400">Electronics retail OS</p>
          </div>
        </div>

        <p className="mb-8 max-w-[320px] text-[13px] leading-relaxed text-stone-600">
          The operating system for electronics shop owners who want to bill faster, manage stock, and grow online.
        </p>

        <div className="mb-8 grid grid-cols-2 gap-x-8 gap-y-6">
          {[
            { label: "Product", links: ["Billing", "Inventory", "Ecommerce"] },
            { label: "Company", links: ["About", "Blog", "Contact"] },
          ].map((col) => (
            <div key={col.label}>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">{col.label}</p>
              <div className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <a key={link} href="#" className="text-[13px] text-stone-600 transition-colors hover:text-stone-950">
                    {link}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-stone-200 pt-5">
          <p className="text-[11px] text-stone-400">© 2025 DukaanHQ</p>
          <div className="flex items-center gap-4">
            {["Privacy", "Terms"].map((t) => (
              <a key={t} href="#" className="text-[11px] text-stone-400 transition-colors hover:text-stone-700">
                {t}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
