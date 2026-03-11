import type { SupabaseClient, User } from "@supabase/supabase-js";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

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
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, profileSyncReady: false };
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(getProfilePayload(user), { onConflict: "id" })
    .select("id, email, full_name, avatar_url, role")
    .single<ProfileRecord>();

  if (error) {
    if (error.code && MISSING_TABLE_CODES.has(error.code)) {
      return { user, profile: null, profileSyncReady: false };
    }

    throw error;
  }

  return { user, profile: data, profileSyncReady: true };
}
