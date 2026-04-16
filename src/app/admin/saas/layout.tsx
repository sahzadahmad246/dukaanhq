import { redirect } from "next/navigation";

import { getUserAppState } from "@/lib/auth/user-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const state = await getUserAppState(supabase);

  if (!state.user) {
    redirect("/auth/login");
  }

  if (!state.isSuperAdmin) {
    redirect("/");
  }

  return <div className="min-h-screen bg-stone-100 text-stone-950">{children}</div>;
}
