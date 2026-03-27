"use client";

import { ChevronsUpDown, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function StoragePresetPicker({
  value,
  onChange,
  presets,
  placeholder,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  presets: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPresets = useMemo(() => {
    if (!normalizedQuery) return presets;
    return presets.filter((preset) => preset.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, presets]);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            onChange(nextValue);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition hover:text-stone-700"
        >
          <ChevronsUpDown className="h-4 w-4" />
        </button>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
          <div className="max-h-64 overflow-y-auto p-2">
            {filteredPresets.length > 0 ? (
              filteredPresets.map((preset) => {
                const active = preset === value;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onChange(preset);
                      setQuery(preset);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition",
                      active ? "bg-stone-950 text-white" : "text-stone-700 hover:bg-stone-50"
                    )}
                  >
                    <span>{preset}</span>
                    {active ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-4 text-sm text-stone-500">No preset found. You can keep typing your own value.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
