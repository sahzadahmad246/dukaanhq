import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const supabase = await createSupabaseServerClient();

  // Clears auth cookies via @supabase/ssr cookie helpers.
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", url.origin), { status: 303 });
}

// Handy for simple link-based logout.
export async function GET(request: Request) {
  return POST(request);
}

