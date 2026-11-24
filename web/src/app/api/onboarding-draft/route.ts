import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const ONBOARDING_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isExpiredDraft(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return true;
  }

  const savedAt = (payload as { savedAt?: unknown }).savedAt;
  return typeof savedAt !== "number" || Date.now() - savedAt > ONBOARDING_DRAFT_TTL_MS;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("onboarding_drafts")
    .select("payload")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (data?.payload && isExpiredDraft(data.payload)) {
    await supabase.from("onboarding_drafts").delete().eq("user_id", user.id);
    return NextResponse.json({ draft: null });
  }

  return NextResponse.json({ draft: data?.payload ?? null });
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { draft?: unknown };

  if (!body.draft || typeof body.draft !== "object" || Array.isArray(body.draft)) {
    return NextResponse.json({ message: "Invalid draft payload" }, { status: 400 });
  }

  const { error } = await supabase.from("onboarding_drafts").upsert(
    {
      user_id: user.id,
      payload: body.draft,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("onboarding_drafts").delete().eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
