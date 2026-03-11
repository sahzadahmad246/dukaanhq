import { NextResponse } from "next/server";

import { syncAuthenticatedUserProfile } from "@/lib/auth/sync-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
    await syncAuthenticatedUserProfile(supabase);
  }

  return NextResponse.redirect(new URL("/app", requestUrl.origin));
}
