"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";

type SearchableOption = { value: string; label: string };

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  inputId,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  emptyLabel: string;
  inputId?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = options.find((option) => option.value === value);
  const displayValue = open ? query : query || selected?.label || "";

  return (
    <div className="space-y-2" ref={wrapperRef}>
      <div className="relative">
        <Input
          id={inputId}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={displayValue}
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.label ?? "");
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          placeholder={placeholder}
          className="h-11 rounded-xl border-stone-300 bg-white pr-10 text-sm text-stone-900"
        />
        <button
          type="button"
          onClick={() => {
            setOpen((current) => {
              const next = !current;
              if (next) {
                setQuery(selected?.label ?? "");
              } else {
                setQuery("");
              }
              return next;
            });
          }}
          className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center text-stone-400"
          aria-label={open ? "Close options" : "Open options"}
        >
          <ChevronsUpDown className="h-4 w-4" />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[70] rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
            <div className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-stone-400">{emptyLabel}</p>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-stone-900 transition hover:bg-stone-100"
                  >
                    <span>{option.label}</span>
                    {option.value === value ? <Check className="h-4 w-4 text-teal-700" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
