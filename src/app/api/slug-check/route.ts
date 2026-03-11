import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get("slug") ?? "").trim().toLowerCase();

  if (!slug) {
    return NextResponse.json({ available: false, message: "Slug is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("shops").select("id").eq("slug", slug).maybeSingle();

  if (error) {
    if (error.code && MISSING_TABLE_CODES.has(error.code)) {
      return NextResponse.json({ available: false, message: "Run onboarding SQL first." }, { status: 200 });
    }

    return NextResponse.json({ available: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ available: !data });
}
