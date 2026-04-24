"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PrintableInvoice = {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_mobile?: string | null;
  billing_address?: string | null;
  customer_gst_number?: string | null;
  shop_name_snapshot: string;
  shop_address_snapshot?: string | null;
  shop_phone_snapshot?: string | null;
  shop_gst_snapshot?: string | null;
  invoice_footer_snapshot?: string | null;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  grand_total: number;
  payment_method?: string | null;
  payment_details?: {
    methods?: string[];
    loan_provider?: string | null;
    loan_number?: string | null;
    loan_tenure_months?: number | null;
    down_payment?: number | null;
    monthly_emi_amount?: number | null;
    first_emi_date?: string | null;
    emi_day_of_month?: number | null;
  } | null;
  payment_status?: string | null;
  notes?: string | null;
  shop_logo_url?: string | null;
  shop_postal_code?: string | null;
  shop_stamp_url?: string | null;
  customer_signature_url?: string | null;
  send_ready_pdf_url?: string | null;
  invoice_items?: Array<{
    product_id?: string | null;
    product_name_snapshot: string;
    brand_name_snapshot?: string | null;
    category_name_snapshot?: string | null;
    variant_name_snapshot?: string | null;
    identifier_snapshot?: string | null;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    line_total: number;
  }>;
};

/** Strip characters that WinAnsi (Helvetica) can't encode (allowing newlines and tabs) */
function sanitizeForPdf(text: string): string {
  // biome-ignore lint: simple regex replace
  return text
    // Replace non-WinAnsi characters, but keep \n (0x0A), \r (0x0D), and \t (0x09)
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "")
    // Normalize spaces and tabs without destroying newlines
  .replace(/[ \t]+/g, " ")
  .trim() || "-";
}

function getOrdinalSuffix(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatMoney(value: number) {
  return `${Number(value || 0).toFixed(2)}`;
}

function numberToWordsINR(amount: number) {
  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (amount === 0) return "Zero Only";

  function convert(num: number): string {
    if (num < 20) return units[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " " + units[num % 10] : "");
    if (num < 1000) return units[Math.floor(num / 100)] + " Hundred" + (num % 100 !== 0 ? " " + convert(num % 100) : "");
    if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 !== 0 ? " " + convert(num % 1000) : "");
    if (num < 10000000) return convert(Math.floor(num / 100000)) + " Lakh" + (num % 100000 !== 0 ? " " + convert(num % 100000) : "");
    return convert(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 !== 0 ? " " + convert(num % 10000000) : "");
  }

  return convert(Math.floor(amount)) + " Only";
}

const INVOICE_LAYOUT = {
  pdfPageWidth: 595.28,
  pdfPageHeight: 841.89,
  pdfMarginX: 32,
  pdfMarginTop: 28,
  pdfMarginBottom: 28,
  background: "#ffffff",
  border: "#000000",
  mutedBorder: "#000000",
  heading: "#000000",
  subtext: "#000000",
  muted: "#000000",
  tableHead: "#000000",
  summaryBg: "#fbfcfe",
  logoSize: 84,
  headerGap: 16,
  printPageWidth: 820,
  printPaddingX: 46,
  printPaddingTop: 34,
  printPaddingBottom: 36,
  summaryWidth: 320,
};

