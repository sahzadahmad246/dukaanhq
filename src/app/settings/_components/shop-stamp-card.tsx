"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Cropper from "react-easy-crop";
import { LoaderCircle, Lock, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { updateShopStampAction } from "@/app/settings/actions";
import { getCroppedImg, type PixelCrop } from "@/lib/crop-image";

export function ShopStampCard({
  initialStampUrl,
  isAvailable,
}: {
  initialStampUrl: string | null;
  isAvailable: boolean;
}) {
  const [stampUrl, setStampUrl] = useState<string | null>(initialStampUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cropper State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  const onCropComplete = (_croppedArea: PixelCrop, croppedAreaPixels: PixelCrop) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setError(null);
    }
  };

  const handleUploadCroppedImage = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setIsUploading(true);
      setError(null);

      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (!croppedFile) {
        throw new Error("Failed to crop image. Please try again.");
      }

      const formData = new FormData();
      formData.append("stamp", croppedFile, "stamp.png");

      const response = await updateShopStampAction(formData);

      if (response.status === "error") {
        throw new Error(response.message);
      }

      toast.success(response.message || "Shop stamp updated successfully!");
      
      const previewUrl = URL.createObjectURL(croppedFile);
      setStampUrl(previewUrl);

      setImageSrc(null);
      setIsGuideModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong during upload.");
      toast.error(error || "Failed to upload shop stamp.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  useEffect(() => {
    if (window.location.hash === "#stamp") {
      const el = document.getElementById("stamp");
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
      }
    }
  }, []);

  return (
    <section id="stamp" className="grid gap-3 scroll-mt-24">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-stone-700">Shop Stamp & Signature</h2>
      </div>

      <div className="overflow-hidden rounded-[1.7rem] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] flex flex-col">
        {!isAvailable ? (
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Lock className="h-4 w-4 text-stone-400" aria-hidden="true" />
                Locked on your current plan
              </div>
              <p className="mt-1 text-sm leading-6 text-stone-500">
                Stamp and signature on PDF invoices are available on Growth and Pro plans.
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-400">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
        ) : !stampUrl ? (
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="text-sm font-medium text-stone-500">No stamp or signature uploaded yet.</div>
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
              aria-label="Add shop stamp"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="w-full flex-1 aspect-[3/1] relative border-b border-stone-100" style={{ backgroundColor: "#ffffff" }}>
              <Image 
                src={stampUrl} 
                alt="Shop Stamp" 
                fill 
                className="object-contain p-4" 
                unoptimized 
              />
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-t border-stone-100">
              <div className="text-sm font-medium text-stone-600">
                Official shop stamp and signature
              </div>
              <button
                type="button"
                onClick={() => setIsGuideModalOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"
                aria-label="Edit shop stamp"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>

      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {/* Guide Modal */}
      {isGuideModalOpen && !imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-stone-900">Setup Stamp & Signature</h3>
              <button
                type="button"
                onClick={() => setIsGuideModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-sm text-stone-600 mb-6 leading-relaxed">
              Upload a clear image containing both your <strong>Shop Stamp</strong> and <strong>Authorized Signature</strong> side-by-side. 
              You will be able to crop it in the next step.
              <span className="block mt-3 text-emerald-700 font-medium p-3 bg-emerald-50 rounded-xl">
                ✨ Tip: For best results on PDF invoices, use an image without a background! You can use ChatGPT or any free AI background remover tools to easily erase the background before uploading.
              </span>
            </p>
            
            <div className="space-y-4 mb-8 bg-stone-50 border border-stone-200 rounded-2xl p-5">
              <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Example Format</h4>
              <div className="w-full aspect-[3/1] relative flex items-center justify-center border border-stone-200 bg-white rounded-xl overflow-hidden p-2">
                <Image src="/stamp.png" alt="Example" fill className="object-contain p-2 opacity-80" />
              </div>
              <p className="text-xs text-stone-500 font-medium text-center">We will automatically enforce a wide landscape format (approx 1500x500) during cropping.</p>
            </div>
            
            <div className="flex justify-end gap-3 mt-auto">
              <button 
                type="button"
                onClick={() => setIsGuideModalOpen(false)}
                className="rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Select Image...
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cropper Modal */}
      {imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-stone-900">Crop Image</h3>
                <p className="text-sm text-stone-500 mt-1">Drag and zoom to perfectly frame your stamp and signature.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImageSrc(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition-colors"
                disabled={isUploading}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative w-full rounded-2xl overflow-hidden bg-stone-100" style={{ height: "400px" }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={3 / 1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 w-full sm:max-w-xs">
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-stone-900"
                />
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setImageSrc(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded-full border border-stone-200 px-6 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
                  disabled={isUploading}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleUploadCroppedImage}
                  disabled={isUploading || !croppedAreaPixels}
                  className="flex items-center gap-2 rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Save & Upload"
                  )}
                </button>
              </div>
            </div>
            {error && <p className="mt-4 text-sm font-medium text-rose-600 text-center">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
