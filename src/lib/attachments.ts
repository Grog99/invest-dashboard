// Załączniki (obrazy) notatek — jedno źródło prawdy dla ścieżek na dysku,
// whitelisty MIME, sniffingu magic bytes i przetwarzania obrazów (sharp).
// Patrz docs/plans/zalaczniki-i-obrazy.md.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR } from "@/db";

export const ATTACHMENTS_DIR = path.join(DATA_DIR, "attachments");

// Klucz pliku na dysku = całkowite id wiersza note_attachments — jedyne
// wejście do budowy ścieżki, więc path traversal (../, itp.) jest niemożliwy
// u źródła. Oryginalny filename od użytkownika nigdy tu nie trafia.
export function attachmentPath(id: number): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Nieprawidłowe id załącznika: ${id}`);
  }
  return path.join(ATTACHMENTS_DIR, String(id));
}

export function ensureAttachmentsDir(): void {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// Sniffing magic bytes bez zewnętrznej zależności — file.type z FormData jest
// ustawiany przez przeglądarkę i łatwo go sfałszować (np. curl). Zwracany
// "prawdziwy" MIME zapisujemy do bazy, nie ufamy file.type przy serwowaniu.
export function sniffImageMime(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

const MAX_DIMENSION = 2000;

// Resize (maks. 2000px na dłuższym boku, tylko jeśli większe) + strip EXIF.
// sharp domyślnie NIE przenosi metadanych do wyniku, dopóki nie wywoła się
// .withMetadata() — re-encode już usuwa EXIF, bez osobnego kroku.
// GIF jest zwracany bez zmian — resize przez sharp bierze domyślnie tylko
// pierwszą klatkę i psuje animację.
export async function processImage(buf: Buffer, mime: string): Promise<Buffer> {
  if (mime === "image/gif") return buf;

  const image = sharp(buf, { failOn: "none" });
  const metadata = await image.metadata();
  if (
    (metadata.width ?? 0) > MAX_DIMENSION ||
    (metadata.height ?? 0) > MAX_DIMENSION
  ) {
    image.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  switch (mime) {
    case "image/png":
      return image.png().toBuffer();
    case "image/webp":
      return image.webp({ quality: 82 }).toBuffer();
    case "image/jpeg":
    default:
      return image.jpeg({ quality: 82 }).toBuffer();
  }
}
