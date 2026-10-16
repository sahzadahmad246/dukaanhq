"use client";
import { Download } from "lucide-react";
import { adminSecondary } from "./admin-ui";

export function ExportCsv({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number | null)[][] }) {
  function download() {
    const cell = (value: string | number | null) => {
      let text = String(value ?? "");
      // Tenant-supplied names must not execute spreadsheet formulas.
      if (typeof value !== "number" && /^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const blob = new Blob(["\uFEFF" + [headers, ...rows].map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <button type="button" onClick={download} disabled={!rows.length} className={adminSecondary}><Download className="h-4 w-4" />Export CSV</button>;
}
