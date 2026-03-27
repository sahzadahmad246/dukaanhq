import Link from "next/link";
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
  const { user, profile, isOwner, hasCompletedOnboarding } = await getUserAppState(supabase);

  const displayName = profile?.full_name ?? user?.user_metadata.full_name ?? user?.email ?? "there";
  const userEmail = profile?.email ?? user?.email ?? "";
  const initials = getInitials(displayName || "DukaanHQ");
  const primaryHref = user
    ? isOwner && hasCompletedOnboarding ? "/dashboard" : "/onboarding"
    : "/auth/login";
  const primaryLabel = user
    ? isOwner && hasCompletedOnboarding ? "Open Dashboard" : "Set Up Your Shop"
    : "Get Started Free";
  const secondaryHref = "/auth/login";
  const secondaryLabel = "Sign In";

  return (
    <main className="relative min-h-screen w-full max-w-[645px] mx-auto overflow-x-hidden bg-[#080e1a] pt-[72px] text-white">

      {/* ── STICKY HEADER ── */}
      <div className="fixed inset-x-0 top-0 z-50">
        <header className="mx-auto flex w-full max-w-[645px] items-center justify-between border-b border-white/[0.06] bg-[#080e1a]/92 px-5 py-3.5 shadow-[0_12px_30px_rgba(3,7,18,0.35)] backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5c542] text-[#080e1a] text-[10px] font-black tracking-tight">
              DH
            </div>
            <span className="text-[14px] font-bold tracking-tight text-white">DukaanHQ</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a2540] border border-white/10 text-xs font-bold text-white">
                {initials || "DH"}
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="flex h-9 items-center justify-center rounded-full bg-[#f5c542] px-4 text-[12px] font-black text-[#080e1a] transition hover:bg-[#f0bb2a]"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>
      </div>

      {/* ── HERO — dot grid bg ── */}
      <section
        className="relative px-5 pt-12 pb-14 overflow-hidden"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-52 rounded-full bg-[#2563eb]/15 blur-[90px] pointer-events-none" />
        <div className="absolute bottom-0 right-4 w-40 h-40 rounded-full bg-[#f5c542]/8 blur-[60px] pointer-events-none" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f5c542]/25 bg-[#f5c542]/8 px-3 py-1.5 mb-7">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f5c542]">
              {user ? (isOwner && hasCompletedOnboarding ? "Shop active" : "Account ready") : "Electronics retail OS"}
            </span>
          </div>

          <h1 className="text-[40px] font-black leading-[1.0] tracking-[-0.04em] mb-5 text-white">
            The operating<br />
            system for your<br />
            <span className="text-[#f5c542]">electronics shop.</span>
          </h1>

          <p className="text-[14px] leading-[1.75] text-white/72 mb-8 max-w-[360px]">
            Bill faster. Stock smarter. Sell everywhere. Built for the counter, designed for growth.
          </p>

          {user && (
            <div className="mb-8 rounded-2xl border border-[#2563eb]/25 bg-[#0f1d3a] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/55 mb-2">Signed in</p>
              <p className="text-[15px] font-bold">{displayName}</p>
              <p className="text-[13px] text-white/65 mt-0.5">{userEmail}</p>
              <p className="mt-3 text-[13px] text-white/78 leading-relaxed">
                {isOwner && hasCompletedOnboarding
                  ? "Your shop is live — jump back into your dashboard."
                  : "Complete onboarding to activate your shop."}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Link
              href={primaryHref}
              className="flex h-14 items-center justify-center rounded-2xl bg-[#f5c542] text-[#080e1a] text-[15px] font-black tracking-tight transition hover:bg-[#f0bb2a] active:scale-[0.98]"
            >
              {primaryLabel} →
            </Link>
            {!user && (
              <Link
                href={secondaryHref}
                className="flex h-12 items-center justify-center rounded-2xl border border-white/15 text-[13px] font-semibold text-white/85 transition hover:bg-white/5 hover:text-white"
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── STATS — solid navy panel ── */}
      <section className="bg-[#0c1526] border-y border-white/[0.05]">
        <div className="grid grid-cols-3 divide-x divide-white/[0.05]">
          {[
            { value: "3s", label: "Avg. bill time" },
            { value: "∞", label: "Stock items" },
            { value: "1", label: "OS for all" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center justify-center py-6 text-center px-2">
              <p className="text-[26px] font-black text-[#f5c542] leading-none">{stat.value}</p>
              <p className="text-[11px] text-white/55 mt-1.5 leading-snug">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES — line grid bg ── */}
      <section
        className="px-5 py-12 relative overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      >
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#60a5fa] font-bold mb-2">Inside the product</p>
          <h2 className="text-[26px] font-black leading-tight tracking-tight text-white mb-8">
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
                className="rounded-2xl p-5"
                style={{ backgroundColor: f.bg, border: `1px solid ${f.border}` }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${f.accent}12`, border: `1px solid ${f.accent}22` }}
                  >
                    {f.icon}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: f.accent }}>
                      {f.tag}
                    </span>
                    <h3 className="text-[16px] font-bold text-white mt-1 mb-1.5 leading-snug">{f.title}</h3>
                    <p className="text-[13px] text-white/72 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY — diagonal stripe bg ── */}
      <section
        className="px-5 py-12 relative overflow-hidden"
        style={{
          background: "#0c1526",
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 18px,
            rgba(255,255,255,0.015) 18px,
            rgba(255,255,255,0.015) 19px
          )`,
        }}
      >
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#f5c542] font-bold mb-2">Built different</p>
          <h2 className="text-[26px] font-black leading-tight tracking-tight text-white mb-8">
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
                className="flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-[#0a1222]/80 p-5"
              >
                <span className="text-[11px] font-black text-[#2563eb]/40 mt-0.5 shrink-0 w-6">{item.num}</span>
                <div>
                  <p className="text-[15px] font-bold text-white mb-1">{item.title}</p>
                  <p className="text-[13px] text-white/72 leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA — amber panel with dot texture ── */}
      <section className="mx-5 my-10 rounded-3xl bg-[#f5c542] p-7 overflow-hidden relative">
        <div
          className="absolute inset-0 opacity-[0.08] rounded-3xl"
          style={{
            backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#080e1a]/45 mb-3">Ready to start?</p>
          <h2 className="text-[24px] font-black leading-[1.1] tracking-tight text-[#080e1a] mb-2">
            Your shop deserves a real OS.
          </h2>
          <p className="text-[13px] text-[#080e1a]/55 mb-7 leading-relaxed">
            Join electronics shop owners running their entire business from one clean dashboard.
          </p>
          <Link
            href={primaryHref}
            className="flex items-center justify-center py-3.5 rounded-xl bg-[#080e1a] text-[#f5c542] text-[14px] font-black tracking-tight transition hover:bg-[#0f1d3a] active:scale-[0.98]"
          >
            {primaryLabel} →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#060c17] border-t border-white/[0.05] px-5 pt-10 pb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5c542] text-[#080e1a] text-[10px] font-black">
            DH
          </div>
          <div>
            <p className="text-[15px] font-bold text-white leading-tight">DukaanHQ</p>
            <p className="text-[11px] text-white/30">Electronics retail OS</p>
          </div>
        </div>

        <p className="text-[13px] text-white/60 leading-relaxed mb-8 max-w-[320px]">
          The operating system for electronics shop owners who want to bill faster, manage stock, and grow online.
        </p>

        <div className="grid grid-cols-2 gap-x-8 gap-y-6 mb-8">
          {[
            { label: "Product", links: ["Billing", "Inventory", "Ecommerce"] },
            { label: "Company", links: ["About", "Blog", "Contact"] },
          ].map((col) => (
            <div key={col.label}>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/25 mb-3">{col.label}</p>
              <div className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <a key={link} href="#" className="text-[13px] text-white/68 hover:text-white transition-colors">
                    {link}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.05] pt-5 flex items-center justify-between">
          <p className="text-[11px] text-white/35">© 2025 DukaanHQ</p>
          <div className="flex items-center gap-4">
            {["Privacy", "Terms"].map((t) => (
              <a key={t} href="#" className="text-[11px] text-white/40 hover:text-white/70 transition-colors">
                {t}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
