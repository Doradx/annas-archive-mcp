import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_BASE_URLS = [
  "https://annas-archive.pk",
  "https://annas-archive.gd",
  "https://annas-archive.gl"
];
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_DOWNLOAD_MB = 250;

export interface AnnaConfig {
  baseUrls: URL[];
  secretKey?: string;
  downloadPath: string;
  timeoutMs: number;
  maxDownloadBytes: number;
}

export function loadConfig(): AnnaConfig {
  const timeoutMs = readPositiveInteger(
    "ANNAS_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS
  );
  const maxDownloadMb = readPositiveInteger(
    "ANNAS_MAX_DOWNLOAD_MB",
    DEFAULT_MAX_DOWNLOAD_MB
  );

  return {
    baseUrls: normalizeBaseUrls(
      process.env.ANNAS_BASE_URLS ??
        process.env.ANNAS_BASE_URL ??
        DEFAULT_BASE_URLS.join(",")
    ),
    secretKey: emptyToUndefined(process.env.ANNAS_SECRET_KEY),
    downloadPath: path.resolve(
      process.env.ANNAS_DOWNLOAD_PATH ?? "./downloads"
    ),
    timeoutMs,
    maxDownloadBytes: maxDownloadMb * 1024 * 1024
  };
}

function normalizeBaseUrls(input: string): URL[] {
  const seen = new Set<string>();
  const urls = input
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeBaseUrl)
    .filter((url) => {
      if (seen.has(url.origin)) {
        return false;
      }
      seen.add(url.origin);
      return true;
    });

  if (urls.length === 0) {
    throw new Error("ANNAS_BASE_URLS must contain at least one mirror URL");
  }

  return urls;
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function normalizeBaseUrl(input: string): URL {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  return new URL(url.origin);
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
