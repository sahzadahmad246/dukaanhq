"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProfileMenuProps = {
  userInitials: string;
  userName?: string | null;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  theme?: "dark" | "light";
};

export function ProfileMenu({
  userInitials,
  userName,
  userEmail,
  userAvatarUrl,
  theme = "dark",
}: ProfileMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      setMenuOpen(false);
      window.location.replace("/");
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isLight = theme === "light";

  return (
    <div className="relative z-[1300]" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:opacity-90"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        {userAvatarUrl ? (
          <Image
            src={userAvatarUrl}
            alt={userName ?? "Profile"}
            width={36}
            height={36}
            className={isLight ? "h-9 w-9 rounded-full border border-stone-200 object-cover" : "h-8 w-8 rounded-full object-cover"}
          />
        ) : (
          <div
            className={
              isLight
                ? "flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white"
                : "flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#1a2540] text-xs font-bold text-white"
            }
          >
            {userInitials}
          </div>
        )}
      </button>

      {menuOpen ? (
        <div
          className={
            isLight
              ? "absolute right-0 top-[calc(100%+0.75rem)] z-[1300] w-64 rounded-2xl border border-stone-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
              : "absolute right-0 top-[calc(100%+0.75rem)] z-[1300] w-64 rounded-2xl border border-white/10 bg-[#10192d] p-3 shadow-[0_24px_60px_rgba(3,7,18,0.45)]"
          }
        >
          <div className="px-1 pb-3">
            <p className={isLight ? "text-sm font-bold text-stone-950" : "text-sm font-bold text-white"}>
              {userName ?? "DukaanHQ User"}
            </p>
            <p className={isLight ? "mt-1 text-xs text-stone-500" : "mt-1 text-xs text-white/62"}>
              {userEmail ?? ""}
            </p>
          </div>
          <div className={isLight ? "border-t border-stone-200" : "border-t border-white/10"} />
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={
              isLight
                ? "mt-3 flex w-full items-center gap-2 px-1 py-1 text-sm font-semibold text-stone-700 transition hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
                : "mt-3 flex w-full items-center gap-2 px-1 py-1 text-sm font-semibold text-white/84 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
