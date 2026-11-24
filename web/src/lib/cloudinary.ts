import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

async function uploadFileToCloudinary(
  file: File,
  options?: { folder?: string; resourceType?: "image" | "raw"; format?: string; public_id?: string }
): Promise<{ url: string; public_id: string } | null> {
  if (!file || file.size === 0) return null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Promise((resolve) => {
      const format =
        options?.format ?? (file.type === "image/png" ? "png" : undefined);
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options?.folder ?? "dukaanhq_products",
          format,
          resource_type: options?.resourceType ?? "image",
          public_id: options?.public_id,
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error || !result) {
            console.error("Cloudinary upload failed", error);
            resolve(null);
          } else {
            resolve({
              url: result.secure_url,
              public_id: result.public_id,
            });
          }
        }
      );

      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error("Error preparing file for Cloudinary:", error);
    return null;
  }
}

export async function uploadImageToCloudinary(file: File): Promise<{ url: string; public_id: string } | null> {
  return uploadFileToCloudinary(file, { folder: "dukaanhq_products", resourceType: "image" });
}

export async function uploadRawFileToCloudinary(
  file: File,
  options?: { folder?: string; format?: string; public_id?: string }
): Promise<{ url: string; public_id: string } | null> {
  return uploadFileToCloudinary(file, {
    folder: options?.folder ?? "dukaanhq_documents",
    resourceType: "raw",
    format: options?.format,
    public_id: options?.public_id,
  });
}

export async function uploadImagesToCloudinary(
  files: File[]
): Promise<Array<{ url: string; public_id: string }>> {
  const uploads = await Promise.all(files.map((file) => uploadImageToCloudinary(file)));
  return uploads.filter((upload): upload is { url: string; public_id: string } => Boolean(upload));
}

export async function deleteImageFromCloudinary(publicId: string): Promise<boolean> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (error) {
    console.error("Cloudinary delete failed", error);
    return false;
  }
}

export async function deleteImagesFromCloudinary(publicIds: string[]): Promise<void> {
  await Promise.all(publicIds.map((publicId) => deleteImageFromCloudinary(publicId)));
}
