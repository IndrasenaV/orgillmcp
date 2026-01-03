import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class OrgillMcpClient {
  constructor() {
    this.client = null;
    this.connecting = null;
  }

  async connect() {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = this._connectInternal();
    await this.connecting;
    this.connecting = null;
  }

  async _connectInternal() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const repoRoot = path.resolve(__dirname, "..");
    const nodeBin = process.execPath;
    const serverEntry = path.resolve(repoRoot, "mcp/src/index.js");
    const env = {
      ...process.env,
      PRELOAD_GLOBS: process.env.PRELOAD_GLOBS || path.resolve(repoRoot, "data/*.jsonl")
    };
    const transport = new StdioClientTransport({
      command: nodeBin,
      args: [serverEntry],
      env,
      cwd: repoRoot,
      stderr: "inherit"
    });
    const client = new Client({ name: "orgill-middleware", version: "0.1.0" });
    await client.connect(transport);
    this.client = client;
  }

  ensure() {
    if (!this.client) throw new Error("MCP client not connected");
    return this.client;
  }

  async callTool(name, args = {}) {
    const client = this.ensure();
    const debug = process.env.DEBUG_MCP === "1" || process.env.DEBUG_MCP === "true";
    const startedAt = Date.now();
    if (debug) {
      try {
        console.log(`[mcp] call ${name} args=${JSON.stringify(args)}`);
      } catch {
        console.log(`[mcp] call ${name} args=[unserializable]`);
      }
    }
    const res = await client.callTool({ name, arguments: args });
    if ("structuredContent" in res && res.structuredContent) {
      if (debug) {
        const elapsed = Date.now() - startedAt;
        const sizeHint = Array.isArray(res.structuredContent?.results)
          ? res.structuredContent.results.length
          : Object.keys(res.structuredContent || {}).length;
        console.log(`[mcp] ok ${name} elapsedMs=${elapsed} size=${sizeHint}`);
      }
      return res.structuredContent;
    }
    const block = Array.isArray(res.content) ? res.content.find((c) => c.type === "text") : null;
    if (block?.text) {
      try {
        const parsed = JSON.parse(block.text);
        if (debug) {
          const elapsed = Date.now() - startedAt;
          const sizeHint = Array.isArray(parsed?.results) ? parsed.results.length : Object.keys(parsed || {}).length;
          console.log(`[mcp] ok ${name} elapsedMs=${elapsed} size=${sizeHint}`);
        }
        return parsed;
      } catch {
        if (debug) {
          const elapsed = Date.now() - startedAt;
          console.log(`[mcp] ok ${name} elapsedMs=${elapsed} size=text`);
        }
        return { content: block.text };
      }
    }
    if (debug) {
      const elapsed = Date.now() - startedAt;
      console.log(`[mcp] ok ${name} elapsedMs=${elapsed} size=unknown`);
    }
    return res;
  }
}


