"use client";

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

export function printInvoice(invoice: PrintableInvoice) {
  const popup = window.open("", "_blank", "width=920,height=760");
  if (!popup) return;
  const logoUrl = resolvePrintableAssetUrl(invoice.shop_logo_url);

  const rows = (invoice.invoice_items ?? [])
    .map((item, index) => {
      const itemMeta = [item.variant_name_snapshot, item.identifier_snapshot]
        .filter(Boolean)
        .join(" • ");

      return `
        <tr>
          <td class="cell muted">${index + 1}</td>
          <td class="cell">
            <div class="item-name">${escapeHtml(item.product_name_snapshot)}</div>
            ${itemMeta ? `<div class="item-meta">${escapeHtml(itemMeta)}</div>` : ""}
          </td>
          <td class="cell right">${item.quantity}</td>
          <td class="cell right">${formatMoney(item.unit_price)}</td>
          <td class="cell right total-cell">${formatMoney(item.line_total)}</td>
        </tr>
      `;
    })
    .join("");

  const shopMeta = [invoice.shop_gst_snapshot ? `GST: ${invoice.shop_gst_snapshot}` : null, invoice.shop_phone_snapshot]
    .filter(Boolean);

  popup.document.write(`
    <html>
      <head>
        <title></title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: #eef2f7;
            color: #111827;
            font-family: Arial, sans-serif;
          }
          .page {
            width: 820px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #d1d5db;
            padding: 36px 40px 40px;
          }
          .header {
            display: flex;
            align-items: center;
            gap: 24px;
          }
          .logo {
            width: 72px;
            height: 72px;
            border-radius: 14px;
            overflow: hidden;
            border: 1px solid #d1d5db;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 26px;
            color: #111827;
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
            font-size: 20px;
            font-weight: 700;
            line-height: 1.25;
            color: #111827;
          }
          .shop-address {
            margin-top: 8px;
            font-size: 13px;
            line-height: 1.55;
            color: #374151;
          }
          .shop-meta {
            margin-top: 4px;
            font-size: 12px;
            line-height: 1.55;
            color: #4b5563;
          }
          .title {
            margin: 28px 0 14px;
            text-align: center;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: #1f2937;
          }
          .title-rule {
            border-top: 2px solid #374151;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px 30px;
            padding: 22px 0 18px;
            border-bottom: 1px solid #d1d5db;
          }
          .info-row {
            display: grid;
            grid-template-columns: 112px 1fr;
            gap: 12px;
            font-size: 14px;
            line-height: 1.45;
          }
          .info-row.full {
            grid-column: 1 / -1;
          }
          .info-row.address-row {
            margin-top: 2px;
          }
          .info-label {
            font-weight: 700;
            color: #111827;
          }
          .info-value {
            color: #111827;
          }
          .table-wrap {
            margin-top: 18px;
            border: 1px solid #d1d5db;
            overflow: hidden;
            background: white;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          thead {
            background: #1f2937;
          }
          th {
            padding: 16px 18px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 600;
            text-align: left;
            color: white;
          }
          th.right {
            text-align: right;
          }
          .cell {
            padding: 15px 18px;
            border-top: 1px solid #e5e7eb;
            vertical-align: middle;
            font-size: 14px;
            color: #111827;
          }
          .cell.right {
            text-align: right;
          }
          .right {
            text-align: right;
          }
          .muted {
            color: #6b7280;
            width: 56px;
          }
          .item-name {
            font-weight: 600;
            color: #111827;
            line-height: 1.4;
            margin-bottom: 4px;
          }
          .item-meta {
            margin-top: 4px;
            color: #6b7280;
            font-size: 12px;
            line-height: 1.4;
          }
          .total-cell {
            font-weight: 700;
            color: #111827;
          }
          .summary {
            margin-top: 18px;
            margin-left: auto;
            width: 250px;
            border: 1px solid #d1d5db;
            border-radius: 12px;
            overflow: hidden;
            background: #ffffff;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-top: 0;
            padding: 14px 18px;
            font-size: 14px;
            color: #374151;
            border-top: 1px solid #e5e7eb;
          }
          .summary-row:first-child {
            border-top: none;
          }
          .summary-total {
            background: #f9fafb;
            font-size: 14px;
            font-weight: 700;
            color: #111827;
          }
          .summary-total strong {
            font-size: 16px;
          }
          .footer {
            margin-top: 34px;
            padding-top: 20px;
            border-top: 1px solid #d1d5db;
            font-size: 13px;
            color: #374151;
            line-height: 1.7;
            white-space: pre-line;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 80px;
            padding: 0 10px 10px;
          }
          .signature-block {
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #374151;
            width: 180px;
            margin-bottom: 8px;
          }
          .signature-title {
            font-size: 14px;
            font-weight: 600;
            color: #111827;
          }
          .signature-subtitle {
            font-size: 12px;
            color: #4b5563;
            margin-top: 4px;
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
                  logoUrl
                    ? `<img id="print-shop-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(invoice.shop_name_snapshot)}" />`
                    : escapeHtml(invoice.shop_name_snapshot.slice(0, 1).toUpperCase())
                }
              </div>
              <div class="shop-copy">
                <div class="shop-name">${escapeHtml(invoice.shop_name_snapshot)}</div>
                <div class="shop-address">${escapeHtml(invoice.shop_address_snapshot ?? "")}</div>
                ${shopMeta.length ? `<div class="shop-meta">${shopMeta.map((item) => escapeHtml(String(item))).join("<br />")}</div>` : ""}
              </div>
            </div>
          </div>

          <div class="title">Invoice</div>
          <div class="title-rule"></div>

          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">Invoice No:</div>
              <div class="info-value">${escapeHtml(invoice.invoice_number)}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Date:</div>
              <div class="info-value">${escapeHtml(new Date(invoice.invoice_date).toLocaleDateString())}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Client Name:</div>
              <div class="info-value">${escapeHtml(invoice.customer_name)}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Client No:</div>
              <div class="info-value">${escapeHtml(invoice.customer_mobile ?? "-")}</div>
            </div>
            ${
              invoice.customer_gst_number
                ? `
                  <div class="info-row">
                    <div class="info-label">Client GST:</div>
                    <div class="info-value">${escapeHtml(invoice.customer_gst_number)}</div>
                  </div>
                `
                : ""
            }
            <div class="info-row">
              <div class="info-label">Payment:</div>
              <div class="info-value">${escapeHtml(buildPaymentSummary(invoice.payment_method, invoice.payment_details))}</div>
            </div>
            <div class="info-row full address-row">
              <div class="info-label">Address:</div>
              <div class="info-value">${escapeHtml(invoice.billing_address ?? "-")}</div>
            </div>
          </div>

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

          <div class="summary">
            <div class="summary-row"><span>Subtotal:</span><strong>${formatMoney(invoice.subtotal)}</strong></div>
            <div class="summary-row"><span>Discount:</span><strong>${formatMoney(invoice.discount_total)}</strong></div>
            <div class="summary-row summary-total"><span>Grand Total:</span><strong>${formatMoney(invoice.grand_total)}</strong></div>
          </div>

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

          <div class="footer">${escapeHtml(invoice.invoice_footer_snapshot ?? "Goods once sold will not be taken back without original bill.")}</div>
        </div>
      </body>
    </html>
  `);

  popup.document.close();

  const triggerPrint = () => {
    popup.focus();
    popup.print();
  };

  if (!logoUrl) {
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
