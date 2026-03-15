import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export async function uploadImageToCloudinary(file: File): Promise<{ url: string; public_id: string } | null> {
  if (!file || file.size === 0) return null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "dukaanhq_products" },
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

export async function deleteImageFromCloudinary(publicId: string): Promise<boolean> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (error) {
    console.error("Cloudinary delete failed", error);
    return false;
  }
}
