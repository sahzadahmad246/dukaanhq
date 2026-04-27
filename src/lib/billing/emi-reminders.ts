export type EmiReminderType = "before_due" | "due_today";

export type LoanPaymentDetails = {
  methods?: string[] | null;
  loan_tenure_months?: number | null;
  monthly_emi_amount?: number | null;
  first_emi_date?: string | null;
  emi_day_of_month?: number | null;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getIstToday(now = new Date()) {
  return formatDateOnly(new Date(now.getTime() + IST_OFFSET_MS));
}

export function addDays(dateOnly: string, days: number) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateOnly(date);
}

export function addMonthsForEmi(firstEmiDate: string, monthOffset: number, emiDayOfMonth?: number | null) {
  const datePart = firstEmiDate.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;

  const base = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const dueDay = Math.min(Math.max(emiDayOfMonth || day, 1), 28);
  return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(dueDay)}`;
}

export function getDueReminderType(dueDate: string, today: string): EmiReminderType | null {
  if (dueDate === today) return "due_today";
  if (dueDate === addDays(today, 1)) return "before_due";
  return null;
}

export function getMatchingEmiReminder(
  details: LoanPaymentDetails | null | undefined,
  today = getIstToday()
): { dueDate: string; reminderType: EmiReminderType } | null {
  if (!details?.methods?.includes("LOAN")) return null;
  if (!details.first_emi_date || !details.loan_tenure_months || !details.monthly_emi_amount) return null;

  const tenure = Math.max(0, Math.floor(Number(details.loan_tenure_months)));
  for (let offset = 0; offset < tenure; offset += 1) {
    const dueDate = addMonthsForEmi(details.first_emi_date, offset, details.emi_day_of_month);
    if (!dueDate) continue;

    const reminderType = getDueReminderType(dueDate, today);
    if (reminderType) {
      return { dueDate, reminderType };
    }
  }

  return null;
}

export function formatEmiAmount(value: number) {
  return Number(value || 0).toFixed(0);
}

export function formatReminderDueDate(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return dateOnly;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function buildInvoiceProductSummary(items?: Array<{ product_name_snapshot?: string | null }> | null) {
  const names = (items ?? [])
    .map((item) => item.product_name_snapshot?.trim())
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return "your purchase";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1} more`;
}
