"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const headerList = await headers();
  
  // Use host and x-forwarded-proto to build a reliable app URL
  const host = headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") || "https";
  
  // Dynamic URL construction is more reliable than static ENV in many proxy setups
  const appUrl = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL;
  
  const inviteToken = String(formData.get("invite") ?? "").trim();

  if (!appUrl) {
    throw new Error("Could not determine app URL from headers or environment.");
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
