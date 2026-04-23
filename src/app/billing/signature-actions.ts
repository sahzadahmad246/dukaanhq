"use server";

import { uploadImageToCloudinary, uploadRawFileToCloudinary } from "@/lib/cloudinary";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Upload a customer signature (base64 PNG data URL) to Cloudinary.
 * Returns the Cloudinary URL.
 */
export async function uploadCustomerSignatureAction(
  base64DataUrl: string
): Promise<{ url: string } | null> {
  try {
    // Convert base64 data URL to File
    const base64Data = base64DataUrl.split(",")[1];
    if (!base64Data) return null;

    const buffer = Buffer.from(base64Data, "base64");
    const file = new File([buffer], "customer-signature.png", { type: "image/png" });

    const result = await uploadImageToCloudinary(file);
    return result ? { url: result.url } : null;
  } catch (error) {
    console.error("Failed to upload customer signature:", error);
    return null;
  }
}

/**
 * Upload a generated invoice PDF (as base64) to Cloudinary for auto-send.
 * Returns the Cloudinary URL.
 */
export async function uploadInvoicePdfAction(
  base64Data: string,
  invoiceId: string
): Promise<{ url: string } | null> {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const file = new File([buffer], `invoice-${invoiceId}.pdf`, { type: "application/pdf" });

    const result = await uploadRawFileToCloudinary(file, { folder: "dukaanhq_invoices" });
    if (!result) return null;

    // Store the PDF URL in the invoice record
    const supabase = await createSupabaseServerClient();
    await supabase
      .from("invoices")
      .update({ invoice_pdf_url: result.url })
      .eq("id", invoiceId);

    return { url: result.url };
  } catch (error) {
    console.error("Failed to upload invoice PDF:", error);
    return null;
  }
}

/**
 * Update the customer_signature_url on an existing invoice.
 */
export async function updateInvoiceSignatureAction(
  invoiceId: string,
  signatureUrl: string
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("invoices")
      .update({ customer_signature_url: signatureUrl })
      .eq("id", invoiceId);

    return !error;
  } catch {
    return false;
  }
}
