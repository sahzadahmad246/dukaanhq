export type ScannerExpectedType = "IMEI" | "SERIAL" | "ANY" | "QR";

export function normalizeScannedValue(value: string, expectedType: ScannerExpectedType) {
  const trimmed = value.trim();
  // Never truncate an IMEISV or a longer barcode into a different IMEI.
  if (expectedType === "IMEI") {
    return trimmed.match(/^(?:IMEI(?:\s*[12])?\s*[:\-]?\s*)?(\d{15})$/i)?.[1] ?? "";
  }
  const imeiMatch = trimmed.match(/(?:IMEI\d?\s*[:\-]?\s*)?(\d{15})/i);
  if (imeiMatch?.[1]) {
    return imeiMatch[1];
  }

  const serialMatch = trimmed.match(/(?:S\/?N\s*[:\-]?\s*)([A-Z0-9\-\/]+)/i);
  if (serialMatch?.[1]) {
    return serialMatch[1];
  }

  if (expectedType === "SERIAL") {
    const compact = trimmed.replace(/\s+/g, " ");
    return compact.length > 0 ? compact : "";
  }

  if (expectedType === "QR") {
    return trimmed;
  }

  return trimmed.replace(/\s+/g, " ");
}
