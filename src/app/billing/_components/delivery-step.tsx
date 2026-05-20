"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, Send, Layers, Pencil, AlertTriangle, Info, X } from "lucide-react";
import { SignaturePadModal } from "./signature-pad-modal";

type DeliveryMode = "download" | "auto_send" | "both";
type BasicPdfSignatureMode = "placeholders" | "electronic";

const DELIVERY_OPTIONS: Array<{
  id: DeliveryMode;
  label: string;
  description: string;
  icon: typeof Download;
  requiresStamp: boolean;
}> = [
  {
    id: "download",
    label: "Download PDF",
    description: "Download & print. Add stamp & signature physically.",
    icon: Download,
    requiresStamp: false,
  },
  {
    id: "auto_send",
    label: "Auto Send Invoice",
    description: "Digital stamp & customer signature on PDF.",
    icon: Send,
    requiresStamp: true,
  },
  {
    id: "both",
    label: "Both",
    description: "Auto-send with stamp + download clean copy.",
    icon: Layers,
    requiresStamp: true,
  },
];

export function DeliveryStep({
  deliveryMode,
  onDeliveryModeChange,
  shopStampUrl,
  customerSignatureDataUrl,
  onSignatureChange,
  basicPdfSignatureMode,
  onBasicPdfSignatureModeChange,
  settingsHref = "/settings#stamp",
  allowDigitalInvoiceAssets = true,
  allowWhatsappInvoiceSending = true,
}: {
  deliveryMode: DeliveryMode;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  shopStampUrl: string | null;
  customerSignatureDataUrl: string | null;
  onSignatureChange: (dataUrl: string | null) => void;
  basicPdfSignatureMode: BasicPdfSignatureMode;
  onBasicPdfSignatureModeChange: (mode: BasicPdfSignatureMode) => void;
  settingsHref?: string;
  allowDigitalInvoiceAssets?: boolean;
  allowWhatsappInvoiceSending?: boolean;
}) {
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [showDownloadInfo, setShowDownloadInfo] = useState(false);

  const needsSignature = deliveryMode === "auto_send" || deliveryMode === "both";
  const showDownloadToggle = deliveryMode === "download" || deliveryMode === "both";

  function handleModeChange(mode: DeliveryMode) {
    onDeliveryModeChange(mode);
    // Clear signature if switching to download-only
    if (mode === "download") {
      onSignatureChange(null);
    }
  }

  return (
    <>
      <section className="space-y-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Step 3</span>
          <h3 className="text-xl font-bold text-stone-900 mt-0.5">Invoice Delivery</h3>
        </div>

        {/* Delivery mode selector */}
        <div className="space-y-2">
          {DELIVERY_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = deliveryMode === option.id;
            const disabled =
              (option.requiresStamp && !shopStampUrl) ||
              (option.requiresStamp && !allowDigitalInvoiceAssets) ||
              (option.requiresStamp && !allowWhatsappInvoiceSending);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => !disabled && handleModeChange(option.id)}
                disabled={disabled}
                className={[
                  "w-full rounded-2xl border-2 px-4 py-4 text-left transition-all",
                  active
                    ? "border-stone-900 bg-stone-50 shadow-sm"
                    : disabled
                      ? "border-stone-100 bg-stone-50/50 opacity-50 cursor-not-allowed"
                      : "border-stone-200 bg-white hover:border-stone-300",
                ].join(" ")}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={["text-sm font-bold", active ? "text-stone-900" : "text-stone-700"].join(" ")}>
                        {option.label}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-stone-500 mt-0.5">{option.description}</p>
                  </div>
                  <div
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                      active ? "border-stone-900 bg-stone-900" : "border-stone-300",
                    ].join(" ")}
                  >
                    {active && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                </div>

                {option.id === "download" && showDownloadToggle ? (
                  <div
                    className="mt-4 rounded-xl border border-stone-200 bg-white px-3 py-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Signature area</p>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              setShowDownloadInfo(true);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                setShowDownloadInfo(true);
                              }
                            }}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-200 hover:text-stone-900"
                            aria-label="How signature area toggle works"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-stone-800">
                          {basicPdfSignatureMode === "electronic" ? "Electronic invoice note" : "Print placeholders"}
                        </p>
                      </div>
                      <span
                        role="switch"
                        tabIndex={0}
                        onClick={() => onBasicPdfSignatureModeChange(basicPdfSignatureMode === "placeholders" ? "electronic" : "placeholders")}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onBasicPdfSignatureModeChange(basicPdfSignatureMode === "placeholders" ? "electronic" : "placeholders");
                          }
                        }}
                        className={[
                          "relative h-7 w-12 shrink-0 rounded-full transition",
                          basicPdfSignatureMode === "electronic" ? "bg-stone-900" : "bg-stone-300",
                        ].join(" ")}
                        aria-label="Toggle electronic invoice note"
                        aria-checked={basicPdfSignatureMode === "electronic"}
                      >
                        <span
                          className={[
                            "absolute top-1 h-5 w-5 rounded-full bg-white transition",
                            basicPdfSignatureMode === "electronic" ? "left-6" : "left-1",
                          ].join(" ")}
                        />
                      </span>
                    </div>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Stamp missing warning */}
        {!allowDigitalInvoiceAssets ? (
          <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-stone-800">Basic PDF included in this plan</p>
              <p className="mt-0.5 text-xs text-stone-600">
                Signature and shop stamp PDFs are available on Growth and Pro.
              </p>
            </div>
          </div>
        ) : !allowWhatsappInvoiceSending ? (
          <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-stone-800">WhatsApp automation is a Pro feature</p>
              <p className="mt-0.5 text-xs text-stone-600">
                You can still download professional PDFs with signature and stamp on this plan.
              </p>
            </div>
          </div>
        ) : !shopStampUrl ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-800">Shop stamp required for auto-send</p>
              <p className="text-xs text-amber-700 mt-0.5">
                <Link href={settingsHref} className="underline font-semibold">
                  Upload your stamp in Settings
                </Link>{" "}
                to enable auto-send and both options.
              </p>
            </div>
          </div>
        ) : null}

        {/* Customer signature section — only when auto_send or both */}
        {needsSignature && (
          <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200 bg-stone-100/50">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Customer Signature</p>
            </div>
            <div className="bg-white p-4">
              {customerSignatureDataUrl ? (
                <div className="space-y-3">
                  <div className="relative w-full aspect-[3/1] rounded-xl border border-stone-200 bg-white overflow-hidden">
                    <Image
                      src={customerSignatureDataUrl}
                      alt="Customer Signature"
                      fill
                      className="object-contain p-3"
                      unoptimized
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-emerald-600">✓ Signature captured</p>
                    <button
                      type="button"
                      onClick={() => setIsSignatureModalOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
                    >
                      <Pencil className="h-3 w-3" />
                      Redraw
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-4">
                  <p className="text-sm font-medium text-stone-500 mb-3">
                    Customer needs to sign before submitting
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSignatureModalOpen(true)}
                    className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-stone-800"
                  >
                    Add Signature
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <SignaturePadModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={(dataUrl) => onSignatureChange(dataUrl)}
      />

      {showDownloadInfo ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/50 px-3 pb-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-stone-100 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-800">
                <Info className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-stone-950">Download PDF options</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  If this toggle is on, signature and stamp placeholders will be hidden. If it is off, those placeholders will show in the PDF for printing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadInfo(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
                aria-label="Close download PDF info"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <button
                type="button"
                onClick={() => setShowDownloadInfo(false)}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
