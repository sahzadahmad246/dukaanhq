"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import {
  INVOICE_FOOTER_LINE_MAX_LENGTH,
  INVOICE_FOOTER_MAX_LINES,
} from "@/lib/invoice-footer";

type InvoiceFooterLinesEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  name?: string;
  variant?: "modal" | "inline";
  title?: string;
  buttonLabel?: string;
  emptyLabel?: string;
  maxLines?: number;
  lineMaxLength?: number;
};

function parseFooterLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinFooterLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

function FooterLineBuilder({
  value,
  onChange,
  maxLines,
  lineMaxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLines: number;
  lineMaxLength: number;
}) {
  const lines = useMemo(() => parseFooterLines(value).slice(0, maxLines), [maxLines, value]);
  const [lineDraft, setLineDraft] = useState("");
  const [error, setError] = useState("");

  function updateLines(nextLines: string[]) {
    onChange(joinFooterLines(nextLines.slice(0, maxLines)));
  }

  function addLine() {
    const nextLine = lineDraft.trim();
    if (!nextLine) {
      setError("Add some text first.");
      return;
    }

    if (lines.length >= maxLines) {
      setError(`Maximum ${maxLines} footer lines allowed.`);
      return;
    }

    updateLines([...lines, nextLine]);
    setLineDraft("");
    setError("");
  }

  function removeLine(index: number) {
    updateLines(lines.filter((_, itemIndex) => itemIndex !== index));
    setError("");
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium text-stone-900" htmlFor="invoice-footer-line">
          Footer line
        </label>
        <div className="flex gap-2">
          <input
            id="invoice-footer-line"
            type="text"
            value={lineDraft}
            onChange={(event) => {
              setLineDraft(event.target.value.slice(0, lineMaxLength));
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLine();
              }
            }}
            maxLength={lineMaxLength}
            disabled={lines.length >= maxLines}
            placeholder="Goods once sold are not returnable"
            className="h-12 min-w-0 flex-1 rounded-2xl bg-stone-100 px-4 text-sm outline-none transition focus:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={addLine}
            disabled={lines.length >= maxLines}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Add footer line"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
          <span>{lineDraft.length}/{lineMaxLength} characters</span>
          <span>{lines.length}/{maxLines} lines</span>
        </div>
        {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}
      </div>

      <div className="grid gap-2">
        {lines.length ? (
          lines.map((line, index) => (
            <div key={`${line}-${index}`} className="flex items-start gap-3 rounded-2xl bg-stone-50 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-stone-600">
                {index + 1}
              </div>
              <p className="min-w-0 flex-1 break-words text-sm font-medium text-stone-900">{line}</p>
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-stone-600 transition hover:text-red-600"
                aria-label={`Remove footer line ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-stone-50 p-4 text-sm font-medium text-stone-500">
            No footer lines added yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function InvoiceFooterLinesEditor({
  value,
  onChange,
  name,
  variant = "modal",
  title = "Invoice footer",
  buttonLabel = "Edit footer lines",
  emptyLabel = "No footer lines added yet.",
  maxLines = INVOICE_FOOTER_MAX_LINES,
  lineMaxLength = INVOICE_FOOTER_LINE_MAX_LENGTH,
}: InvoiceFooterLinesEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(value);
  const [draftValue, setDraftValue] = useState(value);
  const currentValue = onChange ? value : internalValue;
  const lines = useMemo(() => parseFooterLines(currentValue).slice(0, maxLines), [currentValue, maxLines]);

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      setDraftValue(currentValue);
    }
  }, [currentValue, isOpen]);

  function saveDraft() {
    const nextValue = joinFooterLines(parseFooterLines(draftValue).slice(0, maxLines));
    setInternalValue(nextValue);
    onChange?.(nextValue);
    setIsOpen(false);
  }

  if (variant === "inline") {
    return (
      <>
        {name ? <input type="hidden" name={name} value={currentValue} /> : null}
        <FooterLineBuilder
          value={currentValue}
          onChange={(nextValue) => {
            setInternalValue(nextValue);
            onChange?.(nextValue);
          }}
          maxLines={maxLines}
          lineMaxLength={lineMaxLength}
        />
      </>
    );
  }

  return (
    <div className="grid gap-3">
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <div className="rounded-2xl bg-stone-50 p-4">
        {lines.length ? (
          <ol className="grid gap-2">
            {lines.map((line, index) => (
              <li key={`${line}-${index}`} className="flex gap-2 text-sm font-medium text-stone-800">
                <span className="text-stone-400">{index + 1}.</span>
                <span className="min-w-0 break-words">{line}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm font-medium text-stone-500">{emptyLabel}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setDraftValue(currentValue);
          setIsOpen(true);
        }}
        className="flex h-11 items-center justify-center rounded-2xl border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-900 transition hover:bg-stone-50"
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-stone-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-stone-950">{title}</h3>
                <p className="mt-1 text-sm text-stone-500">
                  Add up to {maxLines} short lines. Each line prints separately on the invoice.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700"
                aria-label="Close invoice footer editor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5">
              <FooterLineBuilder
                value={draftValue}
                onChange={setDraftValue}
                maxLines={maxLines}
                lineMaxLength={lineMaxLength}
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Save footer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
