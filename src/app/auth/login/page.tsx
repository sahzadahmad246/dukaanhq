import { redirect } from "next/navigation";
import { Boxes, FileText, ShieldCheck, Sparkles } from "lucide-react";

import { MarketingHeader } from "@/app/_components/marketing-header";
import { signInWithGoogle } from "@/app/auth/actions";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M21.805 12.041c0-.792-.064-1.37-.202-1.97H12.2v3.71h5.517c-.111.922-.711 2.31-2.044 3.243l-.019.124 3.027 2.297.21.02c1.934-1.75 3.114-4.328 3.114-7.424Z"
        fill="#4285F4"
      />
      <path
        d="M12.2 21.75c2.704 0 4.973-.868 6.63-2.364l-3.218-2.441c-.86.585-2.01.998-3.412.998-2.648 0-4.89-1.75-5.694-4.168l-.12.01-3.148 2.386-.041.112C4.843 19.465 8.234 21.75 12.2 21.75Z"
        fill="#34A853"
      />
      <path
        d="M6.506 13.775a5.83 5.83 0 0 1-.334-1.925c0-.672.122-1.322.324-1.925l-.006-.129-3.188-2.424-.104.048A9.642 9.642 0 0 0 2.188 11.85c0 1.55.378 3.017 1.01 4.43l3.308-2.505Z"
        fill="#FBBC05"
      />
      <path
        d="M12.2 5.757c1.768 0 2.962.748 3.643 1.373l2.662-2.549C17.164 3.36 14.904 2.25 12.2 2.25c-3.966 0-7.357 2.285-9.003 5.604l3.298 2.505c.813-2.418 3.055-4.602 5.704-4.602Z"
        fill="#EB4335"
      />
    </svg>
  );
}

function getLoginErrorCopy(error?: string) {
  if (error === "invite_invalid") return "This staff invitation is invalid or expired.";
  if (error === "invite_email_mismatch") return "Please continue with Google using the same email address that received the invitation.";
  if (error === "invite_access_denied") return "Your invitation could not be accepted. Please contact the shop owner.";
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; error?: string; plan?: string; billing?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);
  const query = await searchParams;
  const inviteToken = query.invite ?? "";
  const selectedPlan = ["starter", "growth", "pro"].includes(query.plan ?? "") ? query.plan ?? "" : "";
  const selectedBilling = query.billing === "year" ? "year" : "month";
  const loginError = getLoginErrorCopy(query.error);

  if (state.user) {
    if (inviteToken) {
      redirect(`/auth/callback?invite=${encodeURIComponent(inviteToken)}`);
    }

    redirect(getSignedInLandingPath(state));
  }

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-[645px] overflow-x-hidden bg-[#f7f8fb] pt-[72px] text-stone-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_20%_10%,_rgba(245,197,66,0.22),_transparent_28%),radial-gradient(circle_at_85%_14%,_rgba(96,165,250,0.18),_transparent_30%)]" />

      <MarketingHeader
        containerClassName="max-w-[645px]"
        actionHref="/"
        actionLabel="Back"
        actionVariant="ghost"
        theme="light"
      />

      <div
        className="relative mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[645px] flex-col px-5 py-8"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(120,113,108,0.10) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      >
        <section className="w-full">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">Secure login</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-stone-950">
              Continue with Google
            </h1>
            <p className="max-w-sm text-sm leading-6 text-stone-600">
              {inviteToken ? "Use the invited Google email to accept staff access." : "Sign in to enter DukaanHQ."}
            </p>
            {loginError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {loginError}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8 flex-1">
          <div className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="pointer-events-none absolute -right-14 -top-16 h-36 w-36 rounded-full bg-[#f5c542]/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 left-4 h-32 w-32 rounded-full bg-sky-300/25 blur-3xl" />
            <div className="relative">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-400">DukaanHQ</p>
                  <p className="mt-1 text-lg font-black text-stone-950">Retail workspace</p>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-stone-950 text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <div className="grid gap-3">
            {[
              {
                icon: FileText,
                title: "Fast billing",
                detail: "Create invoices and PDFs from one clean counter flow.",
              },
              {
                icon: Boxes,
                title: "Live inventory",
                detail: "Track stock, low-stock products, and refill actions.",
              },
              {
                icon: ShieldCheck,
                title: "Owner access",
                detail: "Google sign-in keeps your shop workspace protected.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50 px-3 py-3"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-stone-700 shadow-sm">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-950">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-stone-500">{item.detail}</p>
                </div>
              </div>
            ))}
              </div>
            </div>
          </div>
        </section>

        <form action={signInWithGoogle} className="mt-8">
          {inviteToken ? <input type="hidden" name="invite" value={inviteToken} /> : null}
          {selectedPlan ? <input type="hidden" name="plan" value={selectedPlan} /> : null}
          {selectedPlan ? <input type="hidden" name="billing" value={selectedBilling} /> : null}
          <button
            type="submit"
            className="flex h-13 w-full items-center justify-center gap-3 rounded-full bg-stone-950 text-sm font-black text-white shadow-[0_16px_35px_rgba(15,23,42,0.22)] transition hover:bg-stone-800"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-stone-500">
            We only use Google to verify your account and open the right shop workspace.
          </p>
        </form>
      </div>
    </main>
  );
}
