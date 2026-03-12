import { createHash } from "crypto";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const folder = "dukaanhq/onboarding/logos";

function createSignature(values: Record<string, string>) {
  const serialized = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${serialized}${apiSecret ?? ""}`).digest("hex");
}

async function ensureUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function POST(request: Request) {
  const user = await ensureUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ message: "Cloudinary is not configured." }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Logo file is required." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ message: "Only image uploads are allowed." }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ message: "Logo must be 5MB or smaller." }, { status: 400 });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const uploadSignature = createSignature({ folder, timestamp });
  const cloudinaryFormData = new FormData();

  cloudinaryFormData.append("file", file);
  cloudinaryFormData.append("api_key", apiKey);
  cloudinaryFormData.append("timestamp", timestamp);
  cloudinaryFormData.append("folder", folder);
  cloudinaryFormData.append("signature", uploadSignature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: cloudinaryFormData,
  });

  const result = (await response.json()) as {
    public_id?: string;
    secure_url?: string;
    original_filename?: string;
    error?: { message?: string };
  };

  if (!response.ok || !result.secure_url || !result.public_id) {
    return NextResponse.json(
      { message: result.error?.message ?? "Cloudinary upload failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    secureUrl: result.secure_url,
    publicId: result.public_id,
    originalFilename: result.original_filename ?? file.name,
  });
}

export async function DELETE(request: Request) {
  const user = await ensureUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ message: "Cloudinary is not configured." }, { status: 500 });
  }

  const body = (await request.json()) as { publicId?: string };

  if (!body.publicId) {
    return NextResponse.json({ message: "publicId is required." }, { status: 400 });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createSignature({ public_id: body.publicId, timestamp });
  const formData = new FormData();

  formData.append("public_id", body.publicId);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: formData,
  });

  const result = (await response.json()) as { result?: string; error?: { message?: string } };

  if (!response.ok) {
    return NextResponse.json(
      { message: result.error?.message ?? "Cloudinary delete failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: result.result === "ok" || result.result === "not found" });
}
