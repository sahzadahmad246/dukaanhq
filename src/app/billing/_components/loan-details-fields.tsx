"use client";

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

  return (
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
  );
}
