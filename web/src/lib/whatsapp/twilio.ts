import "server-only";

import twilio from "twilio";

export type SendInvoiceWhatsappInput = {
  to: string;
  customerName: string;
  invoiceNumber: string;
  shopName: string;
  pdfUrl: string;
};

export type SendInvoiceWhatsappResult = {
  sid: string;
  status: string;
  to: string;
};

export type SendEmiReminderWhatsappInput = {
  to: string;
  customerName: string;
  emiAmount: string;
  productName: string;
  shopName: string;
  dueDate: string;
  invoiceNumber: string;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is missing.`);
  }
  return value;
}

export function normalizeWhatsappNumber(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  const withoutScheme = raw.replace(/^whatsapp:/i, "").trim();
  const hasPlus = withoutScheme.startsWith("+");
  let digits = withoutScheme.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!hasPlus && digits.length === 10) {
    digits = `91${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return `whatsapp:+${digits}`;
}

export async function sendInvoiceWhatsappMessage(input: SendInvoiceWhatsappInput): Promise<SendInvoiceWhatsappResult> {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const contentSid = requireEnv("TWILIO_WHATSAPP_INVOICE_TEMPLATE_SID");
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  const to = normalizeWhatsappNumber(input.to);

  if (!to) {
    throw new Error("Customer WhatsApp number is not valid.");
  }

  if (!messagingServiceSid && !from) {
    throw new Error("Set TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID.");
  }

  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    ...(messagingServiceSid ? { messagingServiceSid } : { from }),
    to,
    contentSid,
    contentVariables: JSON.stringify({
      "1": input.customerName || "Customer",
      "2": input.invoiceNumber,
      "3": input.shopName,
      "4": input.pdfUrl,
    }),
  });

  return {
    sid: message.sid,
    status: message.status,
    to,
  };
}

export async function sendEmiReminderWhatsappMessage(input: SendEmiReminderWhatsappInput): Promise<SendInvoiceWhatsappResult> {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const contentSid = requireEnv("TWILIO_WHATSAPP_EMI_TEMPLATE_SID");
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  const to = normalizeWhatsappNumber(input.to);

  if (!to) {
    throw new Error("Customer WhatsApp number is not valid.");
  }

  if (!messagingServiceSid && !from) {
    throw new Error("Set TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID.");
  }

  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    ...(messagingServiceSid ? { messagingServiceSid } : { from }),
    to,
    contentSid,
    contentVariables: JSON.stringify({
      "1": input.customerName || "Customer",
      "2": input.emiAmount,
      "3": input.productName,
      "4": input.shopName,
      "5": input.dueDate,
      "6": input.invoiceNumber,
    }),
  });

  return {
    sid: message.sid,
    status: message.status,
    to,
  };
}
