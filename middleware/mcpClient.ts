import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

type ToolCallArgs = Record<string, unknown>;

export class OrgillMcpClient {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = this._connectInternal();
    await this.connecting;
    this.connecting = null;
  }

  private async _connectInternal(): Promise<void> {
    const repoRoot = path.resolve(__dirname, "..");
    const tsxBin = path.resolve(__dirname, "../node_modules/.bin/tsx");
    const serverEntry = path.resolve(repoRoot, "mcp/src/index.ts");
    const env = {
      ...process.env,
      PRELOAD_GLOBS: process.env.PRELOAD_GLOBS || path.resolve(repoRoot, "data/*.jsonl")
    } as Record<string, string>;
    const transport = new StdioClientTransport({
      command: tsxBin,
      args: [serverEntry],
      env,
      cwd: repoRoot,
      stderr: "inherit"
    });
    const client = new Client({ name: "orgill-middleware", version: "0.1.0" });
    await client.connect(transport);
    this.client = client;
  }

  private ensure(): Client {
    if (!this.client) throw new Error("MCP client not connected");
    return this.client;
    }

  async callTool(name: string, args: ToolCallArgs = {}): Promise<any> {
    const client = this.ensure();
    const res = await client.callTool({ name, arguments: args });
    if ("structuredContent" in res && res.structuredContent) {
      return res.structuredContent;
    }
    // Fallback: try to parse first text block if present
    const block = Array.isArray((res as any).content) ? (res as any).content.find((c: any) => c.type === "text") : null;
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


