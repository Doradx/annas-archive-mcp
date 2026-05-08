import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AnnaClient } from "./anna.js";
import { CONTENT_KINDS, DOWNLOAD_IF_EXISTS, RIGHTS_BASES } from "./types.js";
import { jsonText } from "./utils.js";

export async function startMcpServer(): Promise<void> {
  const client = new AnnaClient();
  const server = new McpServer({
    name: "annas-archive-mcp",
    version: "0.1.1"
  });

  server.registerTool(
    "anna_search",
    {
      title: "Search Anna's Archive",
      description:
        "Search Anna's Archive metadata by title, author, topic, DOI, or keyword. Returns metadata and item page URLs.",
      inputSchema: {
        query: z.string().min(1),
        content: z.enum(CONTENT_KINDS).default("book_any"),
        limit: z.number().int().min(1).max(50).default(10)
      }
    },
    async ({ query, content, limit }) => {
      const results = await client.search({ query, content, limit });
      return {
        content: [
          {
            type: "text",
            text: jsonText({ count: results.length, results })
          }
        ]
      };
    }
  );

  server.registerTool(
    "anna_lookup",
    {
      title: "Lookup Anna's Archive Item",
      description:
        "Lookup one Anna's Archive item by MD5 hash, or resolve a DOI to the first matching MD5 item.",
      inputSchema: {
        identifier: z.string().min(1),
        identifierType: z.enum(["md5", "doi"]).optional()
      }
    },
    async ({ identifier, identifierType }) => {
      const result = await client.lookup({ identifier, identifierType });
      return {
        content: [
          {
            type: "text",
            text: jsonText(result)
          }
        ]
      };
    }
  );

  server.registerTool(
    "anna_download",
    {
      title: "Download Authorized Anna's Archive File",
      description:
        "Download a file by MD5 using Anna's Archive API with an explicit save directory, file name, and conflict strategy. Use only for public domain, Creative Commons, open access, owned, or otherwise authorized files.",
      inputSchema: {
        md5: z.string().regex(/^[a-f0-9]{32}$/i),
        rightsBasis: z
          .enum(RIGHTS_BASES)
          .default("owned_or_authorized")
          .describe("Authorization basis. Defaults to owned_or_authorized when the user has confirmed download rights."),
        rightsConfirmed: z
          .boolean()
          .describe("Must be true after confirming the requested file is legal to download."),
        directory: z
          .string()
          .min(1)
          .max(500)
          .optional()
          .describe(
            "Optional save directory. Absolute paths are used directly; relative paths are resolved inside ANNAS_DOWNLOAD_PATH."
          ),
        fileName: z
          .string()
          .min(1)
          .max(180)
          .optional()
          .describe("Optional output file name. If no extension is provided, the server infers one when possible."),
        ifExists: z
          .enum(DOWNLOAD_IF_EXISTS)
          .default("rename")
          .describe("rename creates a numbered file on conflict; fail rejects existing targets."),
        maxMegabytes: z.number().int().min(1).max(2048).optional()
      }
    },
    async ({
      md5,
      rightsBasis,
      rightsConfirmed,
      directory,
      fileName,
      ifExists,
      maxMegabytes
    }) => {
      const result = await client.download({
        md5,
        rightsBasis,
        rightsConfirmed,
        directory,
        fileName,
        ifExists,
        maxBytes: maxMegabytes ? maxMegabytes * 1024 * 1024 : undefined
      });
      return {
        content: [
          {
            type: "text",
            text: jsonText(result)
          }
        ]
      };
    }
  );

  await server.connect(new StdioServerTransport());
}
