"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const headerList = await headers();
  
  // Try to get the origin from headers, or fallback to the env variable
  const origin = headerList.get("origin");
  const appUrl = origin || process.env.NEXT_PUBLIC_APP_URL;
  
  const inviteToken = String(formData.get("invite") ?? "").trim();

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured and origin header is missing.");
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
