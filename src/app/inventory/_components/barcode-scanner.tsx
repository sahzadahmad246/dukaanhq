"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  NotFoundException,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
import { X, Zap, ZapOff } from "lucide-react";

export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (result: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  // Stabilize the onScan callback so the effect doesn't re-fire
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const newState = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: newState }] as any,
      });
      setTorchOn(newState);
    } catch {
      // torch not supported
    }
  }, [torchOn]);

  useEffect(() => {
    let codeReader: BrowserMultiFormatReader;
    let cancelled = false;

    async function startScanner() {
      try {
        // Specify the barcode formats we care about — this is the KEY fix.
        // IMEI barcodes on mobile boxes are almost always Code128, sometimes Code39 or ITF.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        codeReader = new BrowserMultiFormatReader(hints, 300); // scan every 300ms

        const videoInputDevices = await codeReader.listVideoInputDevices();

        if (videoInputDevices.length === 0) {
          setError("No camera found on this device.");
          return;
        }

        // Prefer environment-facing (back) camera
        const backCamera = videoInputDevices.find(
          (device) =>
            device.label.toLowerCase().includes("back") ||
            device.label.toLowerCase().includes("rear") ||
            device.label.toLowerCase().includes("environment")
        );
        const deviceId = backCamera?.deviceId || videoInputDevices[videoInputDevices.length - 1].deviceId;

        if (!videoRef.current || cancelled) return;

        // Use high resolution constraints for reading dense barcodes like IMEI
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: "environment",
            width: { ideal: 3840, min: 1280 },
            height: { ideal: 2160, min: 720 },
            frameRate: { ideal: 30 },
            // @ts-ignore – focusMode is not in the TS types
            focusMode: { ideal: "continuous" },
            // @ts-ignore
            focusDistance: { ideal: 0 },
          } as MediaTrackConstraints,
        };

        try {
          await codeReader.decodeFromConstraints(
            constraints,
            videoRef.current,
            (result, error) => {
              if (result) {
                onScanRef.current(result.getText());
              }
              if (error && !(error instanceof NotFoundException)) {
                console.error("Scanner Error:", error);
              }
            }
          );
        } catch {
          // Fallback: simpler constraints if advanced ones fail
          if (cancelled) return;
          await codeReader.decodeFromConstraints(
            {
              video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: "environment",
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            },
            videoRef.current!,
            (result, error) => {
              if (result) {
                onScanRef.current(result.getText());
              }
              if (error && !(error instanceof NotFoundException)) {
                console.error("Scanner Error:", error);
              }
            }
          );
        }

        // Grab the stream for torch control
        if (videoRef.current?.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          streamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          if (track) {
            const capabilities = track.getCapabilities?.() as any;
            if (capabilities?.torch) {
              setTorchAvailable(true);
            }
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to start camera."
          );
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      if (codeReader) {
        codeReader.reset();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-black shadow-2xl">
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
          <p className="font-medium text-white shadow-black drop-shadow-md">
            Scan Barcode / QR
          </p>
          <div className="flex items-center gap-2">
            {torchAvailable && (
              <button
                type="button"
                onClick={toggleTorch}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition hover:bg-white/30"
              >
                {torchOn ? (
                  <ZapOff className="h-5 w-5" />
                ) : (
                  <Zap className="h-5 w-5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition hover:bg-white/30"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
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
            {/* Scanner Overlay Guide — wider area for IMEI barcodes */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="h-28 w-[90%] rounded-xl border-2 border-white/50 shadow-[0_0_0_999px_rgba(0,0,0,0.45)]">
                <div className="absolute top-1/2 left-3 right-3 h-0.5 bg-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.9)] animate-pulse" />
              </div>
            </div>
            {/* Hint text */}
            <div className="absolute bottom-6 left-0 right-0 z-10 text-center pointer-events-none">
              <p className="text-xs text-white/70 font-medium drop-shadow-md">
                Align barcode inside the box · Hold steady
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
