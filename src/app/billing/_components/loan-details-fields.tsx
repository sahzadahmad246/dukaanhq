"use client";

import { Minus, Plus, X } from "lucide-react";
import { useState } from "react";

const TENURE_OPTIONS = [3, 6, 9, 12, 18, 24, 36];

type LoanDetailsDraft = {
  loan_tenure_months: string;
  down_payment: string;
  monthly_emi_amount: string;
  first_emi_date: string;
  emi_day_of_month: string;
};

export function LoanDetailsFields({
  values,
  onChange,
}: {
  values: LoanDetailsDraft;
  onChange: (updates: Partial<LoanDetailsDraft>) => void;
}) {
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualMonths, setManualMonths] = useState(12);

  const selectedTenure = Number.parseInt(values.loan_tenure_months || "0", 10);
  const hasManualTenure = selectedTenure > 0 && !TENURE_OPTIONS.includes(selectedTenure);

  function handleFirstEmiDateChange(date: string) {
    const updates: Partial<LoanDetailsDraft> = { first_emi_date: date };
    // Auto-fill EMI day from the date
    if (date) {
      const day = new Date(date).getDate();
      if (day >= 1 && day <= 28) {
        updates.emi_day_of_month = String(day);
      }
    }
    onChange(updates);
  }

  function openManualDialog() {
    setManualMonths(selectedTenure > 0 ? selectedTenure : 12);
    setManualDialogOpen(true);
  }

  function updateManualMonths(nextValue: number) {
    setManualMonths(Math.min(360, Math.max(1, nextValue)));
  }

  function saveManualMonths() {
    onChange({ loan_tenure_months: String(manualMonths) });
    setManualDialogOpen(false);
  }

  return (
    <>
      <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">EMI Details</p>
        </div>
        <div className="bg-white p-4 space-y-4">
          {/* Tenure pills */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-2">Loan Tenure</label>
            <div className="flex flex-wrap gap-1.5">
              {TENURE_OPTIONS.map((months) => {
                const active = values.loan_tenure_months === String(months);
                return (
                  <button
                    key={months}
                    type="button"
                    onClick={() => onChange({ loan_tenure_months: String(months) })}
                    className={[
                      "rounded-full px-3.5 py-2 text-xs font-bold transition-all",
                      active
                        ? "bg-stone-900 text-white shadow-sm"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                    ].join(" ")}
                  >
                    {months} mo
                  </button>
                );
              })}
              <button
                type="button"
                onClick={openManualDialog}
                className={[
                  "rounded-full px-3.5 py-2 text-xs font-bold transition-all",
                  hasManualTenure
                    ? "bg-stone-900 text-white shadow-sm"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                ].join(" ")}
              >
                {hasManualTenure ? `${selectedTenure} mo` : "Manual"}
              </button>
            </div>
          </div>

          {/* Down payment */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1.5">Down Payment (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={values.down_payment}
              onChange={(e) => onChange({ down_payment: e.target.value })}
              placeholder="0"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm font-medium text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
            />
          </div>

          {/* Monthly EMI */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1.5">Monthly EMI (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.monthly_emi_amount}
              onChange={(e) => onChange({ monthly_emi_amount: e.target.value })}
              placeholder="Enter monthly EMI amount"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm font-medium text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
            />
          </div>

          {/* First EMI date */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1.5">First EMI Date</label>
            <input
              type="date"
              value={values.first_emi_date}
              onChange={(e) => handleFirstEmiDateChange(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm font-medium text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
            />
          </div>

          {/* EMI day of month */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1.5">EMI Day of Month (1–28)</label>
            <input
              type="number"
              min="1"
              max="28"
              value={values.emi_day_of_month}
              onChange={(e) => onChange({ emi_day_of_month: e.target.value })}
              placeholder="e.g. 5"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm font-medium text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
            />
            <p className="mt-1 text-[11px] text-stone-400 font-medium">Auto-fills from First EMI Date. Customer pays on this day every month.</p>
          </div>
        </div>
      </div>

      {manualDialogOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[340px] overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.25)]">
            <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-5 py-4">
              <div>
                <h4 className="text-sm font-black text-stone-900">Manual Tenure</h4>
                <p className="mt-0.5 text-xs font-medium text-stone-500">Set loan months manually.</p>
              </div>
              <button
                type="button"
                onClick={() => setManualDialogOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200/70 text-stone-500 transition hover:bg-stone-300 hover:text-stone-900"
                aria-label="Close manual tenure"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-6">
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => updateManualMonths(manualMonths - 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-700 transition hover:bg-stone-200 disabled:opacity-40"
                  disabled={manualMonths <= 1}
                  aria-label="Decrease tenure"
                >
                  <Minus className="h-5 w-5" />
                </button>

                <div className="w-28 text-center">
                  <input
                    type="number"
                    min="1"
                    max="360"
                    value={manualMonths}
                    onChange={(e) => updateManualMonths(Number.parseInt(e.target.value || "1", 10))}
                    className="h-14 w-full rounded-2xl border border-stone-200 bg-stone-50 text-center text-2xl font-black text-stone-950 outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
                  />
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-stone-400">Months</p>
                </div>

                <button
                  type="button"
                  onClick={() => updateManualMonths(manualMonths + 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-700 transition hover:bg-stone-200 disabled:opacity-40"
                  disabled={manualMonths >= 360}
                  aria-label="Increase tenure"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-stone-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setManualDialogOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveManualMonths}
                className="rounded-xl bg-stone-900 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-stone-800"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
