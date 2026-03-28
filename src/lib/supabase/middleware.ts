import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const AUTH_SESSION_ERROR_CODES = new Set(["refresh_token_not_found", "session_not_found"]);

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-") || !cookie.name.includes("-auth-token")) {
      continue;
    }

    request.cookies.delete(cookie.name);
    response.cookies.delete(cookie.name);
  }
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    error,
  } = await supabase.auth.getUser();

  if (error) {
    if (error.code && AUTH_SESSION_ERROR_CODES.has(error.code)) {
      clearSupabaseAuthCookies(request, response);
      return response;
    }

    throw error;
  }

  return response;
}
