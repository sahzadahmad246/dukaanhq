import { redirect } from "next/navigation";

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
  searchParams: Promise<{ invite?: string; error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);
  const query = await searchParams;
  const inviteToken = query.invite ?? "";
  const loginError = getLoginErrorCopy(query.error);

  if (inviteToken) {
    redirect(`/auth/invite?invite=${encodeURIComponent(inviteToken)}`);
  }

  if (state.user) {
    redirect(getSignedInLandingPath(state));
  }

  return (
    <main className="relative min-h-screen w-full max-w-[645px] mx-auto overflow-x-hidden bg-[#080e1a] pt-[72px] text-white">
      <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,197,66,0.12),_transparent_30%),linear-gradient(180deg,_#0a1020_0%,_#080e1a_65%,_#060c17_100%)]" />

      <MarketingHeader
        containerClassName="max-w-[645px]"
        actionHref="/"
        actionLabel="Back"
        actionVariant="ghost"
      />

      <div
        className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[645px] flex-col px-5 py-8"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
      >
        <section className="w-full max-w-md">
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-white">
              Continue with Google
            </h1>
            <p className="text-sm leading-6 text-white/68">
              {inviteToken ? "Use the invited Google email to accept staff access." : "Sign in to enter DukaanHQ."}
            </p>
            {loginError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-medium text-amber-800">
                {loginError}
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-10 flex-1">
          <div>
            {[
              {
                step: "01",
                title: "Login",
                detail: "Use your Google account to enter DukaanHQ.",
                active: true,
              },
              {
                step: "02",
                title: "Onboard",
                detail: "Create your shop and set up the basics.",
                active: false,
              },
              {
                step: "03",
                title: "Start using DukaanHQ",
                detail: "Open the dashboard and run billing, inventory, and more.",
                active: false,
              },
            ].map((item, index, items) => (
              <div
                key={item.step}
                className={index < items.length - 1 ? "relative flex gap-4 pb-6" : "relative flex gap-4"}
              >
                <div className="relative flex w-10 shrink-0 justify-center">
                  <div
                    className={[
                      "relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-xs font-black",
                      item.active
                        ? "bg-[#f5c542] text-[#080e1a]"
                        : "border border-white/12 bg-white/5 text-white/72",
                    ].join(" ")}
                  >
                    {item.step}
                  </div>
                  {index < items.length - 1 ? (
                    <div className="absolute left-1/2 top-10 h-[calc(100%-1rem)] w-px -translate-x-1/2 bg-white/10" />
                  ) : null}
                </div>

                <div className="pt-1 pb-1">
                  <p className={item.active ? "text-base font-bold text-white" : "text-base font-bold text-white/82"}>
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-white/60">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <form action={signInWithGoogle} className="mt-8">
          {inviteToken ? <input type="hidden" name="invite" value={inviteToken} /> : null}
          <button
            type="submit"
            className="flex h-13 w-full items-center justify-center gap-3 rounded-full bg-[#f5c542] text-sm font-black text-[#080e1a] transition hover:bg-[#f0bb2a]"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
