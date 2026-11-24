export const INVOICE_FOOTER_MAX_LINES = 7;
export const INVOICE_FOOTER_LINE_MAX_LENGTH = 140;

export function normalizeInvoiceFooter(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, INVOICE_FOOTER_MAX_LINES)
    .join("\n");
}

export function isValidInvoiceFooter(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length <= INVOICE_FOOTER_MAX_LINES && lines.every((line) => line.length <= INVOICE_FOOTER_LINE_MAX_LENGTH);
}
