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
  } | null;
  payment_status?: string | null;
  notes?: string | null;
  shop_logo_url?: string | null;
  invoice_items?: Array<{
    product_name_snapshot: string;
    brand_name_snapshot?: string | null;
    category_name_snapshot?: string | null;
    variant_name_snapshot?: string | null;
    identifier_snapshot?: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value: number) {
  return `${Number(value || 0).toFixed(2)}`;
}

const INVOICE_LAYOUT = {
  pdfPageWidth: 595.28,
  pdfPageHeight: 841.89,
  pdfMarginX: 32,
  pdfMarginTop: 28,
  pdfMarginBottom: 28,
  background: "#ffffff",
  border: "#d8dee8",
  mutedBorder: "#e7ebf1",
  heading: "#203247",
  subtext: "#5f7186",
  muted: "#8693a3",
  tableHead: "#6f7c8c",
  summaryBg: "#fbfcfe",
  logoSize: 54,
  headerGap: 16,
  printPageWidth: 820,
  printPaddingX: 46,
  printPaddingTop: 34,
  printPaddingBottom: 36,
  summaryWidth: 182,
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilenamePart(value?: string | null) {
  return (value ?? "customer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "customer";
}

async function embedLogo(pdf: PDFDocument, logoUrl?: string | null) {
  const assetUrl = resolvePrintableAssetUrl(logoUrl);
  if (!assetUrl) return null;

  try {
    const response = await fetch(assetUrl);
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

type PDFFontLike = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

type InvoiceDocData = {
  logoUrl: string | null;
  filename: string;
  shopMeta: string[];
  infoRows: Array<{ label: string; value: string; full?: boolean }>;
  items: Array<{
    index: number;
    name: string;
    meta: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
  summaryRows: Array<{ label: string; value: string; total?: boolean }>;
  footerText: string;
  formattedDate: string;
  paymentSummary: string;
};

function buildInvoiceDocData(invoice: PrintableInvoice): InvoiceDocData {
  const paymentSummary = buildPaymentSummary(invoice.payment_method, invoice.payment_details);
  const formattedDate = new Date(invoice.invoice_date).toLocaleDateString();
  const shopMeta = [invoice.shop_gst_snapshot ? `GST: ${invoice.shop_gst_snapshot}` : null, invoice.shop_phone_snapshot]
    .filter(Boolean) as string[];

  const infoRows: InvoiceDocData["infoRows"] = [
    { label: "Invoice No", value: invoice.invoice_number },
    { label: "Date", value: formattedDate },
    { label: "Client Name", value: invoice.customer_name },
    { label: "Client No", value: invoice.customer_mobile ?? "-" },
  ];

  if (invoice.customer_gst_number) {
    infoRows.push({ label: "Client GST", value: invoice.customer_gst_number });
  }

  infoRows.push({ label: "Payment", value: paymentSummary, full: true });
  infoRows.push({ label: "Address", value: invoice.billing_address ?? "-", full: true });

  const items = (invoice.invoice_items ?? []).map((item, index) => ({
    index: index + 1,
    name: item.product_name_snapshot,
    meta: [item.variant_name_snapshot, item.identifier_snapshot].filter(Boolean).join(" • "),
    quantity: String(item.quantity),
    unitPrice: formatMoney(item.unit_price),
    lineTotal: formatMoney(item.line_total),
  }));

  const summaryRows = [
    { label: "Subtotal", value: formatMoney(invoice.subtotal) },
    { label: "Discount", value: formatMoney(invoice.discount_total) },
    { label: "Grand Total", value: formatMoney(invoice.grand_total), total: true },
  ];

  return {
    logoUrl: resolvePrintableAssetUrl(invoice.shop_logo_url),
    filename: `${sanitizeFilenamePart(invoice.customer_name)}-bill.pdf`,
    shopMeta,
    infoRows,
    items,
    summaryRows,
    footerText: invoice.invoice_footer_snapshot ?? "Goods once sold will not be taken back without original bill.",
    formattedDate,
    paymentSummary,
  };
}

function buildInvoiceHtml(invoice: PrintableInvoice, doc: InvoiceDocData) {
  const rows = doc.items
    .map((item) => {
      return `
        <tr>
          <td class="cell muted">${item.index}</td>
          <td class="cell">
            <div class="item-name">${escapeHtml(item.name)}</div>
            ${item.meta ? `<div class="item-meta">${escapeHtml(item.meta)}</div>` : ""}
          </td>
          <td class="cell right">${escapeHtml(item.quantity)}</td>
          <td class="cell right">${escapeHtml(item.unitPrice)}</td>
          <td class="cell right total-cell">${escapeHtml(item.lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const infoRowsHtml = doc.infoRows
    .map((row) => `
      <div class="info-row${row.full ? " full" : ""}${row.label === "Address" ? " address-row" : ""}">
        <div class="info-label">${escapeHtml(row.label)}:</div>
        <div class="info-value">${escapeHtml(row.value)}</div>
      </div>
    `)
    .join("");

  const summaryHtml = doc.summaryRows
    .map((row) => `
      <div class="summary-row${row.total ? " summary-total" : ""}">
        <span>${escapeHtml(row.label)}:</span>
        <strong>${escapeHtml(row.value)}</strong>
      </div>
    `)
    .join("");

  return `
    <html>
      <head>
        <title></title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: ${INVOICE_LAYOUT.background};
            color: ${INVOICE_LAYOUT.heading};
            font-family: Arial, sans-serif;
          }
          .page {
            width: ${INVOICE_LAYOUT.printPageWidth}px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid ${INVOICE_LAYOUT.border};
            padding: ${INVOICE_LAYOUT.printPaddingTop}px ${INVOICE_LAYOUT.printPaddingX}px ${INVOICE_LAYOUT.printPaddingBottom}px;
          }
          .header {
            display: flex;
            align-items: center;
            gap: ${INVOICE_LAYOUT.headerGap}px;
          }
          .logo {
            width: ${INVOICE_LAYOUT.logoSize}px;
            height: ${INVOICE_LAYOUT.logoSize}px;
            border-radius: 14px;
            overflow: hidden;
            border: 1px solid ${INVOICE_LAYOUT.border};
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 26px;
            color: ${INVOICE_LAYOUT.heading};
            flex-shrink: 0;
          }
          .logo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .shop-block {
            display: flex;
            gap: 16px;
            align-items: flex-start;
            flex: 1;
          }
          .shop-copy {
            flex: 1;
          }
          .shop-name {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            line-height: 1.25;
            color: ${INVOICE_LAYOUT.heading};
          }
          .shop-address {
            margin-top: 7px;
            font-size: 12px;
            line-height: 1.45;
            color: ${INVOICE_LAYOUT.subtext};
          }
          .shop-meta {
            margin-top: 3px;
            font-size: 11.5px;
            line-height: 1.5;
            color: ${INVOICE_LAYOUT.subtext};
          }
          .title {
            margin: 30px 0 12px;
            text-align: center;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: ${INVOICE_LAYOUT.heading};
          }
          .title-rule {
            border-top: 1.5px solid #506176;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 36px;
            padding: 16px 0 16px;
            border-bottom: 1px solid ${INVOICE_LAYOUT.border};
          }
          .info-row {
            display: grid;
            grid-template-columns: 88px 1fr;
            gap: 10px;
            font-size: 12px;
            line-height: 1.35;
          }
          .info-row.full { grid-column: 1 / -1; }
          .info-row.address-row { margin-top: 2px; }
          .info-label { font-weight: 700; color: ${INVOICE_LAYOUT.heading}; }
          .info-value { color: ${INVOICE_LAYOUT.heading}; }
          .table-wrap {
            margin-top: 14px;
            border: 1px solid ${INVOICE_LAYOUT.border};
            overflow: hidden;
            background: white;
          }
          table { width: 100%; border-collapse: collapse; }
          thead { background: #fbfcfe; }
          th {
            padding: 11px 14px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 600;
            text-align: left;
            color: ${INVOICE_LAYOUT.tableHead};
            border-bottom: 1px solid ${INVOICE_LAYOUT.mutedBorder};
          }
          th.right, .cell.right, .right { text-align: right; }
          .cell {
            padding: 13px 14px;
            border-top: 1px solid ${INVOICE_LAYOUT.mutedBorder};
            vertical-align: middle;
            font-size: 12px;
            color: ${INVOICE_LAYOUT.heading};
          }
          .muted { color: ${INVOICE_LAYOUT.muted}; width: 38px; }
          .item-name {
            font-weight: 600;
            color: ${INVOICE_LAYOUT.heading};
            line-height: 1.4;
            margin-bottom: 3px;
          }
          .item-meta {
            margin-top: 3px;
            color: ${INVOICE_LAYOUT.muted};
            font-size: 10.5px;
            line-height: 1.4;
          }
          .total-cell { font-weight: 700; color: ${INVOICE_LAYOUT.heading}; }
          .summary {
            margin-top: 14px;
            margin-left: auto;
            width: ${INVOICE_LAYOUT.summaryWidth}px;
            border: 1px solid ${INVOICE_LAYOUT.border};
            border-radius: 12px;
            overflow: hidden;
            background: #ffffff;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-top: 0;
            padding: 10px 14px;
            font-size: 12px;
            color: ${INVOICE_LAYOUT.subtext};
            border-top: 1px solid ${INVOICE_LAYOUT.mutedBorder};
          }
          .summary-row:first-child { border-top: none; }
          .summary-total {
            background: ${INVOICE_LAYOUT.summaryBg};
            font-size: 12px;
            font-weight: 700;
            color: ${INVOICE_LAYOUT.heading};
          }
          .summary-total strong { font-size: 13px; }
          .footer {
            margin-top: 42px;
            padding-top: 14px;
            border-top: 1px solid ${INVOICE_LAYOUT.border};
            font-size: 11.5px;
            color: ${INVOICE_LAYOUT.subtext};
            line-height: 1.55;
            white-space: pre-line;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 56px;
            padding: 0 10px 10px;
          }
          .signature-block { text-align: center; }
          .signature-line {
            border-top: 1px solid #506176;
            width: 132px;
            margin-bottom: 7px;
          }
          .signature-title {
            font-size: 11.5px;
            font-weight: 600;
            color: ${INVOICE_LAYOUT.heading};
          }
          .signature-subtitle {
            font-size: 10px;
            color: ${INVOICE_LAYOUT.subtext};
            margin-top: 3px;
          }
          @media print {
            body { background: white; padding: 0; margin: 0; }
            .page {
              width: 100%;
              max-width: none;
              margin: 0;
              padding: 24px 28px 28px;
              border: none;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="shop-block">
              <div class="logo">
                ${
                  doc.logoUrl
                    ? `<img id="print-shop-logo" src="${escapeHtml(doc.logoUrl)}" alt="${escapeHtml(invoice.shop_name_snapshot)}" />`
                    : escapeHtml(invoice.shop_name_snapshot.slice(0, 1).toUpperCase())
                }
              </div>
              <div class="shop-copy">
                <div class="shop-name">${escapeHtml(invoice.shop_name_snapshot)}</div>
                <div class="shop-address">${escapeHtml(invoice.shop_address_snapshot ?? "")}</div>
                ${doc.shopMeta.length ? `<div class="shop-meta">${doc.shopMeta.map((item) => escapeHtml(String(item))).join("<br />")}</div>` : ""}
              </div>
            </div>
          </div>

          <div class="title">Invoice</div>
          <div class="title-rule"></div>

          <div class="info-grid">${infoRowsHtml}</div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th class="right">Qty</th>
                  <th class="right">Rate (Rs)</th>
                  <th class="right">Amount (Rs)</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          <div class="summary">${summaryHtml}</div>

          <div class="signatures">
            <div class="signature-block">
              <div class="signature-line"></div>
              <div class="signature-title">Customer Signature</div>
            </div>
            <div class="signature-block">
              <div class="signature-line"></div>
              <div class="signature-title">Authorized Signatory</div>
              <div class="signature-subtitle">For ${escapeHtml(invoice.shop_name_snapshot)}</div>
            </div>
          </div>

          <div class="footer">${escapeHtml(doc.footerText)}</div>
        </div>
      </body>
    </html>
  `;
}

export async function downloadInvoicePdf(invoice: PrintableInvoice) {
  const doc = buildInvoiceDocData(invoice);
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await embedLogo(pdf, doc.logoUrl);

  const page = pdf.addPage([INVOICE_LAYOUT.pdfPageWidth, INVOICE_LAYOUT.pdfPageHeight]);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = INVOICE_LAYOUT.pdfMarginX;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = pageHeight - INVOICE_LAYOUT.pdfMarginTop;

  if (logoImage) {
    page.drawImage(logoImage, {
      x: margin,
      y: cursorY - 48,
      width: 48,
      height: 48,
    });
  } else {
    page.drawRectangle({
      x: margin,
      y: cursorY - 48,
      width: 48,
      height: 48,
      borderColor: rgb(0.82, 0.85, 0.88),
      borderWidth: 1,
      color: rgb(0.97, 0.98, 0.99),
    });
    page.drawText((invoice.shop_name_snapshot || "D").slice(0, 1).toUpperCase(), {
      x: margin + 21,
      y: cursorY - 36,
      size: 18,
      font: fontBold,
      color: rgb(0.15, 0.18, 0.22),
    });
  }

  page.drawText(invoice.shop_name_snapshot, {
    x: margin + 60,
    y: cursorY - 14,
    size: 15,
    font: fontBold,
    color: rgb(0.13, 0.2, 0.28),
  });

  let metaY = cursorY - 27;
  const shopLines = [invoice.shop_address_snapshot ?? "", ...doc.shopMeta].filter(Boolean);
  for (const line of shopLines) {
    const wrapped = wrapText(line, contentWidth - 70, fontRegular, 8.7);
    for (const row of wrapped) {
      page.drawText(row, {
        x: margin + 60,
        y: metaY,
        size: 8.7,
        font: fontRegular,
        color: rgb(0.39, 0.46, 0.54),
      });
      metaY -= 11;
    }
  }

  cursorY = metaY - 18;
  page.drawText("INVOICE", {
    x: margin + contentWidth / 2 - fontBold.widthOfTextAtSize("INVOICE", 14) / 2,
    y: cursorY,
    size: 12.5,
    font: fontBold,
    color: rgb(0.18, 0.25, 0.33),
  });

  cursorY -= 11;
  page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: pageWidth - margin, y: cursorY },
    thickness: 1,
    color: rgb(0.33, 0.4, 0.48),
  });

  cursorY -= 18;
  for (const row of doc.infoRows) {
    const label = row.label;
    const value = row.value;

    page.drawText(`${label}:`, {
      x: margin,
      y: cursorY,
      size: 9.2,
      font: fontBold,
      color: rgb(0.13, 0.2, 0.28),
    });

    const wrapped = wrapText(value, contentWidth - 88, fontRegular, 9.2);
    for (const [index, line] of wrapped.entries()) {
      page.drawText(line, {
        x: margin + 88,
        y: cursorY - index * 11,
        size: 9.2,
        font: fontRegular,
        color: rgb(0.18, 0.24, 0.31),
      });
    }
    cursorY -= Math.max(wrapped.length, 1) * 11 + 5;
  }

  cursorY -= 6;
  const columns = {
    sr: margin + 4,
    item: margin + 42,
    qty: margin + 292,
    rate: margin + 356,
    amount: margin + 438,
  };

  page.drawRectangle({
    x: margin,
    y: cursorY - 18,
    width: contentWidth,
    height: 18,
    color: rgb(0.985, 0.989, 0.995),
  });
  page.drawRectangle({
    x: margin,
    y: cursorY - 18,
    width: contentWidth,
    height: 18,
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 0.8,
  });
  page.drawText("#", { x: columns.sr, y: cursorY - 12, size: 8.2, font: fontBold, color: rgb(0.49, 0.56, 0.63) });
  page.drawText("ITEM", { x: columns.item, y: cursorY - 12, size: 8.2, font: fontBold, color: rgb(0.49, 0.56, 0.63) });
  page.drawText("QTY", { x: columns.qty, y: cursorY - 12, size: 8.2, font: fontBold, color: rgb(0.49, 0.56, 0.63) });
  page.drawText("RATE (RS)", { x: columns.rate, y: cursorY - 12, size: 8.2, font: fontBold, color: rgb(0.49, 0.56, 0.63) });
  page.drawText("AMOUNT (RS)", { x: columns.amount, y: cursorY - 12, size: 8.2, font: fontBold, color: rgb(0.49, 0.56, 0.63) });

  cursorY -= 24;

  for (const item of doc.items) {
    const itemLines = wrapText(item.name, 225, fontBold, 9.4);
    const metaLines = item.meta ? wrapText(item.meta, 225, fontRegular, 7.5) : [];
    const rowHeight = Math.max(38, itemLines.length * 10 + metaLines.length * 8 + 10);

    page.drawRectangle({
      x: margin,
      y: cursorY - rowHeight,
      width: contentWidth,
      height: rowHeight,
      borderColor: rgb(0.88, 0.9, 0.94),
      borderWidth: 0.8,
    });

    page.drawText(String(item.index), {
      x: columns.sr,
      y: cursorY - 18,
      size: 8.8,
      font: fontRegular,
      color: rgb(0.43, 0.5, 0.58),
    });

    let lineY = cursorY - 18;
    for (const line of itemLines) {
      page.drawText(line, {
        x: columns.item,
        y: lineY,
        size: 9.4,
        font: fontBold,
        color: rgb(0.13, 0.2, 0.28),
      });
      lineY -= 10;
    }
    for (const line of metaLines) {
      page.drawText(line, {
        x: columns.item,
        y: lineY,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.43, 0.5, 0.58),
      });
      lineY -= 8;
    }

    page.drawText(item.quantity, {
      x: columns.qty,
      y: cursorY - 18,
      size: 8.8,
      font: fontRegular,
      color: rgb(0.13, 0.2, 0.28),
    });
    page.drawText(item.unitPrice, {
      x: columns.rate,
      y: cursorY - 18,
      size: 8.8,
      font: fontRegular,
      color: rgb(0.13, 0.2, 0.28),
    });
    page.drawText(item.lineTotal, {
      x: columns.amount,
      y: cursorY - 18,
      size: 8.8,
      font: fontBold,
      color: rgb(0.13, 0.2, 0.28),
    });

    cursorY -= rowHeight + 10;
  }

  cursorY -= 2;
  const summaryX = pageWidth - margin - 170;
  let summaryY = cursorY;
  for (const row of doc.summaryRows) {
    page.drawRectangle({
      x: summaryX,
      y: summaryY - 20,
      width: 170,
      height: 21,
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 0.8,
      color: row.total ? rgb(0.985, 0.989, 0.995) : rgb(1, 1, 1),
    });
    page.drawText(row.label, {
      x: summaryX + 10,
      y: summaryY - 13,
      size: row.total ? 9.2 : 8.8,
      font: row.total ? fontBold : fontRegular,
      color: rgb(0.31, 0.38, 0.46),
    });
    page.drawText(row.value, {
      x: summaryX + 102,
      y: summaryY - 13,
      size: row.total ? 9.2 : 8.8,
      font: fontBold,
      color: rgb(0.13, 0.2, 0.28),
    });
    summaryY -= 20;
  }

  const signatureY = Math.min(summaryY - 44, 195);
  const signatureLineWidth = 110;
  const leftSignatureX = margin + 8;
  const rightSignatureX = pageWidth - margin - 8 - signatureLineWidth;

  page.drawLine({
    start: { x: leftSignatureX, y: signatureY },
    end: { x: leftSignatureX + signatureLineWidth, y: signatureY },
    thickness: 1,
    color: rgb(0.33, 0.4, 0.48),
  });
  page.drawText("Customer Signature", {
    x: leftSignatureX + 12,
    y: signatureY - 14,
    size: 8.5,
    font: fontBold,
    color: rgb(0.13, 0.2, 0.28),
  });

  page.drawLine({
    start: { x: rightSignatureX, y: signatureY },
    end: { x: rightSignatureX + signatureLineWidth, y: signatureY },
    thickness: 1,
    color: rgb(0.33, 0.4, 0.48),
  });
  page.drawText("Authorized Signatory", {
    x: rightSignatureX + 4,
    y: signatureY - 14,
    size: 8.5,
    font: fontBold,
    color: rgb(0.13, 0.2, 0.28),
  });
  page.drawText(`For ${invoice.shop_name_snapshot}`, {
    x: rightSignatureX + 10,
    y: signatureY - 24,
    size: 7.2,
    font: fontRegular,
    color: rgb(0.39, 0.46, 0.54),
  });

  const footerLines = wrapText(doc.footerText, contentWidth, fontRegular, 8.4);
  let footerY = 78;
  page.drawLine({
    start: { x: margin, y: footerY + 18 },
    end: { x: pageWidth - margin, y: footerY + 18 },
    thickness: 0.8,
    color: rgb(0.85, 0.88, 0.92),
  });
  for (const line of footerLines) {
    page.drawText(line, {
      x: margin,
      y: footerY,
      size: 8.4,
      font: fontRegular,
      color: rgb(0.39, 0.46, 0.54),
    });
    footerY -= 10;
  }

  const bytes = await pdf.save();
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), doc.filename);
}

export function printInvoice(invoice: PrintableInvoice) {
  const popup = window.open("", "_blank", "width=920,height=760");
  if (!popup) return;
  const doc = buildInvoiceDocData(invoice);
  popup.document.write(buildInvoiceHtml(invoice, doc));

  popup.document.close();

  const triggerPrint = () => {
    popup.focus();
    popup.print();
  };

  if (!doc.logoUrl) {
    popup.setTimeout(triggerPrint, 150);
    return;
  }

  const logo = popup.document.getElementById("print-shop-logo") as HTMLImageElement | null;
  if (!logo) {
    popup.setTimeout(triggerPrint, 150);
    return;
  }

  if (logo.complete) {
    popup.setTimeout(triggerPrint, 150);
    return;
  }

  logo.addEventListener("load", () => popup.setTimeout(triggerPrint, 150), { once: true });
  logo.addEventListener("error", () => popup.setTimeout(triggerPrint, 150), { once: true });
}
