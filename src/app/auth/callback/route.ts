import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("OAuth callback session exchange failed:", exchangeError);
      return NextResponse.redirect(new URL("/auth/login?error=oauth_callback", requestUrl.origin));
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (userError) {
        console.error("OAuth callback user lookup failed:", userError);
      }

      return NextResponse.redirect(new URL("/auth/login?error=session", requestUrl.origin));
    }

    const { data: membership } = await supabase
      .from("shop_members")
      .select("shop_id, role")
      .eq("user_id", user.id)
      .maybeSingle<{ shop_id: string; role: string }>();

    const { data: shopSettings } = membership
      ? await supabase
          .from("shop_settings")
          .select("onboarding_completed")
          .eq("shop_id", membership.shop_id)
          .maybeSingle<{ onboarding_completed: boolean }>()
      : { data: null };

    const isOwner = membership?.role === "owner";
    const hasCompletedOnboarding = Boolean(shopSettings?.onboarding_completed);
    const nextPath = isOwner && hasCompletedOnboarding ? "/dashboard" : "/";

    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
