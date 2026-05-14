import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const AUTH_SESSION_ERROR_CODES = new Set(["refresh_token_not_found", "session_not_found", "user_not_found"]);

function isMissingAuthSessionError(error: { code?: string; status?: number; message?: string; name?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  if (error.code && AUTH_SESSION_ERROR_CODES.has(error.code)) {
    return true;
  }

  const normalizedMessage = (error.message ?? "").toLowerCase();
  return (
    (error.status === 400 && (error.name === "AuthSessionMissingError" || normalizedMessage.includes("auth session missing"))) ||
    (error.status === 403 && normalizedMessage.includes("user") && normalizedMessage.includes("does not exist"))
  );
}

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "customer" | "staff" | "owner" | "admin" | "superadmin";
};

function getProfilePayload(user: User): Omit<ProfileRecord, "role"> {
  return {
    id: user.id,
    email: user.email ?? "",
    full_name: user.user_metadata.full_name ?? user.user_metadata.name ?? null,
    avatar_url: user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
  };
}

export async function syncAuthenticatedUserProfile(supabase: SupabaseClient) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    if (isMissingAuthSessionError(authError)) {
      await supabase.auth.signOut();
      return { user: null, profile: null, profileSyncReady: false };
    }

    throw authError;
  }

  if (!user) {
    return { user: null, profile: null, profileSyncReady: false };
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle<ProfileRecord>();

  if (existingProfileError) {
    if (existingProfileError.code && MISSING_TABLE_CODES.has(existingProfileError.code)) {
      return { user, profile: null, profileSyncReady: false };
    }

    throw existingProfileError;
  }

  if (existingProfile) {
    const nextProfilePayload = getProfilePayload(user);
    const shouldUpdate =
      existingProfile.email !== nextProfilePayload.email ||
      existingProfile.full_name !== nextProfilePayload.full_name ||
      existingProfile.avatar_url !== nextProfilePayload.avatar_url;

    if (!shouldUpdate) {
      const promoted = await maybePromoteSuperadmin(supabase, user, existingProfile);
      return { user, profile: promoted, profileSyncReady: true };
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update(nextProfilePayload)
      .eq("id", user.id)
      .select("id, email, full_name, avatar_url, role")
      .single<ProfileRecord>();

    if (updateError) {
      throw updateError;
    }

    const promotedAfterUpdate = await maybePromoteSuperadmin(supabase, user, updatedProfile);
    return { user, profile: promotedAfterUpdate, profileSyncReady: true };
  }

  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .insert(getProfilePayload(user))
    .select("id, email, full_name, avatar_url, role")
    .single<ProfileRecord>();

  if (insertError) {
    throw insertError;
  }

  const promotedInsert = await maybePromoteSuperadmin(supabase, user, insertedProfile);
  return { user, profile: promotedInsert, profileSyncReady: true };
}

function getSuperadminPromoteEmails() {
  const raw = process.env.SUPERADMIN_PROMOTE_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function maybePromoteSuperadmin(supabase: SupabaseClient, user: User, profile: ProfileRecord | null) {
  const emails = getSuperadminPromoteEmails();
  const userEmail = (user.email ?? "").trim().toLowerCase();
  if (!emails.length || !userEmail || !emails.includes(userEmail)) {
    return profile;
  }

  if (profile?.role === "superadmin") {
    return profile;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return profile;
  }

  const { error } = await admin.from("profiles").update({ role: "superadmin" }).eq("id", user.id);
  if (error) {
    console.error("Superadmin promote failed:", error.message);
    return profile;
  }

  const { data: refreshed } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle<ProfileRecord>();

  if (refreshed) {
    return refreshed;
  }
  return profile ? { ...profile, role: "superadmin" } : null;
}
