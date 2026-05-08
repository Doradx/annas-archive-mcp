import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { loadConfig, type AnnaConfig } from "./config.js";
import {
  type AnnaItem,
  type AnnaSearchOptions,
  CONTENT_KINDS,
  type DownloadOptions,
  type DownloadResult,
  type FastDownloadResponse,
  type LookupOptions
} from "./types.js";
import {
  allocateDownloadPath,
  assertInsideDirectory,
  isMd5,
  jsonText,
  normalizeWhitespace,
  sanitizeFilename
} from "./utils.js";

const USER_AGENT =
  "Mozilla/5.0 (compatible; annas-archive-mcp/0.1.1; +https://modelcontextprotocol.io)";

const FORMAT_RE =
  /\b(PDF|EPUB|MOBI|AZW3|AZW|DJVU|CBZ|CBR|FB2|DOCX?|TXT|RTF)\b/i;
const SIZE_RE = /\b\d+(?:\.\d+)?\s*(?:KB|MB|GB|TB)\b/i;
const YEAR_RE = /\b(1[5-9]\d{2}|20\d{2}|2100)\b/;

const CONTENT_KIND_SET = new Set<string>(CONTENT_KINDS);

interface MirrorResponse {
  response: Response;
  url: URL;
  baseUrl: URL;
}

interface MirrorText {
  text: string;
  url: URL;
  baseUrl: URL;
}

export class AnnaClient {
  private readonly config: AnnaConfig;

  constructor(config: AnnaConfig = loadConfig()) {
    this.config = config;
  }

  async search(options: AnnaSearchOptions): Promise<AnnaItem[]> {
    const query = options.query.trim();
    if (!query) {
      throw new Error("query is required");
    }

    const content = options.content ?? "book_any";
    if (!CONTENT_KIND_SET.has(content)) {
      throw new Error(`Unsupported content kind: ${content}`);
    }

    const limit = clampLimit(options.limit ?? 10);
    const params = new URLSearchParams({
      q: query,
      content
    });
    const { text, baseUrl } = await this.fetchTextFromMirrors("/search", params);
    return this.parseSearchHtml(text, limit, baseUrl);
  }

  async lookup(options: LookupOptions): Promise<AnnaItem> {
    const identifier = options.identifier.trim();
    const identifierType =
      options.identifierType ?? (isMd5(identifier) ? "md5" : "doi");

    if (identifierType === "md5") {
      return this.lookupMd5(identifier);
    }

    return this.lookupDoi(identifier);
  }

  async lookupMd5(md5: string): Promise<AnnaItem> {
    const cleanMd5 = md5.trim().toLowerCase();
    if (!isMd5(cleanMd5)) {
      throw new Error("identifier must be a 32 character MD5 hash");
    }

    const { text, url } = await this.fetchTextFromMirrors(`/md5/${cleanMd5}`);
    return this.parseDetailHtml(text, cleanMd5, url.href);
  }

  async lookupDoi(doi: string): Promise<AnnaItem> {
    const cleanDoi = doi.trim();
    if (!cleanDoi) {
      throw new Error("doi is required");
    }

    const { text: html } = await this.fetchTextFromMirrors(
      `/scidb/${encodeURIComponent(cleanDoi)}`
    );
    const $ = cheerio.load(html);
    const href = $("a[href^='/md5/']").first().attr("href");
    const md5 = extractMd5FromHref(href);
    if (!md5) {
      throw new Error(`No MD5 result found for DOI: ${cleanDoi}`);
    }

    const item = await this.lookupMd5(md5);
    return {
      ...item,
      rawMeta: normalizeWhitespace(`${item.rawMeta ?? ""} DOI: ${cleanDoi}`)
    };
  }

  async download(options: DownloadOptions): Promise<DownloadResult> {
    assertDownloadIsAuthorized(options);

    const md5 = options.md5.trim().toLowerCase();
    if (!isMd5(md5)) {
      throw new Error("md5 must be a 32 character MD5 hash");
    }

    let item: AnnaItem | undefined;
    try {
      item = await this.lookupMd5(md5);
    } catch {
      item = undefined;
    }

    const directUrl = await this.fetchFastDownloadUrl(md5);
    const response = await this.fetchAbsoluteResponse(new URL(directUrl));
    if (!response.ok) {
      throw new Error(`Download failed with HTTP ${response.status}`);
    }

    const maxBytes = Math.min(
      options.maxBytes ?? this.config.maxDownloadBytes,
      this.config.maxDownloadBytes
    );
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error(
        `Download is larger than limit: ${contentLength} bytes > ${maxBytes} bytes`
      );
    }

    const targetDirectory = resolveDownloadDirectory(
      this.config.downloadPath,
      options.directory
    );
    const extension = inferExtension(response, item);
    const fileName = chooseDownloadFileName(options.fileName, item, md5, extension);
    const filePath = await allocateDownloadPath(
      targetDirectory,
      fileName,
      options.ifExists ?? "rename"
    );
    const bytesWritten = await writeResponseBody(response, filePath, maxBytes);

