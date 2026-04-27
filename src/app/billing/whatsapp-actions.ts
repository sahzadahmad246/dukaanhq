"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResponse } from "@/app/inventory/actions";
import { sendInvoiceWhatsappMessage } from "@/lib/whatsapp/twilio";

const InvoiceWhatsappPayloadSchema = z.object({
  customer_mobile: z.string().min(1, "Customer mobile number is required."),
  customer_name: z.string().optional().nullable(),
  invoice_number: z.string().min(1, "Invoice number is required."),
  shop_name: z.string().min(1, "Shop name is required."),
  pdf_url: z.string().url("Invoice PDF URL is required."),
});

export async function sendInvoiceWhatsappAction(
  payload: z.infer<typeof InvoiceWhatsappPayloadSchema>
): Promise<ActionResponse<{ sid: string; status: string; to: string }>> {
  const parsed = InvoiceWhatsappPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid WhatsApp payload.",
    };
  }

  try {
    const result = await sendInvoiceWhatsappMessage({
      to: parsed.data.customer_mobile,
      customerName: parsed.data.customer_name || "Customer",
      invoiceNumber: parsed.data.invoice_number,
      shopName: parsed.data.shop_name,
      pdfUrl: parsed.data.pdf_url,
    });

    revalidatePath("/billing");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Invoice sent to customer on WhatsApp.",
      data: result,
    };
  } catch (error) {
    console.error("[WhatsApp] Failed to send invoice:", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to send WhatsApp invoice.",
    };
  }
}
