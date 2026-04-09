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

function renderMultilineHtml(text: string) {
  return escapeHtml(text).replace(/\r\n/g, "\n").replace(/\n/g, "<br />");
}

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
    { label: "Subtotal (Rs)", value: formatMoney(invoice.subtotal) },
    ...(Number(invoice.discount_total || 0) > 0
      ? [{ label: "Discount (Rs)", value: formatMoney(invoice.discount_total) }]
      : []),
    { label: "Grand Total (Rs)", value: formatMoney(invoice.grand_total), total: true },
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
        <title>${escapeHtml(`${invoice.invoice_number} - ${invoice.shop_name_snapshot}`)}</title>
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

          <div class="footer">${renderMultilineHtml(doc.footerText)}</div>
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
    const initial = (invoice.shop_name_snapshot || "D").slice(0, 1).toUpperCase();
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
  const shopNameSize = px(18);
  page.drawText(invoice.shop_name_snapshot, {
    x: copyX,
    y: cursorY - shopNameSize,
    size: shopNameSize,
    font: fontBold,
    color: headingColor,
  });

  let shopTextY = cursorY - shopNameSize - px(7);
  const shopAddressLines = wrapText(invoice.shop_address_snapshot ?? "", contentWidth - logoSize - px(INVOICE_LAYOUT.headerGap), fontRegular, px(12));
  for (const line of shopAddressLines.filter(Boolean)) {
    page.drawText(line, {
      x: copyX,
      y: shopTextY - px(12),
      size: px(12),
      font: fontRegular,
      color: subtextColor,
    });
    shopTextY -= px(12 * 1.45);
  }

  for (const line of doc.shopMeta) {
    const wrapped = wrapText(line, contentWidth - logoSize - px(INVOICE_LAYOUT.headerGap), fontRegular, px(11.5));
    for (const row of wrapped) {
      page.drawText(row, {
        x: copyX,
        y: shopTextY - px(11.5),
        size: px(11.5),
        font: fontRegular,
        color: subtextColor,
      });
      shopTextY -= px(11.5 * 1.5);
    }
  }

  cursorY = Math.min(logoY, shopTextY) - px(30);

  const title = "INVOICE";
  const titleSize = px(14);
  page.drawText(title, {
    x: pageBoxX + pageBoxWidth / 2 - fontBold.widthOfTextAtSize(title, titleSize) / 2,
    y: cursorY - titleSize,
    size: titleSize,
    font: fontBold,
    color: headingColor,
  });

  cursorY -= px(12 + 14);
  page.drawLine({
    start: { x: contentX, y: cursorY },
    end: { x: contentRight, y: cursorY },
    thickness: 1.2,
    color: titleRuleColor,
  });

  cursorY -= px(16);
  const infoGapX = px(36);
  const infoColWidth = (contentWidth - infoGapX) / 2;
  const labelWidth = px(88);
  const labelGap = px(10);
  const infoFontSize = px(12);
  const infoLineHeight = px(12 * 1.35);
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
    const wrapped = wrapText(row.value, infoColWidth - labelWidth - labelGap, fontRegular, infoFontSize);
    const rowHeight = Math.max(1, wrapped.length) * infoLineHeight;
    const rowY = index % 2 === 0 ? infoLeftY : infoRightY;

    page.drawText(`${row.label}:`, {
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
        font: fontRegular,
        color: headingColor,
      });
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
    const wrapped = wrapText(row.value, contentWidth - labelWidth - labelGap, fontRegular, infoFontSize);
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
        font: fontRegular,
        color: headingColor,
      });
    }

    cursorY -= rowHeight + infoVerticalGap;
  }

  cursorY -= px(8);
  page.drawLine({
    start: { x: contentX, y: cursorY },
    end: { x: contentRight, y: cursorY },
    thickness: 0.8,
    color: borderColor,
  });

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
    borderWidth: 1,
  });

  const headerFontSize = px(11);
  const headerY = tableY - headerHeight / 2 - headerFontSize / 3;
  page.drawText("#", { x: tableX + cellPaddingX, y: headerY, size: headerFontSize, font: fontBold, color: tableHeadColor });
  page.drawText("ITEM", { x: tableX + srWidth + cellPaddingX, y: headerY, size: headerFontSize, font: fontBold, color: tableHeadColor });
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
    const nameLines = wrapText(item.name, itemWidth - cellPaddingX * 2, fontBold, px(12));
    const metaLines = item.meta ? wrapText(item.meta, itemWidth - cellPaddingX * 2, fontRegular, px(10.5)) : [];
    const rowHeight = Math.max(px(42), px(13) * 2 + nameLines.length * px(12 * 1.4) + metaLines.length * px(10.5 * 1.4));

    page.drawRectangle({
      x: tableX,
      y: tableY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      borderColor: mutedBorderColor,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    const baselineY = tableY - px(13) - px(12);
    page.drawText(String(item.index), {
      x: tableX + cellPaddingX,
      y: baselineY,
      size: px(12),
      font: fontRegular,
      color: mutedColor,
    });

    let itemTextY = baselineY;
    for (const line of nameLines) {
      page.drawText(line, {
        x: tableX + srWidth + cellPaddingX,
        y: itemTextY,
        size: px(12),
        font: fontBold,
        color: headingColor,
      });
      itemTextY -= px(12 * 1.4);
    }

    for (const line of metaLines) {
      page.drawText(line, {
        x: tableX + srWidth + cellPaddingX,
        y: itemTextY,
        size: px(10.5),
        font: fontRegular,
        color: mutedColor,
      });
      itemTextY -= px(10.5 * 1.4);
    }

    const qtySize = px(12);
    const unitSize = px(12);
    const amountSize = px(12);
    page.drawText(item.quantity, {
      x: tableX + srWidth + itemWidth + qtyWidth - cellPaddingX - fontRegular.widthOfTextAtSize(item.quantity, qtySize),
      y: baselineY,
      size: qtySize,
      font: fontRegular,
      color: headingColor,
    });
    page.drawText(item.unitPrice, {
      x: tableX + srWidth + itemWidth + qtyWidth + rateWidth - cellPaddingX - fontRegular.widthOfTextAtSize(item.unitPrice, unitSize),
      y: baselineY,
      size: unitSize,
      font: fontRegular,
      color: headingColor,
    });
    page.drawText(item.lineTotal, {
      x: tableX + tableWidth - cellPaddingX - fontBold.widthOfTextAtSize(item.lineTotal, amountSize),
      y: baselineY,
      size: amountSize,
      font: fontBold,
      color: headingColor,
    });

    tableY -= rowHeight;
  }

  const summaryWidth = px(INVOICE_LAYOUT.summaryWidth);
  const summaryX = contentRight - summaryWidth;
  const summaryRowHeight = px(32);
  const footerFontSize = px(11.5);
  const footerLineHeight = px(11.5 * 1.55);
  const footerLines = wrapTextWithLineBreaks(doc.footerText, contentWidth, fontRegular, footerFontSize);
  const footerBlockDepth = px(14) + footerFontSize + Math.max(0, footerLines.length - 1) * footerLineHeight + px(8);
  const signatureBlockDepth = px(10) + px(11.5) + px(10) + px(10) + px(8);
  const summaryBlockHeight = doc.summaryRows.length * summaryRowHeight;
  const minSummaryTop =
    pageBoxY +
    footerBlockDepth +
    px(56) +
    signatureBlockDepth +
    px(56) +
    summaryBlockHeight;
  let summaryTop = Math.max(tableY - px(14), minSummaryTop);

  for (const row of doc.summaryRows) {
    page.drawRectangle({
      x: summaryX,
      y: summaryTop - summaryRowHeight,
      width: summaryWidth,
      height: summaryRowHeight,
      borderColor: borderColor,
      borderWidth: 1,
      color: row.total ? summaryBgColor : rgb(1, 1, 1),
    });

    const labelSize = px(row.total ? 12 : 12);
    const valueSize = px(row.total ? 13 : 12);
    page.drawText(`${row.label}:`, {
      x: summaryX + px(14),
      y: summaryTop - summaryRowHeight / 2 - labelSize / 3,
      size: labelSize,
      font: row.total ? fontBold : fontRegular,
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

  const signaturesTop = summaryTop - summaryBlockHeight - px(56);
  const signatureLineWidth = px(132);
  const signaturePaddingX = px(10);
  const leftSignatureX = contentX + signaturePaddingX;
  const rightSignatureX = contentRight - signaturePaddingX - signatureLineWidth;

  page.drawLine({
    start: { x: leftSignatureX, y: signaturesTop },
    end: { x: leftSignatureX + signatureLineWidth, y: signaturesTop },
    thickness: 1,
    color: titleRuleColor,
  });
  page.drawText("Customer Signature", {
    x: leftSignatureX + signatureLineWidth / 2 - fontBold.widthOfTextAtSize("Customer Signature", px(11.5)) / 2,
    y: signaturesTop - px(7) - px(11.5),
    size: px(11.5),
    font: fontBold,
    color: headingColor,
  });

  page.drawLine({
    start: { x: rightSignatureX, y: signaturesTop },
    end: { x: rightSignatureX + signatureLineWidth, y: signaturesTop },
    thickness: 1,
    color: titleRuleColor,
  });
  page.drawText("Authorized Signatory", {
    x: rightSignatureX + signatureLineWidth / 2 - fontBold.widthOfTextAtSize("Authorized Signatory", px(11.5)) / 2,
    y: signaturesTop - px(7) - px(11.5),
    size: px(11.5),
    font: fontBold,
    color: headingColor,
  });
  page.drawText(`For ${invoice.shop_name_snapshot}`, {
    x: rightSignatureX + signatureLineWidth / 2 - fontRegular.widthOfTextAtSize(`For ${invoice.shop_name_snapshot}`, px(10)) / 2,
    y: signaturesTop - px(10) - px(11.5) - px(10),
    size: px(10),
    font: fontRegular,
    color: subtextColor,
  });

  const footerTop = signaturesTop - signatureBlockDepth - px(56);
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
        size: footerFontSize,
        font: fontRegular,
        color: subtextColor,
      });
    }
    footerY -= footerLineHeight;
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
