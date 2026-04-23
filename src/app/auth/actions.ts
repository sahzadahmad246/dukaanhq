"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const inviteToken = String(formData.get("invite") ?? "").trim();

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }

  const redirectUrl = new URL("/auth/callback", appUrl);
  if (inviteToken) {
    redirectUrl.searchParams.set("invite", inviteToken);
    cookieStore.set("dukaanhq_invite_token", inviteToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15,
    });
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl.toString(),
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
