import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

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
    const res = await client.callTool({ name, arguments: args });
    if ("structuredContent" in res && res.structuredContent) {
      return res.structuredContent;
    }
    const block = Array.isArray(res.content) ? res.content.find((c) => c.type === "text") : null;
    if (block?.text) {
      try {
        return JSON.parse(block.text);
      } catch {
        return { content: block.text };
      }
    }
    return res;
  }
}


