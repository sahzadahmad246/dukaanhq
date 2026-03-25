"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  NotFoundException,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
import { X, Zap, ZapOff } from "lucide-react";

type DetectedBarcode = {
  rawValue?: string;
};

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: {
    min?: number;
    max?: number;
  };
};

type TorchConstraintTrack = MediaStreamTrack & {
  applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean; zoom?: { min?: number; max?: number } };
};

function normalizeScannedValue(value: string) {
  const trimmed = value.trim();
  const imeiMatch = trimmed.match(/(?:IMEI\d?\s*[:\-]?\s*)?(\d{15})/i);
  if (imeiMatch?.[1]) {
    return imeiMatch[1];
  }

  const serialMatch = trimmed.match(/(?:S\/?N\s*[:\-]?\s*)([A-Z0-9\-\/]+)/i);
  if (serialMatch?.[1]) {
    return serialMatch[1];
  }

  return trimmed.replace(/\s+/g, " ");
}

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
  const frameRef = useRef<number | null>(null);
  const lastScanAtRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stabilize the onScan callback so the effect doesn't re-fire
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0] as TorchConstraintTrack | undefined;
    if (!track) return;
    try {
      const newState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: newState } as MediaTrackConstraintSet],
      });
      setTorchOn(newState);
    } catch {
      // torch not supported
    }
  }, [torchOn]);

  useEffect(() => {
    let codeReader: BrowserMultiFormatReader;
    let cancelled = false;
    let detector: { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> } | null = null;

    const emitScan = (rawValue: string) => {
      const now = Date.now();
      if (now - lastScanAtRef.current < 900) return;
      lastScanAtRef.current = now;
      onScanRef.current(normalizeScannedValue(rawValue));
    };

    const scanWithDetector = async () => {
      if (
        cancelled ||
        !detector ||
        !videoRef.current ||
        videoRef.current.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA
      ) {
        frameRef.current = window.requestAnimationFrame(() => {
          void scanWithDetector();
        });
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context || video.videoWidth === 0 || video.videoHeight === 0) {
        frameRef.current = window.requestAnimationFrame(() => {
          void scanWithDetector();
        });
        return;
      }

      const regions = [
        { x: 0.14, y: 0.34, width: 0.76, height: 0.14 },
        { x: 0.14, y: 0.48, width: 0.76, height: 0.14 },
        { x: 0.08, y: 0.28, width: 0.84, height: 0.44 },
        { x: 0, y: 0, width: 1, height: 1 },
      ];

      for (const region of regions) {
        const sx = Math.floor(video.videoWidth * region.x);
        const sy = Math.floor(video.videoHeight * region.y);
        const sw = Math.floor(video.videoWidth * region.width);
        const sh = Math.floor(video.videoHeight * region.height);

        canvas.width = sw;
        canvas.height = sh;
        context.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        try {
          const barcodes = await detector.detect(canvas);
          const detected = barcodes.find((barcode) => barcode.rawValue?.trim());
          if (detected?.rawValue) {
            emitScan(detected.rawValue);
            break;
          }
        } catch {
          // Ignore frame-level detector errors and keep scanning.
        }
      }

      frameRef.current = window.setTimeout(() => {
        void scanWithDetector();
      }, 120) as unknown as number;
    };

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

        codeReader = new BrowserMultiFormatReader(hints, 120);

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
        const advancedVideoConstraints: MediaTrackConstraints & {
          focusMode?: { ideal: string };
          focusDistance?: { ideal: number };
        } = {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: "environment",
          width: { ideal: 3840, min: 1280 },
          height: { ideal: 2160, min: 720 },
          frameRate: { ideal: 30 },
          focusMode: { ideal: "continuous" },
          focusDistance: { ideal: 0 },
        };

        const constraints: MediaStreamConstraints = {
          video: {
            ...advancedVideoConstraints,
          },
        };

        try {
          await codeReader.decodeFromConstraints(
            constraints,
            videoRef.current,
            (result, error) => {
              if (result) {
                emitScan(result.getText());
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
                emitScan(result.getText());
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
          const track = stream.getVideoTracks()[0] as TorchConstraintTrack | undefined;
          if (track) {
            const capabilities = track.getCapabilities?.() as ExtendedMediaTrackCapabilities | undefined;
            if (capabilities?.torch) {
              setTorchAvailable(true);
            }
            if (capabilities?.zoom) {
              try {
                const zoomValue = Math.min(capabilities.zoom.max ?? 2, Math.max(capabilities.zoom.min ?? 1, 2));
                await track.applyConstraints({
                  advanced: [{ zoom: zoomValue } as MediaTrackConstraintSet],
                });
              } catch {
                // zoom not supported well enough
              }
            }
          }
        }

        const DetectorCtor = (window as Window & {
          BarcodeDetector?: new (options?: { formats?: string[] }) => {
            detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
          };
        }).BarcodeDetector;

        if (DetectorCtor) {
          detector = new DetectorCtor({
            formats: ["code_128", "code_39", "itf", "codabar", "ean_13", "ean_8", "upc_a", "upc_e"],
          });
          void scanWithDetector();
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
      if (frameRef.current) {
        window.clearTimeout(frameRef.current);
        window.cancelAnimationFrame(frameRef.current);
      }
      if (codeReader) {
        codeReader.reset();
      }
    };
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
