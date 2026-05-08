#!/usr/bin/env node

import { AnnaClient } from "./anna.js";
import { startMcpServer } from "./server.js";
import { CONTENT_KINDS, RIGHTS_BASES, type ContentKind, type RightsBasis } from "./types.js";
import { isMd5, jsonText } from "./utils.js";

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

async function main(): Promise<void> {
  const [command = "mcp", ...rest] = process.argv.slice(2);

  if (command === "mcp") {
    await startMcpServer();
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const args = parseArgs(rest);
  const client = new AnnaClient();

  if (command === "search") {
    const query = args.positionals.join(" ").trim();
    if (!query) {
      throw new Error("search requires a query");
    }

    const content = readEnumFlag(
      args,
      "content",
      CONTENT_KINDS,
      "book_any"
    ) as ContentKind;
    const limit = readNumberFlag(args, "limit", 10);
    const results = await client.search({ query, content, limit });
    console.log(jsonText({ count: results.length, results }));
    return;
  }

  if (command === "lookup") {
    const identifier = args.positionals[0];
    if (!identifier) {
      throw new Error("lookup requires an MD5 hash or DOI");
    }

    const requestedType = readOptionalEnumFlag(args, "type", ["md5", "doi"] as const);
    const identifierType = requestedType ?? (isMd5(identifier) ? "md5" : "doi");
    const result = await client.lookup({ identifier, identifierType });
    console.log(jsonText(result));
    return;
  }

  if (command === "download") {
    const md5 = args.positionals[0];
    if (!md5) {
      throw new Error("download requires an MD5 hash");
    }

    const rightsBasis = readEnumFlag(
      args,
      "rights",
      RIGHTS_BASES,
      undefined
    ) as RightsBasis | undefined;
    if (!rightsBasis) {
      throw new Error(
        `download requires --rights ${RIGHTS_BASES.join("|")}`
      );
    }

    const rightsConfirmed = Boolean(args.flags.confirm ?? args.flags.yes);
    const maxMegabytes = readOptionalNumberFlag(args, "max-mb");
    const fileName =
      typeof args.flags.output === "string" ? args.flags.output : undefined;
    const result = await client.download({
      md5,
      rightsBasis,
      rightsConfirmed,
      fileName,
      maxBytes: maxMegabytes ? maxMegabytes * 1024 * 1024 : undefined
    });
    console.log(jsonText(result));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseArgs(tokens: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalsAt = withoutPrefix.indexOf("=");
    if (equalsAt >= 0) {
      flags[withoutPrefix.slice(0, equalsAt)] = withoutPrefix.slice(equalsAt + 1);
      continue;
    }

    const next = tokens[index + 1];
    if (next && !next.startsWith("--")) {
      flags[withoutPrefix] = next;
      index += 1;
    } else {
      flags[withoutPrefix] = true;
    }
  }

  return { positionals, flags };
}

function readNumberFlag(args: ParsedArgs, name: string, fallback: number): number {
  return readOptionalNumberFlag(args, name) ?? fallback;
}

function readOptionalNumberFlag(args: ParsedArgs, name: string): number | undefined {
  const value = args.flags[name];
  if (value === undefined || typeof value === "boolean") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }

  return parsed;
}

function readEnumFlag<T extends readonly string[]>(
  args: ParsedArgs,
  name: string,
  allowed: T,
  fallback: T[number] | undefined
): T[number] | undefined {
  const value = args.flags[name];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`--${name} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function readOptionalEnumFlag<T extends readonly string[]>(
  args: ParsedArgs,
  name: string,
  allowed: T
): T[number] | undefined {
  return readEnumFlag(args, name, allowed, undefined);
}

function printHelp(): void {
  console.log(`annas-archive-mcp-node

Commands:
  annas-archive-mcp mcp
  annas-archive-mcp search "query" [--content book_any] [--limit 10]
  annas-archive-mcp lookup <md5-or-doi> [--type md5|doi]
  annas-archive-mcp download <md5> --rights <basis> --confirm [--output file.pdf] [--max-mb 250]

Rights basis:
  ${RIGHTS_BASES.join(", ")}

Environment:
  ANNAS_BASE_URLS         comma-separated mirrors, default https://annas-archive.pk,https://annas-archive.gd,https://annas-archive.gl
  ANNAS_BASE_URL          legacy single mirror override
  ANNAS_SECRET_KEY        required for download
  ANNAS_DOWNLOAD_PATH     default ./downloads
  ANNAS_TIMEOUT_MS        default 30000
  ANNAS_MAX_DOWNLOAD_MB   default 250
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
