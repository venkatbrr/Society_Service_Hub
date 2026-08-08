/**
 * Cloudinary upload utility for Wooru.
 *
 * Uses UNSIGNED upload preset (no API key required on client).
 * All images go to the `wooru` folder on Cloudinary.
 */

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

type UploadSource =
  | string
  | {
      uri: string;
      fileName?: string | null;
      mimeType?: string | null;
      file?: File | Blob | null;
    };

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

/**
 * Upload an image URI (from expo-image-picker) to Cloudinary.
 *
 * @param imageUri - Local file URI (e.g. file:///... or content://...)
 * @param subfolder - Optional subfolder inside `wooru/` (e.g. "listings", "products")
 * @returns The HTTPS URL of the uploaded image
 */
export async function uploadToCloudinary(
  source: UploadSource,
  subfolder?: string,
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env',
    );
  }

  const imageUri = typeof source === 'string' ? source : source.uri;
  const filename =
    (typeof source === 'string' ? null : source.fileName) ||
    imageUri.split('/').pop() ||
    'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  const mimeType =
    (typeof source === 'string' ? null : source.mimeType) ||
    (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

  const formData = new FormData();

  // On web, expo-image-picker provides a File object; upload it directly.
  if (typeof source !== 'string' && source.file) {
    formData.append('file', source.file);
  } else {
    formData.append('file', {
      uri: imageUri,
      name: filename,
      type: mimeType,
    } as any);
  }

  formData.append('upload_preset', UPLOAD_PRESET);

  if (subfolder) {
    formData.append('folder', `wooru/${subfolder}`);
  }

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = 'Image upload failed. Please try again.';
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      if (raw) {
        message = raw;
      }
    }
    console.error('Cloudinary upload error:', raw);
    throw new Error(message);
  }

  const data: CloudinaryUploadResult = await response.json();
  return data.secure_url;
}
