import fs from "fs/promises";
import path from "path";

const PROFILE_PHOTO_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const SUPPORTED_MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const ALLOWED_EXTENSIONS = Object.values(SUPPORTED_MIME_TO_EXTENSION);
const IMG_DIR = path.resolve(process.cwd(), "img");

type ParsedProfilePhoto = {
  extension: string;
  buffer: Buffer;
};

function sanitizeUserId(userId: string): string {
  const cleaned = String(userId ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned) {
    throw new Error("User ID tidak valid.");
  }

  return cleaned;
}

async function ensureImgDirExists(): Promise<void> {
  await fs.mkdir(IMG_DIR, { recursive: true });
}

function parseDataUrl(rawDataUrl: string): ParsedProfilePhoto {
  const dataUrl = String(rawDataUrl ?? "").trim();
  if (!dataUrl) {
    throw new Error("Foto profile tidak valid.");
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Format foto profile tidak valid.");
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  const extension = SUPPORTED_MIME_TO_EXTENSION[mimeType];
  if (!extension) {
    throw new Error("Format gambar tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.");
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    throw new Error("Foto profile kosong.");
  }

  if (buffer.length > PROFILE_PHOTO_MAX_SIZE_BYTES) {
    throw new Error("Ukuran foto profile maksimal 2MB.");
  }

  return { extension, buffer };
}

export async function getUserProfilePhotoRelativePath(userId: string): Promise<string | null> {
  const safeUserId = sanitizeUserId(userId);
  await ensureImgDirExists();

  for (const extension of ALLOWED_EXTENSIONS) {
    const fileName = `${safeUserId}.${extension}`;
    const absolutePath = path.join(IMG_DIR, fileName);
    try {
      await fs.access(absolutePath);
      return `/img/${fileName}`;
    } catch {
      // ignore and continue.
    }
  }

  return null;
}

export async function saveUserProfilePhoto(
  userId: string,
  profilePhotoDataUrl: string,
): Promise<string> {
  const safeUserId = sanitizeUserId(userId);
  const parsed = parseDataUrl(profilePhotoDataUrl);
  await ensureImgDirExists();

  const finalFileName = `${safeUserId}.${parsed.extension}`;
  const finalAbsolutePath = path.join(IMG_DIR, finalFileName);

  await Promise.all(
    ALLOWED_EXTENSIONS
      .filter((extension) => extension !== parsed.extension)
      .map(async (extension) => {
        const oldPath = path.join(IMG_DIR, `${safeUserId}.${extension}`);
        try {
          await fs.unlink(oldPath);
        } catch {
          // ignore missing files
        }
      }),
  );

  await fs.writeFile(finalAbsolutePath, parsed.buffer);
  return `/img/${finalFileName}`;
}
