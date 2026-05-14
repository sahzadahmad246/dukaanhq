import { NextResponse } from "next/server";

import {
  buildInvoiceProductSummary,
  formatEmiAmount,
  formatReminderDueDate,
  getIstToday,
  getMatchingEmiReminder,
  type LoanPaymentDetails,
} from "@/lib/billing/emi-reminders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkPlanEntitlement } from "@/lib/subscription/plan-limits";
import { sendEmiReminderWhatsappMessage } from "@/lib/whatsapp/twilio";

export const runtime = "nodejs";

type LoanInvoiceRow = {
  id: string;
  shop_id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_mobile: string | null;
  payment_details: LoanPaymentDetails | null;
  shop_name_snapshot: string | null;
  invoice_items?: Array<{
    product_name_snapshot?: string | null;
  }> | null;
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function handleEmiReminders(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "supabase_admin_not_configured" }, { status: 500 });
  }

  const today = getIstToday();
  const { data, error } = await admin
    .from("invoices")
    .select(`
      id,
      shop_id,
      invoice_number,
      customer_name,
      customer_mobile,
      payment_details,
      shop_name_snapshot,
      invoice_items (
        product_name_snapshot
      )
    `)
    .contains("payment_details", { methods: ["LOAN"] });

  if (error) {
    console.error("[EMI Reminders] Failed to load invoices:", error);
    return NextResponse.json({ error: "invoice_query_failed", message: error.message }, { status: 500 });
  }

  const invoices = (data ?? []) as LoanInvoiceRow[];
  const summary = {
    checked: invoices.length,
    eligible: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    today,
    results: [] as Array<{
      invoiceId: string;
      dueDate?: string;
      reminderType?: string;
      status: "sent" | "skipped" | "failed";
      message: string;
    }>,
  };

  for (const invoice of invoices) {
    const match = getMatchingEmiReminder(invoice.payment_details, today);
    if (!match) {
      summary.skipped += 1;
      continue;
    }

    summary.eligible += 1;

    const access = await checkPlanEntitlement(
      admin,
      invoice.shop_id,
      "auto_emi_reminders",
      "Auto EMI reminders",
    );
    if (!access.ok) {
      summary.skipped += 1;
      summary.results.push({
        invoiceId: invoice.id,
        dueDate: match.dueDate,
        reminderType: match.reminderType,
        status: "skipped",
        message: access.message,
      });
      continue;
    }

    if (!invoice.customer_mobile?.trim()) {
      summary.failed += 1;
      summary.results.push({
        invoiceId: invoice.id,
        dueDate: match.dueDate,
        reminderType: match.reminderType,
        status: "failed",
        message: "Customer mobile missing.",
      });
      continue;
    }

    const { data: existingReminder, error: existingError } = await admin
      .from("emi_reminders")
      .select("id")
      .eq("invoice_id", invoice.id)
      .eq("due_date", match.dueDate)
      .eq("reminder_type", match.reminderType)
      .maybeSingle();

    if (existingError) {
      summary.failed += 1;
      summary.results.push({
        invoiceId: invoice.id,
        dueDate: match.dueDate,
        reminderType: match.reminderType,
        status: "failed",
        message: existingError.message,
      });
      continue;
    }

    if (existingReminder) {
      summary.skipped += 1;
      summary.results.push({
        invoiceId: invoice.id,
        dueDate: match.dueDate,
        reminderType: match.reminderType,
        status: "skipped",
        message: "Reminder already sent.",
      });
      continue;
    }

    try {
      const twilioResult = await sendEmiReminderWhatsappMessage({
        to: invoice.customer_mobile,
        customerName: invoice.customer_name || "Customer",
        emiAmount: formatEmiAmount(invoice.payment_details?.monthly_emi_amount ?? 0),
        productName: buildInvoiceProductSummary(invoice.invoice_items),
        shopName: invoice.shop_name_snapshot || "Shop",
        dueDate: formatReminderDueDate(match.dueDate),
        invoiceNumber: invoice.invoice_number,
      });

      const { error: insertError } = await admin.from("emi_reminders").insert({
        invoice_id: invoice.id,
        due_date: match.dueDate,
        reminder_type: match.reminderType,
        customer_mobile: invoice.customer_mobile,
        twilio_message_sid: twilioResult.sid,
        twilio_status: twilioResult.status,
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      summary.sent += 1;
      summary.results.push({
        invoiceId: invoice.id,
        dueDate: match.dueDate,
        reminderType: match.reminderType,
        status: "sent",
        message: twilioResult.sid,
      });
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        invoiceId: invoice.id,
        dueDate: match.dueDate,
        reminderType: match.reminderType,
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  return handleEmiReminders(request);
}

export async function POST(request: Request) {
  return handleEmiReminders(request);
}
