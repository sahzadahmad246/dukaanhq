"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/app-origin";

export async function signInWithGoogle(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const headerList = await headers();
  const appUrl = getAppOrigin(headerList);
  
  const inviteToken = String(formData.get("invite") ?? "").trim();

  if (!appUrl) {
    throw new Error("Could not determine app URL from headers or environment.");
  }

  if (inviteToken) {
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
      redirectTo: new URL("/auth/callback", appUrl).toString(),
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
