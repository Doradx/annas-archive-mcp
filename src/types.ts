export const CONTENT_KINDS = [
  "book_any",
  "book_unknown",
  "book_fiction",
  "book_nonfiction",
  "journal",
  "comic",
  "magazine",
  "standards_document"
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export const RIGHTS_BASES = [
  "public_domain",
  "creative_commons",
  "open_access",
  "owned_or_authorized"
] as const;

export type RightsBasis = (typeof RIGHTS_BASES)[number];

export const DOWNLOAD_IF_EXISTS = ["rename", "fail"] as const;

export type DownloadIfExists = (typeof DOWNLOAD_IF_EXISTS)[number];

export interface AnnaSearchOptions {
  query: string;
  content?: ContentKind;
  limit?: number;
}

export interface AnnaItem {
  md5: string;
  title: string;
  authors?: string;
  publisher?: string;
  year?: string;
  language?: string;
  format?: string;
  size?: string;
  pageUrl: string;
  rawMeta?: string;
  rightsHints: string[];
}

export interface LookupOptions {
  identifier: string;
  identifierType?: "md5" | "doi";
}

export interface DownloadOptions {
  md5: string;
  rightsBasis: RightsBasis;
  rightsConfirmed: boolean;
  directory?: string;
  fileName?: string;
  ifExists?: DownloadIfExists;
  maxBytes?: number;
}

export interface DownloadResult {
  md5: string;
  title?: string;
  filePath: string;
  directory: string;
  fileName: string;
  bytesWritten: number;
  rightsBasis: RightsBasis;
  sourceUrl: string;
}

export interface FastDownloadResponse {
  download_url?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}
