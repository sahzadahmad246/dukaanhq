import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signInWithGoogle() {
  "use server";

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error || !data.url) {
    throw new Error(error?.message ?? "Unable to start Google sign-in.");
  }

  redirect(data.url);
}

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5f5f4,_#fff7ed)] px-4 py-6 text-stone-950">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm md:max-w-md lg:max-w-lg flex-col justify-between rounded-[2rem] border border-white/70 bg-white p-5 shadow-[0_24px_80px_rgba(146,64,14,0.12)]">
        <section className="space-y-5">
          <div className="flex items-center justify-between text-sm">
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">
              DukaanHQ
            </span>
            <span className="text-stone-500">Sign in</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              Set up your shop account.
            </h1>
            <p className="text-sm leading-6 text-stone-600">
              Use Google to sign in. After login, the next step will be shop
              onboarding and role-based access.
            </p>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
            Initial auth mode:
            <ul className="mt-3 space-y-2 text-stone-800">
              <li>Google sign-in for owners and staff</li>
              <li>Staff access after invite mapping</li>
              <li>Customer auth added later with storefront</li>
            </ul>
          </div>
        </section>

        <section className="space-y-3">
          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Continue with Google
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
