"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { X } from "lucide-react";

export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (result: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let codeReader: BrowserMultiFormatReader;

    async function startScanner() {
      try {
        codeReader = new BrowserMultiFormatReader();
        const videoInputDevices = await codeReader.listVideoInputDevices();
        
        if (videoInputDevices.length === 0) {
          setError("No camera found on this device.");
          return;
        }

        // Prefer environment-facing (back) camera if available
        const deviceId = videoInputDevices.find((device) =>
          device.label.toLowerCase().includes("back")
        )?.deviceId || videoInputDevices[0].deviceId;

        if (videoRef.current) {
          try {
            await codeReader.decodeFromConstraints(
              {
                video: {
                  deviceId: deviceId ? { exact: deviceId } : undefined,
                  facingMode: "environment",
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  advanced: [{ focusMode: "continuous" }] as any,
                },
              },
              videoRef.current,
              (result, error) => {
                if (result) {
                  onScan(result.getText());
                }
                if (error && !(error instanceof NotFoundException)) {
                  console.error("Scanner Error:", error);
                }
              }
            );
          } catch (err) {
            // Fallback to default device usage if constraints are unsupported
            codeReader.decodeFromVideoDevice(
              deviceId,
              videoRef.current,
              (result, error) => {
                if (result) {
                  onScan(result.getText());
                }
                if (error && !(error instanceof NotFoundException)) {
                  console.error("Scanner Error:", error);
                }
              }
            );
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to start camera.");
      }
    }

    startScanner();

    return () => {
      if (codeReader) {
        codeReader.reset();
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-black shadow-2xl">
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
          <p className="font-medium text-white shadow-black drop-shadow-md">Scan Barcode / QR</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition hover:bg-white/30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="flex h-64 items-center justify-center p-6 text-center text-red-400">
            {error}
          </div>
        ) : (
          <div className="relative aspect-[3/4] w-full bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              playsInline
              muted
            />
            {/* Scanner Overlay Guide */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="h-48 w-64 rounded-xl border-2 border-white/40 shadow-[0_0_0_999px_rgba(0,0,0,0.5)]">
                <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
