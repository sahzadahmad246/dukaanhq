import type { SupabaseClient, User } from "@supabase/supabase-js";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const AUTH_SESSION_ERROR_CODES = new Set(["refresh_token_not_found", "session_not_found"]);

type ProfileRecord = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "customer" | "staff" | "owner" | "admin";
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
    if (authError.code && AUTH_SESSION_ERROR_CODES.has(authError.code)) {
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
      return { user, profile: existingProfile, profileSyncReady: true };
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

    return { user, profile: updatedProfile, profileSyncReady: true };
  }

  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .insert(getProfilePayload(user))
    .select("id, email, full_name, avatar_url, role")
    .single<ProfileRecord>();

  if (insertError) {
    throw insertError;
  }

  return { user, profile: insertedProfile, profileSyncReady: true };
}
