import { NextResponse } from "next/server";

import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
    const state = await getUserAppState(supabase);
    return NextResponse.redirect(new URL(getSignedInLandingPath(state), requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
