import fs from "node:fs/promises";
import path from "node:path";

const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const MD5_RE = /^[a-f0-9]{32}$/i;

export function isMd5(value: string): boolean {
  return MD5_RE.test(value.trim());
}

export function sanitizeFilename(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  const withoutUnsafeChars = raw
    .replace(UNSAFE_FILENAME_CHARS, "_")
    .replace(/\.\.+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const base = path.basename(withoutUnsafeChars) || fallback;
  return base.slice(0, 180);
}

export function normalizeWhitespace(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export async function uniqueFilePath(
  directory: string,
  fileName: string
): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  const safeName = sanitizeFilename(fileName, "download.bin");
  const parsed = path.parse(safeName);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidate = path.resolve(
      directory,
      `${parsed.name}${suffix}${parsed.ext}`
    );
    assertInsideDirectory(directory, candidate);

    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }

  throw new Error("Unable to allocate a unique download file name");
}

export function assertInsideDirectory(directory: string, target: string): void {
  const root = path.resolve(directory);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside download directory: ${resolved}`);
  }
}
