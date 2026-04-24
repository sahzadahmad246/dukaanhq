import Image from "next/image";
import { redirect } from "next/navigation";

import { MarketingHeader } from "@/app/_components/marketing-header";
import { signInWithGoogle } from "@/app/auth/actions";
import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

function getInviteErrorCopy(error?: string) {
  if (error === "invite_invalid") return "This staff invitation is invalid or expired.";
  if (error === "invite_email_mismatch") return "Email Mismatch: You logged in with a different account. Please use the exact Google email that received this invitation.";
  if (error === "invite_access_denied") return "We could not activate this invitation. Please contact the shop owner.";
  return null;
}

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; error?: string }>;
}) {
  const query = await searchParams;
  const inviteToken = query.invite ?? "";
  const errorCopy = getInviteErrorCopy(query.error);

  if (!inviteToken) {
    redirect("/auth/login");
  }

  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  // If they are logged in but came here with an error, it means their current session is the WRONG one.
  // We keep them here so they can see the error and sign out/re-login.
  if (state.user && !query.error) {
    redirect(`/auth/callback?invite=${encodeURIComponent(inviteToken)}`);
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: invitation } = adminSupabase
    ? await adminSupabase
        .from("shop_member_invitations")
        .select("id, shop_id, email, full_name, status, expires_at")
        .eq("invite_token", inviteToken)
        .maybeSingle<{
          id: string;
          shop_id: string;
          email: string;
          full_name: string | null;
          status: string;
          expires_at: string;
        }>()
    : { data: null };

  const expired = invitation ? new Date(invitation.expires_at).getTime() < Date.now() : true;
  const isValidInvite = Boolean(invitation && (invitation.status === "PENDING" || invitation.status === "ACCEPTED") && !expired);

  let shopName = "DukaanHQ shop";
  if (invitation && adminSupabase) {
    const { data: shop } = await adminSupabase
      .from("shops")
      .select("name")
      .eq("id", invitation.shop_id)
      .maybeSingle<{ name: string }>();
    shopName = shop?.name ?? shopName;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4efe4] text-[#171717]">
      <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_top_left,_rgba(245,197,66,0.35),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(15,23,42,0.12),_transparent_30%),linear-gradient(180deg,_#f7f0dd_0%,_#f4efe4_100%)]" />
      <MarketingHeader
        containerClassName="max-w-5xl"
        actionHref="/"
        actionLabel="Back"
        actionVariant="ghost"
      />

      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-5xl flex-col justify-center px-5 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr]">
          <section className="mx-auto w-full max-w-2xl rounded-[2.25rem] border border-[#e7dcc3] bg-[#fffaf0] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] sm:p-8 lg:p-10">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#eadfca]">
                <Image src="/logo.png" alt="DukaanHQ" fill className="object-contain p-2.5" priority />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8a6a18]">Staff Invitation</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-[#171717] sm:text-4xl">
                  Join {shopName}
                </h1>
              </div>
            </div>

            <div className="mt-8 rounded-[1.75rem] bg-white p-5 ring-1 ring-[#efe3cc] sm:p-6">
              {errorCopy ? (
                <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
                  <p className="text-sm font-bold text-rose-800 uppercase tracking-wider mb-1">Access Denied</p>
                  <p className="text-base font-semibold leading-relaxed text-rose-900">
                    {errorCopy}
                  </p>
                </div>
              ) : (
                <p className="text-base leading-7 text-[#4a4a4a]">
                  Use the exact same Google email that received this invitation. After login, we will automatically
                  connect you to the shop as staff.
                </p>
              )}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#faf6ec] p-4 ring-1 ring-inset ring-[#efe3cc]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a6a18]">Invited Email</p>
                  <p className="mt-2 break-all text-sm font-semibold text-[#171717]">
                    {invitation?.email ?? "Unavailable"}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#faf6ec] p-4 ring-1 ring-inset ring-[#efe3cc]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a6a18]">Invited Name</p>
                  <p className="mt-2 text-sm font-semibold text-[#171717]">
                    {invitation?.full_name ?? "Staff member"}
                  </p>
                </div>
              </div>

              {!isValidInvite ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm leading-6 text-red-700">
                  This invitation is no longer available. Ask the shop owner to send you a fresh invite.
                </div>
              ) : (
                <form action={signInWithGoogle} className="mt-8">
                  <input type="hidden" name="invite" value={inviteToken} />
                  <button
                    type="submit"
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[#f5c542] text-sm font-black text-[#080e1a] transition hover:bg-[#efbb27] shadow-lg shadow-black/5"
                  >
                    <GoogleIcon />
                    {query.error ? "Try another account" : "Continue with Google"}
                  </button>
                </form>
              )}
            </div>
            
            <p className="mt-8 text-center text-sm text-[#78716c]">
              Wrong email? Contact the shop owner to resend the invite to the correct address.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
