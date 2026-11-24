"use client";

import { buildInvoicePdfBytes, type PrintableInvoice } from "./invoice-print";
import { uploadInvoicePdfAction } from "../signature-actions";
import { sendInvoiceWhatsappAction } from "../whatsapp-actions";

type SendableInvoice = PrintableInvoice & {
  id: string;
  customer_mobile?: string | null;
};

type SendInvoiceWhatsappOptions = {
  invoice: SendableInvoice;
  shopLogoUrl?: string | null;
  shopPostalCode?: string | null;
  shopStampUrl?: string | null;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function sendInvoiceWhatsappWithFreshPdf({
  invoice,
  shopLogoUrl,
  shopPostalCode,
  shopStampUrl,
}: SendInvoiceWhatsappOptions) {
  if (!invoice.customer_mobile?.trim()) {
    throw new Error("Customer mobile number is missing.");
  }

  const invoiceData: SendableInvoice = {
    ...invoice,
    shop_logo_url: shopLogoUrl ?? null,
    shop_postal_code: shopPostalCode ?? null,
    shop_stamp_url: shopStampUrl ?? null,
    customer_signature_url: invoice.customer_signature_url ?? null,
  };

  const { bytes } = await buildInvoicePdfBytes(invoiceData);
  const uploadedPdf = await uploadInvoicePdfAction(bytesToBase64(bytes), invoice.id);

  if (!uploadedPdf?.url) {
    throw new Error("Failed to upload invoice PDF.");
  }

  return sendInvoiceWhatsappAction({
    customer_mobile: invoice.customer_mobile,
    customer_name: invoice.customer_name,
    invoice_number: invoice.invoice_number,
    shop_name: invoice.shop_name_snapshot,
    pdf_url: uploadedPdf.url,
  });
}
