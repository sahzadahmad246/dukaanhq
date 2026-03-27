"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

import type { PrintableQrEntry } from "./qr";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 24;
const COLUMN_COUNT = 4;
const ROW_COUNT = 6;
const CELL_WIDTH = (PAGE_WIDTH - PAGE_MARGIN * 2) / COLUMN_COUNT;
const CELL_HEIGHT = (PAGE_HEIGHT - PAGE_MARGIN * 2) / ROW_COUNT;
const QR_SIZE = 82;

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

export async function downloadQrSheetPdf(entries: PrintableQrEntry[], filename: string) {
  if (entries.length === 0) return;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  for (const [index, entry] of entries.entries()) {
    if (index > 0 && index % (COLUMN_COUNT * ROW_COUNT) === 0) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    }

    const indexOnPage = index % (COLUMN_COUNT * ROW_COUNT);
    const column = indexOnPage % COLUMN_COUNT;
    const row = Math.floor(indexOnPage / COLUMN_COUNT);

    const cellX = PAGE_MARGIN + column * CELL_WIDTH;
    const cellTop = PAGE_HEIGHT - PAGE_MARGIN - row * CELL_HEIGHT;

    const qrDataUrl = await QRCode.toDataURL(entry.payload, {
      errorCorrectionLevel: "M",
      margin: 0,
      width: 320,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    const qrImage = await pdf.embedPng(qrDataUrl);
    const qrX = cellX + (CELL_WIDTH - QR_SIZE) / 2;
    const qrY = cellTop - 18 - QR_SIZE;

    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: QR_SIZE,
      height: QR_SIZE,
    });

    const fontSize = 9;
    const textWidth = font.widthOfTextAtSize(entry.labelCode, fontSize);
    const textX = cellX + (CELL_WIDTH - textWidth) / 2;
    const textY = qrY - 13;

    page.drawText(entry.labelCode, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: rgb(0.12, 0.12, 0.12),
    });
  }

  const bytes = await pdf.save();
  const pdfBytes = new Uint8Array(bytes);
  downloadBlob(new Blob([pdfBytes.buffer], { type: "application/pdf" }), filename);
}
