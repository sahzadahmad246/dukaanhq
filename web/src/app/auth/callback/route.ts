import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getConfiguredAppOrigin } from "@/lib/app-origin";
import { getSignedInLandingPath, getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function buildInviteRedirect(origin: string, inviteToken: string, error: string) {
  const url = new URL("/auth/login", origin);
  url.searchParams.set("invite", inviteToken);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

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
    return buildInviteRedirect(input.origin, input.inviteToken, "invite_access_denied");
  }

  const normalizedUserEmail = (input.user.email ?? "").trim().toLowerCase();
  const { data: invitation } = await adminSupabase
    .from("shop_member_invitations")
    .select("id, shop_id, email, full_name, role, status, invited_by, accepted_by, expires_at")
    .eq("invite_token", input.inviteToken)
    .maybeSingle<{
      id: string;
      shop_id: string;
      email: string;
      full_name: string | null;
      role: "owner" | "staff";
      status: string;
      invited_by: string | null;
      accepted_by: string | null;
      expires_at: string;
    }>();

  if (!invitation) {
    return buildInviteRedirect(input.origin, input.inviteToken, "invite_invalid");
  }

  if (normalizedUserEmail !== invitation.email.trim().toLowerCase()) {
    return buildInviteRedirect(input.origin, input.inviteToken, "invite_email_mismatch");
  }

  if (invitation.status === "ACCEPTED") {
    const { data: existingMember } = await adminSupabase
      .from("shop_members")
      .select("id")
      .eq("shop_id", invitation.shop_id)
      .eq("user_id", input.user.id)
      .eq("role", invitation.role)
      .maybeSingle<{ id: string }>();

    if (invitation.accepted_by === input.user.id || existingMember) {
      await syncProfileRoleForInvite({
        adminSupabase,
        user: input.user,
        role: invitation.role,
      });
      return null;
    }

    return buildInviteRedirect(input.origin, input.inviteToken, "invite_invalid");
  }

  const expired = new Date(invitation.expires_at).getTime() < Date.now();

  if (invitation.status !== "PENDING" || expired) {
    if (expired) {
      await adminSupabase.from("shop_member_invitations").update({ status: "EXPIRED" }).eq("id", invitation.id);
    }
    return buildInviteRedirect(input.origin, input.inviteToken, "invite_invalid");
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
    return buildInviteRedirect(input.origin, input.inviteToken, "invite_access_denied");
  }

  await adminSupabase
    .from("shop_member_invitations")
    .update({
      status: "ACCEPTED",
      accepted_by: input.user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id);

  await syncProfileRoleForInvite({
    adminSupabase,
    user: input.user,
    role: invitation.role,
  });

  return null;
}

async function syncProfileRoleForInvite(input: {
  adminSupabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
  user: {
    id: string;
    email?: string | null;
    user_metadata: Record<string, unknown>;
  };
  role: "owner" | "staff";
}) {
  if (input.role !== "staff") {
    return;
  }

  const { data: existingProfile } = await input.adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", input.user.id)
    .maybeSingle<{ role: string }>();

  // Keep profiles.role aligned for shop operators; do not downgrade an existing owner
  // (e.g. second-shop invites). Owner onboarding still sets profile.role to owner.
  if (
    existingProfile?.role !== "superadmin" &&
    existingProfile?.role !== "owner"
  ) {
    const profilePayload = {
      id: input.user.id,
      email: input.user.email ?? "",
      full_name:
        typeof input.user.user_metadata.full_name === "string"
          ? input.user.user_metadata.full_name
          : typeof input.user.user_metadata.name === "string"
            ? input.user.user_metadata.name
            : null,
      avatar_url:
        typeof input.user.user_metadata.avatar_url === "string"
          ? input.user.user_metadata.avatar_url
          : typeof input.user.user_metadata.picture === "string"
            ? input.user.user_metadata.picture
            : null,
      role: "staff",
    };

    const { error: profileRoleError } = await input.adminSupabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (profileRoleError) {
      console.error("Failed to sync profiles.role after invite accept:", profileRoleError);
    }
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appOrigin = getConfiguredAppOrigin() ?? requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const inviteToken = requestUrl.searchParams.get("invite") ?? cookieStore.get("dukaanhq_invite_token")?.value ?? null;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("OAuth callback session exchange failed:", exchangeError);
      return NextResponse.redirect(new URL("/auth/login?error=oauth_callback", appOrigin));
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (userError) {
        console.error("OAuth callback user lookup failed:", userError);
      }

      return NextResponse.redirect(new URL("/auth/login?error=session", appOrigin));
    }

    let activeInviteToken = inviteToken;

    // If no explicit invite token is provided in the URL/cookie, check if this email has a pending invitation
    if (!activeInviteToken) {
      const adminSupabase = createSupabaseAdminClient();
      if (adminSupabase) {
        const { data: invitation } = await adminSupabase
          .from("shop_member_invitations")
          .select("invite_token")
          .eq("email", user.email?.trim().toLowerCase())
          .eq("status", "PENDING")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (invitation) {
          activeInviteToken = invitation.invite_token;
        }
      }
    }

    if (activeInviteToken) {
      const inviteResponse = await acceptInviteForUser({
        inviteToken: activeInviteToken,
        user,
        origin: appOrigin,
      });

      if (inviteResponse) {
        // If it was an explicit invite click that failed (mismatch etc), redirect to error page
        if (inviteToken) {
          await supabase.auth.signOut();
          cookieStore.delete("dukaanhq_invite_token");
          return inviteResponse;
        }
        // If it was just an auto-detected invite that failed, we continue with normal login flow
        // so the user can at least access their profile or other shops.
      }
    }

    const appState = await getUserAppState(supabase);
    const selectedPlan = cookieStore.get("dukaanhq_selected_plan")?.value;
    const selectedBilling = cookieStore.get("dukaanhq_selected_billing")?.value;

    if (
      !appState.hasWorkspaceAccess &&
      !appState.isSuperAdmin &&
      selectedPlan &&
      ["starter", "growth", "pro"].includes(selectedPlan)
    ) {
      const startUrl = new URL("/subscribe/start", appOrigin);
      startUrl.searchParams.set("plan", selectedPlan);
      startUrl.searchParams.set("billing", selectedBilling === "year" ? "year" : "month");
      return NextResponse.redirect(startUrl);
    }

    const nextPath = getSignedInLandingPath({
      hasWorkspaceAccess: appState.hasWorkspaceAccess,
      isOwner: appState.isOwner,
      hasCompletedOnboarding: appState.hasCompletedOnboarding,
      canUseShopProduct: appState.canUseShopProduct,
      isSuperAdmin: appState.isSuperAdmin,
      isSuspendedMembership: appState.isSuspendedMembership,
      shopSlug: appState.shopSlug,
      hasApprovedSubscriptionIntent: appState.hasApprovedSubscriptionIntent,
    });
    cookieStore.delete("dukaanhq_invite_token");

    return NextResponse.redirect(new URL(nextPath, appOrigin));
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
        origin: appOrigin,
      });

      if (inviteResponse) {
        await supabase.auth.signOut();
        cookieStore.delete("dukaanhq_invite_token");
        return inviteResponse;
      }

      const appState = await getUserAppState(supabase);
      const nextPath = getSignedInLandingPath({
        hasWorkspaceAccess: appState.hasWorkspaceAccess,
        isOwner: appState.isOwner,
        hasCompletedOnboarding: appState.hasCompletedOnboarding,
        canUseShopProduct: appState.canUseShopProduct,
        isSuperAdmin: appState.isSuperAdmin,
        isSuspendedMembership: appState.isSuspendedMembership,
        shopSlug: appState.shopSlug,
        hasApprovedSubscriptionIntent: appState.hasApprovedSubscriptionIntent,
      });

      cookieStore.delete("dukaanhq_invite_token");
      return NextResponse.redirect(new URL(nextPath, appOrigin));
    }
  }

  return NextResponse.redirect(new URL("/", appOrigin));
}
