"use client";

import Image from "next/image";
import { ArrowLeft, Plus, QrCode, Search, X } from "lucide-react";

export function InventoryTopBar({
  searchQuery,
  onSearchChange,
  onBack,
  onAdd,
  onQrExport,
  userAvatarUrl,
  avatarFallback,
  searchPlaceholder = "Search products like Apple iPhone 15",
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onBack: () => void;
  onAdd?: () => void;
  onQrExport?: () => void;
  userAvatarUrl?: string | null;
  avatarFallback?: string;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center text-stone-950"
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="block h-10 w-full min-w-0 max-w-full rounded-xl border border-stone-200 bg-stone-50 pl-10 pr-10 text-sm text-stone-900 outline-none transition focus:border-stone-300 focus:bg-white"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-200 hover:text-stone-700"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {onQrExport ? (
        <button
          type="button"
          onClick={onQrExport}
          title="Export QR"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 shadow-sm transition hover:bg-stone-200"
          aria-label="Export QR"
        >
          <QrCode className="h-4 w-4" />
        </button>
      ) : null}
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          title="Add Product"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white shadow-sm transition hover:bg-stone-800"
          aria-label="Add Product"
        >
          <Plus className="h-4 w-4" />
        </button>
      ) : userAvatarUrl || avatarFallback ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-sm font-semibold text-white">
          {userAvatarUrl ? (
            <Image
              src={userAvatarUrl}
              alt="Profile"
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span>{avatarFallback}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
