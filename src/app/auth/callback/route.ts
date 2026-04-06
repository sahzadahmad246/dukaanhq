import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSignedInLandingPath } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function acceptInviteForUser(input: {
  inviteToken: string;
  user: {
    id: string;
    email?: string | null;
    user_metadata: Record<string, unknown>;
  };
  origin: string;
}) {
  const adminSupabase = createSupabaseAdminClient();

  if (!adminSupabase) {
    return NextResponse.redirect(new URL("/auth/login?error=invite_access_denied", input.origin));
  }

  const normalizedUserEmail = (input.user.email ?? "").trim().toLowerCase();
  const { data: invitation } = await adminSupabase
    .from("shop_member_invitations")
    .select("id, shop_id, email, full_name, role, status, invited_by, expires_at")
    .eq("invite_token", input.inviteToken)
    .maybeSingle<{
      id: string;
      shop_id: string;
      email: string;
      full_name: string | null;
      role: "owner" | "admin";
      status: string;
      invited_by: string | null;
      expires_at: string;
    }>();

  const expired = invitation ? new Date(invitation.expires_at).getTime() < Date.now() : true;

  if (!invitation || invitation.status !== "PENDING" || expired) {
    if (invitation && expired) {
      await adminSupabase.from("shop_member_invitations").update({ status: "EXPIRED" }).eq("id", invitation.id);
    }
    return NextResponse.redirect(new URL("/auth/login?error=invite_invalid", input.origin));
  }

  if (normalizedUserEmail !== invitation.email.trim().toLowerCase()) {
    return NextResponse.redirect(new URL("/auth/login?error=invite_email_mismatch", input.origin));
  }

  const { error: memberUpsertError } = await adminSupabase.from("shop_members").upsert(
    {
      shop_id: invitation.shop_id,
      user_id: input.user.id,
      role: invitation.role,
      invited_by: invitation.invited_by,
      email: normalizedUserEmail,
      full_name:
        invitation.full_name ??
        (typeof input.user.user_metadata.full_name === "string"
          ? input.user.user_metadata.full_name
          : typeof input.user.user_metadata.name === "string"
            ? input.user.user_metadata.name
            : null),
      status: "ACTIVE",
      joined_at: new Date().toISOString(),
      suspended_at: null,
    },
    { onConflict: "shop_id,user_id" }
  );

  if (memberUpsertError) {
    console.error("Failed to upsert invited shop member:", memberUpsertError);
    return NextResponse.redirect(new URL("/auth/login?error=invite_access_denied", input.origin));
  }

  await adminSupabase
    .from("shop_member_invitations")
    .update({
      status: "ACCEPTED",
      accepted_by: input.user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id);

  return null;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const inviteToken = requestUrl.searchParams.get("invite") ?? cookieStore.get("dukaanhq_invite_token")?.value ?? null;

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

    if (inviteToken) {
      const inviteResponse = await acceptInviteForUser({
        inviteToken,
        user,
        origin: requestUrl.origin,
      });

      if (inviteResponse) {
        await supabase.auth.signOut();
        cookieStore.delete("dukaanhq_invite_token");
        return inviteResponse;
      }
    }

    const { data: membership } = await supabase
      .from("shop_members")
      .select("shop_id, role, status")
      .eq("user_id", user.id)
      .maybeSingle<{ shop_id: string; role: string; status?: "ACTIVE" | "SUSPENDED" | null }>();

    const { data: shopSettings } = membership
      ? await supabase
          .from("shop_settings")
          .select("onboarding_completed")
          .eq("shop_id", membership.shop_id)
          .maybeSingle<{ onboarding_completed: boolean }>()
      : { data: null };

    const isOwner = membership?.role === "owner";
    const hasWorkspaceAccess = Boolean(membership && membership.status !== "SUSPENDED" && ["owner", "admin"].includes(membership.role));
    const hasCompletedOnboarding = Boolean(shopSettings?.onboarding_completed);
    const nextPath = getSignedInLandingPath({ isOwner, hasWorkspaceAccess, hasCompletedOnboarding });
    cookieStore.delete("dukaanhq_invite_token");

    return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  }

  if (inviteToken) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!userError && user) {
      const inviteResponse = await acceptInviteForUser({
        inviteToken,
        user,
        origin: requestUrl.origin,
      });

      if (inviteResponse) {
        await supabase.auth.signOut();
        cookieStore.delete("dukaanhq_invite_token");
        return inviteResponse;
      }

      const { data: membership } = await supabase
        .from("shop_members")
        .select("shop_id, role, status")
        .eq("user_id", user.id)
        .maybeSingle<{ shop_id: string; role: string; status?: "ACTIVE" | "SUSPENDED" | null }>();

      const { data: shopSettings } = membership
        ? await supabase
            .from("shop_settings")
            .select("onboarding_completed")
            .eq("shop_id", membership.shop_id)
            .maybeSingle<{ onboarding_completed: boolean }>()
        : { data: null };

      const nextPath = getSignedInLandingPath({
        isOwner: membership?.role === "owner",
        hasWorkspaceAccess: Boolean(membership && membership.status !== "SUSPENDED" && ["owner", "admin"].includes(membership.role)),
        hasCompletedOnboarding: Boolean(shopSettings?.onboarding_completed),
      });

      cookieStore.delete("dukaanhq_invite_token");
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