    return {
      md5,
      title: item?.title,
      filePath,
      directory: path.dirname(filePath),
      fileName: path.basename(filePath),
      bytesWritten,
      rightsBasis: options.rightsBasis,
      sourceUrl: directUrl
    };
  }

  private async fetchFastDownloadUrl(md5: string): Promise<string> {
    if (!this.config.secretKey) {
      throw new Error("ANNAS_SECRET_KEY is required for downloads");
    }

    const params = new URLSearchParams({
      md5,
      key: this.config.secretKey
    });
    const { response, url } = await this.fetchResponseFromMirrors(
      "/dyn/api/fast_download.json",
      params
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Fast download API failed with HTTP ${response.status} from ${url.origin}: ${text.slice(0, 300)}`
      );
    }

    let payload: FastDownloadResponse;
    try {
      payload = JSON.parse(text) as FastDownloadResponse;
    } catch (error) {
      throw new Error(`Fast download API returned invalid JSON: ${String(error)}`);
    }

    if (payload.error) {
      throw new Error(`Fast download API error: ${payload.error}`);
    }

    const downloadUrl =
      typeof payload.download_url === "string"
        ? payload.download_url
        : firstHttpUrl(payload);
    if (!downloadUrl) {
      throw new Error(`Fast download API returned no URL: ${jsonText(payload)}`);
    }

    return downloadUrl;
  }

  private parseSearchHtml(html: string, limit: number, baseUrl: URL): AnnaItem[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const items: AnnaItem[] = [];

    $("a[href^='/md5/'], a[href*='/md5/']").each((_, element) => {
      if (items.length >= limit) {
        return false;
      }

      const href = $(element).attr("href");
      const md5 = extractMd5FromHref(href);
      if (!md5 || seen.has(md5)) {
        return;
      }
      seen.add(md5);

      const container = findResultContainer($, $(element), md5);
      const item = parseItemFromContainer(
        $,
        container,
        md5,
        new URL(`/md5/${md5}`, baseUrl).href
      );
      if (item.title) {
        items.push(item);
      }
    });

    return items;
  }

  private parseDetailHtml(html: string, md5: string, pageUrl: string): AnnaItem {
    const $ = cheerio.load(html);
    const title =
      normalizeWhitespace($("h1").first().text()) ||
      normalizeWhitespace($("title").first().text()).replace(/\s+-\s+Anna.*$/i, "");
    const description = normalizeWhitespace(
      $("meta[name='description']").attr("content")
    );
    const bodyText = normalizeWhitespace($("body").text()).slice(0, 4000);
    const rawMeta = normalizeWhitespace(`${description} ${bodyText}`);
    const parsed = parseMetadata(rawMeta);

    return {
      md5,
      title: title || md5,
      authors: parsed.authors,
      publisher: parsed.publisher,
      year: parsed.year,
      language: parsed.language,
      format: parsed.format,
      size: parsed.size,
      pageUrl,
      rawMeta: rawMeta.slice(0, 1000),
      rightsHints: detectRightsHints(rawMeta)
    };
  }

  private async fetchTextFromMirrors(
    pathname: string,
    params?: URLSearchParams
  ): Promise<MirrorText> {
    const { response, url, baseUrl } = await this.fetchResponseFromMirrors(
      pathname,
      params
    );
    return {
      text: await response.text(),
      url,
      baseUrl
    };
  }

  private async fetchResponseFromMirrors(
    pathname: string,
    params?: URLSearchParams
  ): Promise<MirrorResponse> {
    const errors: string[] = [];

    for (const baseUrl of this.config.baseUrls) {
      const url = new URL(pathname, baseUrl);
      params?.forEach((value, key) => url.searchParams.set(key, value));

      try {
        const response = await this.fetchAbsoluteResponse(url);
        if (response.ok) {
          return { response, url, baseUrl };
        }

        const body = await response.text().catch(() => "");
        errors.push(
          `${url.origin}${url.pathname} -> HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`
        );
      } catch (error) {
        errors.push(
          `${url.origin}${url.pathname} -> ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    throw new Error(
      `All Anna's Archive mirrors failed for ${pathname}: ${errors.join("; ")}`
    );
  }

  private async fetchAbsoluteResponse(url: URL): Promise<Response> {
    return fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/json,application/octet-stream;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });
  }
}

function findResultContainer(
  $: cheerio.CheerioAPI,
  anchor: cheerio.Cheerio<AnyNode>,
  md5: string
): cheerio.Cheerio<AnyNode> {
  const parents = anchor.parents().toArray();
  for (const parent of parents) {
    const candidate = $(parent);
    const text = normalizeWhitespace(candidate.text());
    if (
      text.length >= 3 &&
      text.length <= 3000 &&
      candidate.find(`a[href*='/md5/${md5}']`).length > 0
    ) {
      return candidate;
    }
  }

  return anchor.parent();
}

