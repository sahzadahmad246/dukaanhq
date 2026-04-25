"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { X, RotateCcw, RotateCw } from "lucide-react";

type SignatureOrientation = "normal" | "rotated";

export function SignaturePadModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 200 });
  const [orientation, setOrientation] = useState<SignatureOrientation>("normal");
  const [isEmpty, setIsEmpty] = useState(true);

  const updateSize = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const maxWidth = Math.max(260, rect.width - 32);
    const maxHeight = Math.max(220, rect.height - 96);
    const aspectRatio = orientation === "normal" ? 3 : 1 / 3;
    const width = Math.min(maxWidth, Math.round(maxHeight * aspectRatio), orientation === "normal" ? 900 : 360);
    const height = Math.round(width / aspectRatio);
    setCanvasSize({ width, height });
  }, [orientation]);

  useEffect(() => {
    if (!isOpen) return;
    // Delay to let the modal render before measuring
    const timer = setTimeout(updateSize, 100);
    window.addEventListener("resize", updateSize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateSize);
    };
  }, [isOpen, updateSize]);

  function handleClear() {
    sigRef.current?.clear();
    setIsEmpty(true);
  }

  function handleRotate() {
    setOrientation((current) => (current === "normal" ? "rotated" : "normal"));
    sigRef.current?.clear();
    setIsEmpty(true);
  }

  function handleSave() {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    const trimmedCanvas = sigRef.current.getTrimmedCanvas();
    const dataUrl =
      orientation === "rotated"
        ? rotateCanvasToHorizontal(trimmedCanvas).toDataURL("image/png")
        : trimmedCanvas.toDataURL("image/png");
    onSave(dataUrl);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
        <div>
          <h3 className="text-lg font-bold text-stone-900">Customer Signature</h3>
          <p className="mt-0.5 text-xs font-medium text-stone-500">
            {orientation === "normal" ? "Normal frame" : "Rotated frame"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRotate}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 transition"
            aria-label="Rotate signature frame"
            title="Rotate frame"
          >
            <RotateCw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 transition"
            aria-label="Close signature pad"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col items-center justify-center px-4 py-6 bg-stone-50"
      >
        <p className="text-sm font-medium text-stone-500 mb-4">
          Draw your signature inside the {orientation === "normal" ? "wide" : "rotated"} box below
        </p>
        <div
          className="rounded-2xl border-2 border-dashed border-stone-300 bg-white overflow-hidden shadow-sm"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        >
          <SignatureCanvas
            ref={sigRef}
            penColor="#5125B4"
            canvasProps={{
              width: canvasSize.width,
              height: canvasSize.height,
              style: {
                width: canvasSize.width,
                height: canvasSize.height,
                touchAction: "none",
              },
            }}
            onBegin={() => setIsEmpty(false)}
            backgroundColor="rgba(0,0,0,0)"
          />
        </div>
        <p className="mt-3 text-xs text-stone-400 font-medium">
          Use your finger, stylus, or mouse to sign
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-stone-200 bg-white px-5 py-4">
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition"
        >
          <RotateCcw className="h-4 w-4" />
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty}
          className="rounded-xl bg-stone-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save Signature
        </button>
      </div>
    </div>
  );
}

function rotateCanvasToHorizontal(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;

  const context = canvas.getContext("2d");
  if (!context) return source;

  context.translate(canvas.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(source, 0, 0);

  return canvas;
}
