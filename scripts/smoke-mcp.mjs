import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const { query, limit } = parseArgs(process.argv.slice(2));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "mcp"],
  env: {
    ...process.env,
    ANNAS_DOWNLOAD_PATH:
      process.env.ANNAS_DOWNLOAD_PATH || path.join(process.cwd(), "downloads")
  }
});

const client = new Client({
  name: "annas-archive-mcp-smoke-test",
  version: "0.1.0"
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("TOOLS");
  for (const tool of tools.tools) {
    console.log(`- ${tool.name}: ${tool.description ?? ""}`);
  }

  const search = await client.callTool({
    name: "anna_search",
    arguments: {
      query,
      content: "book_any",
      limit
    }
  });

  console.log("\nSEARCH_RESULT");
  for (const item of search.content) {
    if (item.type === "text") {
      console.log(item.text);
    }
  }
} finally {
  await client.close();
}

function parseArgs(args) {
  const positionals = [];
  let limit = 3;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--limit" && args[index + 1]) {
      limit = Number.parseInt(args[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10);
      continue;
    }

    positionals.push(arg);
  }

  if (!Number.isFinite(limit) || limit < 1) {
    limit = 3;
  }

  return {
    query: positionals.join(" ").trim() || "Project Gutenberg",
    limit: Math.min(Math.trunc(limit), 50)
  };
}