function parseItemFromContainer(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
  md5: string,
  pageUrl: string
): AnnaItem {
  const linkTexts = container
    .find("a[href^='/md5/'], a[href*='/md5/']")
    .map((_, link) => normalizeWhitespace($(link).text()))
    .get()
    .filter(Boolean);
  const title = linkTexts.sort((a, b) => b.length - a.length)[0] ?? md5;

  const rawMeta = normalizeWhitespace(container.text());
  const parsed = parseMetadata(rawMeta);
  const authors = normalizeWhitespace(
    container
      .find("a[href^='/search']")
      .filter((_, link) => $(link).find("span[class*='mdi--user-edit']").length > 0)
      .text()
  );
  const publisher = normalizeWhitespace(
    container
      .find("a[href^='/search']")
      .filter((_, link) => $(link).find("span[class*='mdi--company']").length > 0)
      .text()
  );

  return {
    md5,
    title,
    authors: authors || parsed.authors,
    publisher: publisher || parsed.publisher,
    year: parsed.year,
    language: parsed.language,
    format: parsed.format,
    size: parsed.size,
    pageUrl,
    rawMeta: rawMeta.slice(0, 1000),
    rightsHints: detectRightsHints(rawMeta)
  };
}

function parseMetadata(raw: string): Partial<AnnaItem> {
  const format = raw.match(FORMAT_RE)?.[1]?.toUpperCase();
  const size = raw.match(SIZE_RE)?.[0]?.replace(/\s+/g, "");
  const year = raw.match(YEAR_RE)?.[0];
  const language =
    raw.match(/([A-Z][A-Za-z -]{2,30})\s+\[[a-z]{2,3}\]/)?.[1]?.trim() ??
    raw.match(/\b(English|Chinese|French|German|Spanish|Russian|Japanese)\b/i)?.[1];

  return {
    format,
    size,
    year,
    language
  };
}

function detectRightsHints(raw: string): string[] {
  const hints: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["public_domain", /public domain|project gutenberg|gutenberg/i],
    ["creative_commons", /creative commons|\bcc[- ]?by\b|\bcc[- ]?0\b/i],
    ["open_access", /open access|doaj|arxiv|pubmed central|\bpmc\b/i],
    ["internet_archive", /internet archive|archive\.org/i]
  ];

  for (const [label, pattern] of checks) {
    if (pattern.test(raw)) {
      hints.push(label);
    }
  }

  return hints;
}

function extractMd5FromHref(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  const match = href.match(/\/md5\/([a-f0-9]{32})/i);
  return match?.[1]?.toLowerCase();
}

function assertDownloadIsAuthorized(options: DownloadOptions): void {
  if (!options.rightsConfirmed) {
    throw new Error(
      "Download rejected. Set rightsConfirmed=true only for public domain, Creative Commons, open access, or otherwise authorized files."
    );
  }
}

function resolveDownloadDirectory(
  defaultDirectory: string,
  requestedDirectory: string | undefined
): string {
  const trimmed = requestedDirectory?.trim();
  if (!trimmed) {
    return path.resolve(defaultDirectory);
  }

  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }

  const candidate = path.resolve(defaultDirectory, trimmed);
  assertInsideDirectory(defaultDirectory, candidate);
  return candidate;
}

function chooseDownloadFileName(
  requestedFileName: string | undefined,
  item: AnnaItem | undefined,
  md5: string,
  extension: string
): string {
  const fallback = `${item?.title ?? md5}${extension}`;
  const requested = requestedFileName?.trim();
  if (!requested) {
    return sanitizeFilename(fallback, `${md5}${extension}`);
  }

  const fileName = path.extname(requested) ? requested : `${requested}${extension}`;
  return sanitizeFilename(fileName, `${md5}${extension}`);
}

function inferExtension(response: Response, item: AnnaItem | undefined): string {
  const contentDisposition = response.headers.get("content-disposition");
  const fileName = contentDisposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1];
  const fromDisposition = fileName ? path.extname(decodeURIComponent(fileName)) : "";
  if (fromDisposition) {
    return fromDisposition;
  }

  if (item?.format) {
    return `.${item.format.toLowerCase()}`;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("pdf")) {
    return ".pdf";
  }
  if (contentType.includes("epub")) {
    return ".epub";
  }
  if (contentType.includes("zip")) {
    return ".zip";
  }

  return ".bin";
}

async function writeResponseBody(
  response: Response,
  filePath: string,
  maxBytes: number
): Promise<number> {
  if (!response.body) {
    throw new Error("Download response has no body");
  }

  let bytesWritten = 0;
  const limitStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesWritten += chunk.length;
      if (bytesWritten > maxBytes) {
        callback(
          new Error(
            `Download exceeded limit: ${bytesWritten} bytes > ${maxBytes} bytes`
          )
        );
        return;
      }
      callback(null, chunk);
    }
  });

  let success = false;
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      limitStream,
      createWriteStream(filePath, { flags: "wx" })
    );
    success = true;
    return bytesWritten;
  } finally {
    if (!success) {
      await fs.rm(filePath, { force: true });
    }
  }
}

function firstHttpUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }

  for (const child of Object.values(value)) {
    const found = firstHttpUrl(child);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 10;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 50);
}
