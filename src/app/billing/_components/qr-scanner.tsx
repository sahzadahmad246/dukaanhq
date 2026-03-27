"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";
import { X, Zap, ZapOff } from "lucide-react";

type DetectedBarcode = {
  rawValue?: string;
};

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
};

type TorchConstraintTrack = MediaStreamTrack & {
  applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
};

export function QrScanner({
  onScan,
  onClose,
}: {
  onScan: (result: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  const frameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScanAtRef = useRef(0);
  const lastDetectorScanAtRef = useRef(0);

  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;

    const track = stream.getVideoTracks()[0] as TorchConstraintTrack | undefined;
    if (!track) return;

    try {
      const nextTorchState = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState } as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorchState);
    } catch {
      // Ignore unsupported torch.
    }
  }, [torchOn]);

  useEffect(() => {
    let codeReader: BrowserMultiFormatReader;
    let cancelled = false;
    let detector: { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> } | null = null;

    const emitScan = (rawValue: string) => {
      const normalized = rawValue.trim();
      if (!normalized) return;

      const now = Date.now();
      if (now - lastScanAtRef.current < 900) return;
      lastScanAtRef.current = now;
      onScanRef.current(normalized);
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

      const now = Date.now();
      if (now - lastDetectorScanAtRef.current < 180) {
        frameRef.current = window.requestAnimationFrame(() => {
          void scanWithDetector();
        });
        return;
      }
      lastDetectorScanAtRef.current = now;

      const region = { x: 0.18, y: 0.18, width: 0.64, height: 0.64 };
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
        }
      } catch {
        // Ignore frame-level detector errors and keep scanning.
      }

      frameRef.current = window.setTimeout(() => {
        void scanWithDetector();
      }, 120) as unknown as number;
    };

    async function startScanner() {
      try {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        codeReader = new BrowserMultiFormatReader(hints, 90);
        const videoInputDevices = await codeReader.listVideoInputDevices();

        if (videoInputDevices.length === 0) {
          setError("No camera found on this device.");
          return;
        }

        const backCamera = videoInputDevices.find(
          (device) =>
            device.label.toLowerCase().includes("back") ||
            device.label.toLowerCase().includes("rear") ||
            device.label.toLowerCase().includes("environment")
        );
        const deviceId = backCamera?.deviceId || videoInputDevices[videoInputDevices.length - 1].deviceId;

        if (!videoRef.current || cancelled) return;

        try {
          await codeReader.decodeFromConstraints(
            {
              video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: "environment",
                width: { ideal: 960, min: 640 },
                height: { ideal: 540, min: 480 },
                frameRate: { ideal: 18, max: 24 },
              },
            },
            videoRef.current,
            (result, decodeError) => {
              if (result) {
                emitScan(result.getText());
              }
              if (decodeError && !(decodeError instanceof NotFoundException)) {
                console.error("QR Scanner Error:", decodeError);
              }
            }
          );
        } catch {
          if (cancelled) return;
          await codeReader.decodeFromConstraints(
            {
              video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: "environment",
                width: { ideal: 960 },
                height: { ideal: 540 },
              },
            },
            videoRef.current!,
            (result, decodeError) => {
              if (result) {
                emitScan(result.getText());
              }
              if (decodeError && !(decodeError instanceof NotFoundException)) {
                console.error("QR Scanner Error:", decodeError);
              }
            }
          );
        }

        if (videoRef.current?.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          streamRef.current = stream;
          const track = stream.getVideoTracks()[0] as TorchConstraintTrack | undefined;
          if (track) {
            const capabilities = track.getCapabilities?.() as ExtendedMediaTrackCapabilities | undefined;
            if (capabilities?.torch) {
              setTorchAvailable(true);
            }
          }
        }

        const DetectorCtor = (window as Window & {
          BarcodeDetector?: new (options?: { formats?: string[] }) => {
            detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
          };
        }).BarcodeDetector;

        if (DetectorCtor) {
          detector = new DetectorCtor({ formats: ["qr_code"] });
          void scanWithDetector();
        }
      } catch (scannerError: unknown) {
        if (!cancelled) {
          setError(scannerError instanceof Error ? scannerError.message : "Failed to start camera.");
        }
      }
    }

    void startScanner();

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
          <p className="font-medium text-white shadow-black drop-shadow-md">Scan Billing QR</p>
          <div className="flex items-center gap-2">
            {torchAvailable ? (
              <button
                type="button"
                onClick={toggleTorch}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition hover:bg-white/30"
              >
                {torchOn ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
              </button>
            ) : null}
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
          <div className="flex h-64 items-center justify-center p-6 text-center text-red-400">{error}</div>
        ) : (
          <div className="relative aspect-[3/4] w-full bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="relative h-[58vw] max-h-64 w-[58vw] max-w-64 rounded-[2rem] border-2 border-white/60 shadow-[0_0_0_999px_rgba(0,0,0,0.45)]">
                <div className="absolute inset-4 rounded-[1.25rem] border border-dashed border-white/35" />
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-10 text-center">
              <p className="text-xs font-medium text-white/75 drop-shadow-md">
                Align the QR code inside the square and hold steady
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
