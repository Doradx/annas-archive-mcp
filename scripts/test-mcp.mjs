import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED_TOOLS = ["anna_search", "anna_lookup", "anna_download"];
const TIMEOUT_MS = 10_000;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join("dist", "index.js"), "mcp"],
  env: {
    ...process.env,
    ANNAS_DOWNLOAD_PATH:
      process.env.ANNAS_DOWNLOAD_PATH || path.join(process.cwd(), "downloads")
  }
});

const client = new Client({
  name: "annas-archive-mcp-test",
  version: "0.1.0"
});

try {
  await withTimeout(client.connect(transport), "connect to MCP server");

  const { tools } = await withTimeout(client.listTools(), "list MCP tools");
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const toolName of EXPECTED_TOOLS) {
    const tool = toolsByName.get(toolName);
    assert.ok(tool, `missing MCP tool: ${toolName}`);
    assert.equal(
      typeof tool.inputSchema,
      "object",
      `${toolName} must expose an input schema`
    );
  }

  console.log(
    `MCP test passed. Tools exposed: ${[...toolsByName.keys()].sort().join(", ")}`
  );
} finally {
  await client.close().catch(() => {});
}

function withTimeout(promise, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Timed out while trying to ${label}`));
    }, TIMEOUT_MS);
  });

  return Promise.race([promise, timer]).finally(() => {
    clearTimeout(timeout);
  });
}