function buildPaymentSummary(paymentMethod?: string | null, paymentDetails?: PrintableInvoice["payment_details"]) {
  const methods = paymentDetails?.methods?.filter(Boolean) ?? [];
  const methodLabel = methods.length > 0 ? methods.join(", ") : paymentMethod || "CASH";
  const loanMeta = [
    paymentDetails?.loan_provider ? `Provider: ${paymentDetails.loan_provider}` : null,
    paymentDetails?.loan_number ? `Loan No: ${paymentDetails.loan_number}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return loanMeta ? `${methodLabel} (${loanMeta})` : methodLabel;
}

function resolvePrintableAssetUrl(value?: string | null) {
  if (!value) return null;

  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadExternalPdf(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const blob = await response.blob();
    downloadBlob(blob, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  } catch (err) {
    console.error("[Download] External PDF fetch failed:", err);
    // Fallback if fetch fails (e.g. CORS)
    window.open(url, "_blank");
  }
}

function sanitizeFilenamePart(value?: string | null) {
  return (value ?? "customer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "customer";
}

async function embedLogo(pdf: PDFDocument, logoUrl?: string | null) {
  return embedAsset(pdf, logoUrl);
}

async function embedAsset(pdf: PDFDocument, assetUrl?: string | null) {
  const resolvedAssetUrl = resolvePrintableAssetUrl(assetUrl);
  if (!resolvedAssetUrl) return null;

  try {
    const response = await fetch(resolvedAssetUrl);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("png")) return await pdf.embedPng(bytes);
    if (contentType.includes("jpg") || contentType.includes("jpeg")) return await pdf.embedJpg(bytes);

    try {
      return await pdf.embedPng(bytes);
    } catch {
      return await pdf.embedJpg(bytes);
    }
  } catch {
    return null;
  }
}

function wrapText(text: string, maxWidth: number, font: PDFFontLike, fontSize: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function wrapTextWithLineBreaks(text: string, maxWidth: number, font: PDFFontLike, fontSize: number) {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    lines.push(...wrapText(paragraph, maxWidth, font, fontSize));
  }

  return lines.length > 0 ? lines : [""];
}

type PDFFontLike = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

function colorFromHex(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized;

  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;

  return rgb(red, green, blue);
}

type InvoiceDocData = {
  logoUrl: string | null;
  filename: string;
  shopAddress: string;
  shopMeta: string[];
  infoRows: Array<{ label: string; value: string; full?: boolean; align?: "left" | "right" }>;
  items: Array<{
    index: number;
    name: string;
    meta: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    originalUnitPrice?: string | null;
    originalLineTotal?: string | null;
    isFreeGift?: boolean;
  }>;
  summaryRows: Array<{ label: string; value: string; total?: boolean }>;
  footerText: string;
  formattedDate: string;
  paymentSummary: string;
  amountInWords: string;
  notes: string | null;
  emiDayOfMonth: number | null;
  firstEmiDate: string | null;
};

function appendPostalCodeToAddress(address?: string | null, postalCode?: string | null) {
  const normalizedAddress = sanitizeForPdf(address ?? "");
  const normalizedPostalCode = sanitizeForPdf(postalCode ?? "");

  if (!normalizedPostalCode || normalizedPostalCode === "-") {
    return normalizedAddress || "-";
  }

  if (!normalizedAddress || normalizedAddress === "-") {
    return normalizedPostalCode;
  }

  if (normalizedAddress.includes(normalizedPostalCode)) {
    return normalizedAddress;
  }

  const parts = normalizedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return normalizedPostalCode;
  }

  parts[parts.length - 1] = `${parts[parts.length - 1]} - ${normalizedPostalCode}`;
  return parts.join(", ");
}

function isFreeQuickInvoiceItem(item: NonNullable<PrintableInvoice["invoice_items"]>[number]) {
  const subtotal = Number(item.quantity ?? 0) * Number(item.unit_price ?? 0);
  return !item.product_id && Number(item.line_total ?? 0) === 0 && Number(item.unit_price ?? 0) > 0 && Number(item.discount_amount ?? 0) >= subtotal;
}

function buildInvoiceDocData(invoice: PrintableInvoice): InvoiceDocData {
  const paymentSummary = sanitizeForPdf(buildPaymentSummary(invoice.payment_method, invoice.payment_details));
  const shopAddress = appendPostalCodeToAddress(invoice.shop_address_snapshot, invoice.shop_postal_code);
  
  const dateObj = new Date(invoice.invoice_date);
  const formattedDate = `${dateObj.toLocaleDateString("en-GB")} ${dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  
  const shopMeta = [invoice.shop_gst_snapshot ? `GST: ${sanitizeForPdf(invoice.shop_gst_snapshot)}` : null, invoice.shop_phone_snapshot ? sanitizeForPdf(invoice.shop_phone_snapshot) : null]
    .filter(Boolean) as string[];

  const infoRows: InvoiceDocData["infoRows"] = [
    { label: "Invoice No", value: sanitizeForPdf(invoice.invoice_number) },
    { label: "Date", value: formattedDate, align: "right" },
    { label: "Name", value: sanitizeForPdf(invoice.customer_name) },
    { label: "Mobile No.", value: sanitizeForPdf(invoice.customer_mobile ?? "-"), align: "right" },
  ];

  if (invoice.customer_gst_number) {
    infoRows.push({ label: "GST", value: sanitizeForPdf(invoice.customer_gst_number) });
  }

  infoRows.push({ label: "Payment", value: paymentSummary, full: true });
  if (invoice.payment_details?.methods?.includes("LOAN")) {
    const loanFields: Array<{ label: string; value: string }> = [];

    if (invoice.payment_details.loan_tenure_months) {
      loanFields.push({
        label: "Loan Tenure",
        value: `${invoice.payment_details.loan_tenure_months} months`,
      });
    }
    if (invoice.payment_details.monthly_emi_amount != null) {
      loanFields.push({
        label: "Monthly EMI",
        value: `Rs ${formatMoney(invoice.payment_details.monthly_emi_amount)}`,
      });
    }

    const currentHalfCount = infoRows.filter((r) => !r.full).length;
    loanFields.forEach((field, i) => {
      const isRight = (currentHalfCount + i) % 2 === 1;
      infoRows.push({
        label: field.label,
        value: sanitizeForPdf(field.value),
        align: isRight ? "right" : "left",
      });
    });
  }
  infoRows.push({ label: "Address", value: sanitizeForPdf(invoice.billing_address ?? "-"), full: true });

  const items = (invoice.invoice_items ?? []).map((item, index) => {
    const isFreeGift = isFreeQuickInvoiceItem(item);
    const originalLineTotal = Number(item.quantity) * Number(item.unit_price);

    return {
      index: index + 1,
      name: sanitizeForPdf(item.product_name_snapshot),
      meta: [
        isFreeGift ? "FREE ITEM" : null,
        item.variant_name_snapshot ? sanitizeForPdf(item.variant_name_snapshot) : null,
        ...(item.identifier_snapshot
          ? sanitizeForPdf(item.identifier_snapshot)
              .replace(/(?:\s*,\s*|\s*\/\s*|\s*•\s*|\s+)(imei\s*2)/i, "\n$1")
              .split("\n")
              .flatMap((s) => s.split(" / "))
              .flatMap((s) => s.split(" • "))
          : []),
      ]
        .filter(Boolean)
        .map((s) => String(s).trim())
        .filter(Boolean)
        .join("\n"),
      quantity: String(item.quantity),
      unitPrice: isFreeGift ? "0.00" : formatMoney(Number(item.unit_price) / 1.18),
      lineTotal: isFreeGift ? "0.00" : formatMoney(Number(item.line_total) / 1.18),
      originalUnitPrice: isFreeGift ? formatMoney(Number(item.unit_price) / 1.18) : null,
      originalLineTotal: isFreeGift ? formatMoney(originalLineTotal / 1.18) : null,
      isFreeGift,
    };
  });

  const taxRate = 0.18;

  // Free gift discount should NOT appear in the summary box —
  // its effect is already visible via the strikethrough on the line item.
  const freeGiftDiscount = (invoice.invoice_items ?? []).reduce((sum, item) => {
    if (isFreeQuickInvoiceItem(item)) {
      return sum + Number(item.discount_amount ?? 0);
    }
    return sum;
  }, 0);

  const displaySubtotal = Number(invoice.subtotal) - freeGiftDiscount;
  const displayDiscount = Number(invoice.discount_total || 0) - freeGiftDiscount;

  const exSubtotal = displaySubtotal / (1 + taxRate);
  const exDiscount = displayDiscount / (1 + taxRate);
  const taxableAmount = Number(invoice.grand_total) / (1 + taxRate);
  const halfTax = (Number(invoice.grand_total) - taxableAmount) / 2;

  const summaryRows = [
    { label: "Subtotal (Rs)", value: formatMoney(exSubtotal) },
    ...(displayDiscount > 0
      ? [{ label: "Discount (Rs)", value: formatMoney(exDiscount) }]
      : []),
    { label: "SGST @9% (Rs)", value: formatMoney(halfTax) },
    { label: "CGST @9% (Rs)", value: formatMoney(halfTax) },
    { label: "Grand Total (Rs)", value: formatMoney(invoice.grand_total), total: true },
  ];

  return {
    logoUrl: resolvePrintableAssetUrl(invoice.shop_logo_url),
    filename: `${sanitizeFilenamePart(invoice.customer_name)}-bill.pdf`,
    shopAddress,
    shopMeta,
    infoRows,
    items,
    summaryRows,
    footerText: sanitizeForPdf(invoice.invoice_footer_snapshot ?? "Goods once sold will not be taken back without original bill."),
    formattedDate,
    paymentSummary,
    amountInWords: numberToWordsINR(invoice.grand_total),
    notes: invoice.notes && invoice.notes.trim() ? sanitizeForPdf(invoice.notes) : null,
    emiDayOfMonth: invoice.payment_details?.emi_day_of_month ?? null,
    firstEmiDate: invoice.payment_details?.first_emi_date ?? null,
  };
}


export async function buildInvoicePdfBytes(invoice: PrintableInvoice) {
  const doc = buildInvoiceDocData(invoice);
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await embedLogo(pdf, doc.logoUrl);
  const customerSignatureImage = await embedAsset(pdf, invoice.customer_signature_url ?? null);
  const shopStampImage = await embedAsset(pdf, invoice.shop_stamp_url ?? null);

  const page = pdf.addPage([INVOICE_LAYOUT.pdfPageWidth, INVOICE_LAYOUT.pdfPageHeight]);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const outerMarginX = INVOICE_LAYOUT.pdfMarginX;
  const outerMarginTop = INVOICE_LAYOUT.pdfMarginTop;
  const outerMarginBottom = INVOICE_LAYOUT.pdfMarginBottom;
  const pageBoxWidth = pageWidth - outerMarginX * 2;
  const pageBoxHeight = pageHeight - outerMarginTop - outerMarginBottom;
  const pageBoxX = outerMarginX;
  const pageBoxY = outerMarginBottom;
  const scale = pageBoxWidth / INVOICE_LAYOUT.printPageWidth;
  const px = (value: number) => value * scale;
  const pageRight = pageBoxX + pageBoxWidth;
  const contentX = pageBoxX + px(INVOICE_LAYOUT.printPaddingX);
  const contentRight = pageRight - px(INVOICE_LAYOUT.printPaddingX);
  const contentWidth = contentRight - contentX;
  let cursorY = pageHeight - outerMarginTop - px(INVOICE_LAYOUT.printPaddingTop);

  const headingColor = colorFromHex(INVOICE_LAYOUT.heading);
  const subtextColor = colorFromHex(INVOICE_LAYOUT.subtext);
  const mutedColor = colorFromHex(INVOICE_LAYOUT.muted);
  const borderColor = colorFromHex(INVOICE_LAYOUT.border);
  const mutedBorderColor = colorFromHex(INVOICE_LAYOUT.mutedBorder);
  const tableHeadColor = colorFromHex(INVOICE_LAYOUT.tableHead);
  const summaryBgColor = colorFromHex(INVOICE_LAYOUT.summaryBg);
  const logoBgColor = rgb(0.972, 0.98, 0.988);
  const titleRuleColor = rgb(0.314, 0.38, 0.463);

  page.drawRectangle({
    x: pageBoxX,
    y: pageBoxY,
    width: pageBoxWidth,
    height: pageBoxHeight,
    color: rgb(1, 1, 1),
  });

  const logoSize = px(INVOICE_LAYOUT.logoSize);
  const logoX = contentX;
  const logoTop = cursorY;
  const logoY = logoTop - logoSize;

  page.drawRectangle({
    x: logoX,
    y: logoY,
    width: logoSize,
    height: logoSize,
    borderColor,
    borderWidth: 1,
    color: logoBgColor,
  });

  if (logoImage) {
    page.drawImage(logoImage, {
      x: logoX,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  } else {
    const initial = sanitizeForPdf((invoice.shop_name_snapshot || "D").slice(0, 1).toUpperCase()) || "D";
    const initialSize = px(26);
    page.drawText(initial, {
      x: logoX + logoSize / 2 - fontBold.widthOfTextAtSize(initial, initialSize) / 2,
      y: logoY + logoSize / 2 - initialSize / 3,
      size: initialSize,
      font: fontBold,
      color: headingColor,
    });
  }

  const copyX = logoX + logoSize + px(INVOICE_LAYOUT.headerGap);
  const shopNameSize = px(26);
  page.drawText(sanitizeForPdf(invoice.shop_name_snapshot), {
    x: copyX,
    y: cursorY - shopNameSize,
    size: shopNameSize,
    font: fontBold,
    color: headingColor,
  });

  let shopTextY = cursorY - shopNameSize - px(7);
  const shopAddressLines = wrapText(doc.shopAddress, contentWidth - logoSize - px(INVOICE_LAYOUT.headerGap), fontBold, px(16));
  for (const line of shopAddressLines.filter(Boolean)) {
    page.drawText(line, {
      x: copyX,
      y: shopTextY - px(16),
      size: px(16),
      font: fontBold,
      color: subtextColor,
    });
    shopTextY -= px(16 * 1.45);
  }

  for (const line of doc.shopMeta) {
    const wrapped = wrapText(line, contentWidth - logoSize - px(INVOICE_LAYOUT.headerGap), fontBold, px(15));
    for (const row of wrapped) {
      page.drawText(row, {
        x: copyX,
        y: shopTextY - px(15),
        size: px(15),
        font: fontBold,
        color: subtextColor,
      });
      shopTextY -= px(15 * 1.5);
    }
  }

  cursorY = Math.min(logoY, shopTextY) - px(30);

  const title = "INVOICE";
  const titleSize = px(24);
  page.drawText(title, {
    x: pageBoxX + pageBoxWidth / 2 - fontBold.widthOfTextAtSize(title, titleSize) / 2,
    y: cursorY - titleSize,
    size: titleSize,
    font: fontBold,
    color: headingColor,
  });

  cursorY -= titleSize + px(12);

  page.drawLine({
    start: { x: contentX, y: cursorY },
    end: { x: contentRight, y: cursorY },
    thickness: 1.2,
    color: titleRuleColor,
  });

  cursorY -= px(10);
  const subtitle = "Composition dealer not eligible to collect tax separately";
  const subtitleSize = px(15);
  page.drawText(subtitle, {
    x: pageBoxX + pageBoxWidth / 2 - fontBold.widthOfTextAtSize(subtitle, subtitleSize) / 2,
    y: cursorY - subtitleSize,
    size: subtitleSize,
    font: fontBold,
    color: subtextColor,
  });

  cursorY -= subtitleSize + px(16);
  page.drawLine({
    start: { x: contentX, y: cursorY },
    end: { x: contentRight, y: cursorY },
    thickness: 1.2,
    color: titleRuleColor,
  });

  cursorY -= px(16);
  const infoGapX = px(36);
  const infoColWidth = (contentWidth - infoGapX) / 2;
  const labelWidth = px(110);
  const labelGap = px(10);
  const infoFontSize = px(16);
  const infoLineHeight = px(16 * 1.35);
  const infoVerticalGap = px(8);
  const infoRows = doc.infoRows;
  const halfRows = infoRows.filter((row) => !row.full);
  const fullRows = infoRows.filter((row) => row.full);
  let infoLeftY = cursorY;
  let infoRightY = cursorY;

  for (let index = 0; index < halfRows.length; index += 1) {
    const row = halfRows[index];
    const columnX = index % 2 === 0 ? contentX : contentX + infoColWidth + infoGapX;
    const lineX = columnX + labelWidth + labelGap;
    const columnRight = columnX + infoColWidth;
    const isRightAligned = row.align === "right";
    const rowY = index % 2 === 0 ? infoLeftY : infoRightY;
    const labelText = `${row.label}:`;
    let rowHeight = infoLineHeight;

    if (isRightAligned) {
      const inlineGap = px(12);
      const labelTextWidth = fontBold.widthOfTextAtSize(labelText, infoFontSize);
      const valueMaxWidth = Math.max(infoColWidth - labelTextWidth - inlineGap, px(88));
      const wrappedValue = wrapText(row.value, valueMaxWidth, fontBold, infoFontSize);
      const widestValueWidth = wrappedValue.reduce(
        (max, line) => Math.max(max, fontBold.widthOfTextAtSize(line, infoFontSize)),
        0,
      );
      const blockWidth = labelTextWidth + inlineGap + widestValueWidth;
      const labelX = Math.max(columnX, columnRight - blockWidth);
      const valueX = columnRight - widestValueWidth;

      page.drawText(labelText, {
        x: labelX,
        y: rowY - infoFontSize,
        size: infoFontSize,
        font: fontBold,
        color: headingColor,
      });

      for (const [lineIndex, line] of wrappedValue.entries()) {
        page.drawText(line, {
          x: valueX + widestValueWidth - fontBold.widthOfTextAtSize(line, infoFontSize),
          y: rowY - infoFontSize - lineIndex * infoLineHeight,
          size: infoFontSize,
          font: fontBold,
          color: headingColor,
        });
      }

      rowHeight = Math.max(1, wrappedValue.length) * infoLineHeight;
    } else {
      const wrapped = wrapText(row.value, infoColWidth - labelWidth - labelGap, fontBold, infoFontSize);
      rowHeight = Math.max(1, wrapped.length) * infoLineHeight;

      page.drawText(labelText, {
        x: columnX,
        y: rowY - infoFontSize,
        size: infoFontSize,
        font: fontBold,
        color: headingColor,
      });

      for (const [lineIndex, line] of wrapped.entries()) {
        page.drawText(line, {
          x: lineX,
          y: rowY - infoFontSize - lineIndex * infoLineHeight,
          size: infoFontSize,
          font: fontBold,
          color: headingColor,
        });
      }
    }

    if (index % 2 === 0) {
      infoLeftY -= rowHeight + infoVerticalGap;
    } else {
      infoRightY -= rowHeight + infoVerticalGap;
    }
  }

  cursorY = Math.min(infoLeftY, infoRightY);

  for (const row of fullRows) {
    if (row.label === "Address") cursorY -= px(2);
    const wrapped = wrapText(row.value, contentWidth - labelWidth - labelGap, fontBold, infoFontSize);
    const rowHeight = Math.max(1, wrapped.length) * infoLineHeight;

    page.drawText(`${row.label}:`, {
      x: contentX,
      y: cursorY - infoFontSize,
      size: infoFontSize,
      font: fontBold,
      color: headingColor,
    });

    for (const [lineIndex, line] of wrapped.entries()) {
      page.drawText(line, {
        x: contentX + labelWidth + labelGap,
        y: cursorY - infoFontSize - lineIndex * infoLineHeight,
        size: infoFontSize,
        font: fontBold,
        color: headingColor,
      });
    }

    cursorY -= rowHeight + infoVerticalGap;
  }

  const tableTop = cursorY - px(14);
  const headerHeight = px(34);
  const cellPaddingX = px(14);
  const qtyWidth = px(72);
  const rateWidth = px(106);
  const amountWidth = px(116);
  const srWidth = px(38);
  const itemWidth = contentWidth - srWidth - qtyWidth - rateWidth - amountWidth;
  const tableX = contentX;
  const tableWidth = contentWidth;
  let tableY = tableTop;

  page.drawRectangle({
    x: tableX,
    y: tableY - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: summaryBgColor,
    borderColor: mutedBorderColor,
    borderWidth: 0.5,
  });

  const headerFontSize = px(15);
  const headerY = tableY - headerHeight / 2 - headerFontSize / 3;
  page.drawText("#", { x: tableX + cellPaddingX, y: headerY, size: headerFontSize, font: fontBold, color: tableHeadColor });
  page.drawText("PARTICULARS", { x: tableX + srWidth + cellPaddingX, y: headerY, size: headerFontSize, font: fontBold, color: tableHeadColor });
  page.drawText("QTY", {
    x: tableX + srWidth + itemWidth + qtyWidth - cellPaddingX - fontBold.widthOfTextAtSize("QTY", headerFontSize),
    y: headerY,
    size: headerFontSize,
    font: fontBold,
    color: tableHeadColor,
  });
  page.drawText("RATE (RS)", {
    x: tableX + srWidth + itemWidth + qtyWidth + rateWidth - cellPaddingX - fontBold.widthOfTextAtSize("RATE (RS)", headerFontSize),
    y: headerY,
    size: headerFontSize,
    font: fontBold,
    color: tableHeadColor,
  });
  page.drawText("AMOUNT (RS)", {
    x: tableX + tableWidth - cellPaddingX - fontBold.widthOfTextAtSize("AMOUNT (RS)", headerFontSize),
    y: headerY,
    size: headerFontSize,
    font: fontBold,
    color: tableHeadColor,
  });

  tableY -= headerHeight;

  for (const item of doc.items) {
    const nameLines = wrapText(item.name, itemWidth - cellPaddingX * 2, fontBold, px(16));
    const metaLines = item.meta ? wrapTextWithLineBreaks(item.meta, itemWidth - cellPaddingX * 2, fontBold, px(14)) : [];
    const rowHeight = Math.max(px(42), px(17) * 2 + nameLines.length * px(16 * 1.4) + metaLines.length * px(14 * 1.4));

    page.drawRectangle({
      x: tableX,
      y: tableY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      borderColor: mutedBorderColor,
      borderWidth: 0.5,
      color: rgb(1, 1, 1),
    });

    const baselineY = tableY - px(17) - px(16);
    page.drawText(String(item.index), {
      x: tableX + cellPaddingX,
      y: baselineY,
      size: px(16),
      font: fontBold,
      color: mutedColor,
    });

    let itemTextY = baselineY;
    for (const line of nameLines) {
      page.drawText(line, {
        x: tableX + srWidth + cellPaddingX,
        y: itemTextY,
        size: px(16),
        font: fontBold,
        color: headingColor,
      });
      itemTextY -= px(16 * 1.4);
    }

    for (const line of metaLines) {
      page.drawText(line, {
        x: tableX + srWidth + cellPaddingX,
        y: itemTextY,
        size: px(14),
        font: fontBold,
        color: mutedColor,
      });
      itemTextY -= px(14 * 1.4);
    }

    const qtySize = px(16);
    const unitSize = px(16);
    const amountSize = px(16);
    page.drawText(item.quantity, {
      x: tableX + srWidth + itemWidth + qtyWidth - cellPaddingX - fontBold.widthOfTextAtSize(item.quantity, qtySize),
      y: baselineY,
      size: qtySize,
      font: fontBold,
      color: headingColor,
    });
    const rateRightX = tableX + srWidth + itemWidth + qtyWidth + rateWidth - cellPaddingX;
    const amountRightX = tableX + tableWidth - cellPaddingX;

    if (item.isFreeGift && item.originalUnitPrice && item.originalLineTotal) {
      const strikeSize = px(13);
      const freeSize = px(15);
      const originalRateWidth = fontBold.widthOfTextAtSize(item.originalUnitPrice, strikeSize);
      const originalAmountWidth = fontBold.widthOfTextAtSize(item.originalLineTotal, strikeSize);
      const freeRateWidth = fontBold.widthOfTextAtSize(item.unitPrice, freeSize);
      const freeAmountWidth = fontBold.widthOfTextAtSize(item.lineTotal, freeSize);
      const strikeRateX = rateRightX - originalRateWidth;
      const strikeAmountX = amountRightX - originalAmountWidth;

      page.drawText(item.originalUnitPrice, {
        x: strikeRateX,
        y: baselineY + px(10),
        size: strikeSize,
        font: fontBold,
        color: mutedColor,
      });
      page.drawLine({
        start: { x: strikeRateX, y: baselineY + px(16) },
        end: { x: strikeRateX + originalRateWidth, y: baselineY + px(16) },
        thickness: 1,
        color: mutedColor,
      });
      page.drawText(item.unitPrice, {
        x: rateRightX - freeRateWidth,
        y: baselineY - px(6),
        size: freeSize,
        font: fontBold,
        color: headingColor,
      });

      page.drawText(item.originalLineTotal, {
        x: strikeAmountX,
        y: baselineY + px(10),
        size: strikeSize,
        font: fontBold,
        color: mutedColor,
      });
      page.drawLine({
        start: { x: strikeAmountX, y: baselineY + px(16) },
        end: { x: strikeAmountX + originalAmountWidth, y: baselineY + px(16) },
        thickness: 1,
        color: mutedColor,
      });
      page.drawText(item.lineTotal, {
        x: amountRightX - freeAmountWidth,
        y: baselineY - px(6),
        size: freeSize,
        font: fontBold,
        color: headingColor,
      });
    } else {
      page.drawText(item.unitPrice, {
        x: rateRightX - fontBold.widthOfTextAtSize(item.unitPrice, unitSize),
        y: baselineY,
        size: unitSize,
        font: fontBold,
        color: headingColor,
      });
      page.drawText(item.lineTotal, {
        x: amountRightX - fontBold.widthOfTextAtSize(item.lineTotal, amountSize),
        y: baselineY,
        size: amountSize,
        font: fontBold,
        color: headingColor,
      });
    }

    tableY -= rowHeight;
  }

  const verticalLineXs = [
    tableX + srWidth,
    tableX + srWidth + itemWidth,
    tableX + srWidth + itemWidth + qtyWidth,
    tableX + srWidth + itemWidth + qtyWidth + rateWidth,
  ];

  for (const vx of verticalLineXs) {
    page.drawLine({
      start: { x: vx, y: tableTop },
      end: { x: vx, y: tableY },
      thickness: 0.5,
      color: borderColor,
    });
  }

  const summaryX = tableX + srWidth + itemWidth;
  const summaryWidth = tableWidth - srWidth - itemWidth;
  const summaryRowHeight = px(32);
  const footerFontSize = px(13);
  const footerLineHeight = px(13 * 1.55);
  const footerLines = wrapTextWithLineBreaks(doc.footerText, contentWidth, fontRegular, footerFontSize);
  const footerBlockDepth = px(14) + footerFontSize + Math.max(0, footerLines.length - 1) * footerLineHeight + px(8);
  const signatureBlockDepth = px(10) + px(60) + px(10) + px(12) + px(8);
  const summaryBlockHeight = doc.summaryRows.length * summaryRowHeight;

  const signatureImageWidth = px(170);
  const signatureImageHeight = px(56);
  const stampImageWidth = px(380);
  let finalStampHeight = px(80);
  if (shopStampImage) {
    const { width: origW, height: origH } = shopStampImage.size();
    const stampAspectRatio = origH / origW;
    finalStampHeight = stampImageWidth * stampAspectRatio;
  }

  const minSummaryTop =
    pageBoxY +
    footerBlockDepth +
    px(56) +
    signatureBlockDepth +
    px(56) +
    summaryBlockHeight;
  let summaryTop = Math.max(tableY - px(14), minSummaryTop);
  const summaryTopOrig = summaryTop;

  for (const row of doc.summaryRows) {
    page.drawRectangle({
      x: summaryX,
      y: summaryTop - summaryRowHeight,
      width: summaryWidth,
      height: summaryRowHeight,
      borderColor: borderColor,
      borderWidth: 0.5,
      color: row.total ? summaryBgColor : rgb(1, 1, 1),
    });

    const labelSize = px(row.total ? 16 : 16);
    const valueSize = px(row.total ? 18 : 16);
    page.drawText(`${row.label}:`, {
      x: summaryX + px(14),
      y: summaryTop - summaryRowHeight / 2 - labelSize / 3,
      size: labelSize,
      font: fontBold,
      color: row.total ? headingColor : subtextColor,
    });
    page.drawText(row.value, {
      x: summaryX + summaryWidth - px(14) - fontBold.widthOfTextAtSize(row.value, valueSize),
      y: summaryTop - summaryRowHeight / 2 - valueSize / 3,
      size: valueSize,
      font: fontBold,
      color: row.total ? headingColor : subtextColor,
    });

    summaryTop -= summaryRowHeight;
  }

  const amountWordsLines = wrapTextWithLineBreaks(`Amount in Words:\nRupees ${doc.amountInWords}`, contentWidth - summaryWidth - px(40), fontBold, px(15));
  let awY = summaryTopOrig - px(16);
  for (const awLine of amountWordsLines) {
    page.drawText(awLine, {
      x: contentX,
      y: awY,
      size: px(15),
      font: fontBold,
      color: headingColor,
    });
    awY -= px(15 * 1.4);
  }

  if (doc.notes) {
    awY -= px(8);
    const notesLines = wrapTextWithLineBreaks(`Notes:\n${doc.notes}`, contentWidth - summaryWidth - px(40), fontRegular, px(14));
    for (const noteLine of notesLines) {
      page.drawText(noteLine, {
        x: contentX,
        y: awY,
        size: px(14),
        font: fontRegular,
        color: subtextColor,
      });
      awY -= px(14 * 1.4);
    }
  }

  if (doc.emiDayOfMonth && invoice.payment_details?.methods?.includes("LOAN")) {
    awY -= px(8);
    let emiText = `EMI on ${getOrdinalSuffix(doc.emiDayOfMonth)} of each month`;
    if (doc.firstEmiDate) {
      emiText += ` (starting from ${doc.firstEmiDate})`;
    }
    page.drawText(emiText, {
      x: contentX,
      y: awY,
      size: px(15),
      font: fontBold,
      color: headingColor,
    });
    awY -= px(15 * 1.4);
  }

  const signatureLineWidth = px(260);
  const signaturePaddingX = px(10);
  const leftSignatureX = contentX + signaturePaddingX;
  const rightSignatureX = contentRight - signaturePaddingX - signatureLineWidth;

  const signaturesTop = Math.min(awY, summaryTop) - px(20) - finalStampHeight - px(10);
  const footerTop = signaturesTop - px(50);

  if (customerSignatureImage) {
    page.drawImage(customerSignatureImage, {
      x: leftSignatureX,
      y: signaturesTop + px(10),
      width: signatureImageWidth,
      height: signatureImageHeight,
    });
  }

  page.drawLine({
    start: { x: leftSignatureX, y: signaturesTop },
    end: { x: leftSignatureX + signatureLineWidth, y: signaturesTop },
    thickness: 1,
    color: titleRuleColor,
  });
  page.drawText("Customer Signature", {
    x: leftSignatureX + signatureLineWidth / 2 - fontBold.widthOfTextAtSize("Customer Signature", px(15)) / 2,
    y: signaturesTop - px(7) - px(15),
    size: px(15),
    font: fontBold,
    color: headingColor,
  });

  if (shopStampImage) {
    page.drawImage(shopStampImage, {
      x: rightSignatureX + signatureLineWidth / 2 - stampImageWidth / 2,
      y: signaturesTop + px(10),
      width: stampImageWidth,
      height: finalStampHeight,
    });
  }

  page.drawLine({
    start: { x: rightSignatureX, y: signaturesTop },
    end: { x: rightSignatureX + signatureLineWidth, y: signaturesTop },
    thickness: 1,
    color: titleRuleColor,
  });
  const rightLabel = shopStampImage ? "Authorized Stamp & Signature" : "Authorized Signatory";
  page.drawText(rightLabel, {
    x: rightSignatureX + signatureLineWidth / 2 - fontBold.widthOfTextAtSize(rightLabel, px(15)) / 2,
    y: signaturesTop - px(7) - px(15),
    size: px(15),
    font: fontBold,
    color: headingColor,
  });
  const safeShopName = sanitizeForPdf(invoice.shop_name_snapshot);
  page.drawText(`For ${safeShopName}`, {
    x: rightSignatureX + signatureLineWidth / 2 - fontBold.widthOfTextAtSize(`For ${safeShopName}`, px(14)) / 2,
    y: signaturesTop - px(10) - px(15) - px(14),
    size: px(14),
    font: fontBold,
    color: subtextColor,
  });

  page.drawLine({
    start: { x: contentX, y: footerTop },
    end: { x: contentRight, y: footerTop },
    thickness: 0.8,
    color: borderColor,
  });

  let footerY = footerTop - px(14) - footerFontSize;
  for (const line of footerLines) {
    if (line) {
      page.drawText(line, {
        x: contentX,
        y: footerY,
        size: px(15),
        font: fontBold,
        color: subtextColor,
      });
    }
    footerY -= footerLineHeight;
  }

  const bytes = await pdf.save();
  return { bytes: new Uint8Array(bytes), filename: doc.filename };
}

export async function downloadInvoicePdf(invoice: PrintableInvoice) {
  const { bytes, filename } = await buildInvoicePdfBytes(invoice);
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), filename);
}
