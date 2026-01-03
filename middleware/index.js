import express from "express";
import cors from "cors";
import { z } from "zod";
import OpenAI from "openai";
import { OrgillMcpClient } from "./mcpClient.js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

(() => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootEnv = path.resolve(__dirname, "..", ".env");
  const localEnv = path.resolve(__dirname, ".env");
  if (fs.existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  } else if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
  } else {
    dotenv.config();
  }
})();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: false
  })
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const mcp = new OrgillMcpClient();

const ChatRequestSchema = z.object({
  message: z.string().min(1)
});

function buildToolsSchema() {
  return [
    {
      type: "function",
      function: {
        name: "getProductBySku",
        description: "Get a single product by SKU. Optionally filter by dealerId.",
        parameters: {
          type: "object",
          properties: {
            sku: { type: "string", description: "Product SKU" },
            dealerId: { type: "string", description: "Dealer ID to scope search" }
          },
          required: ["sku"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "searchProducts",
        description:
          "Flexible product search by text and filters. Supports dealerId, sku, mpn, upc, status, dcCode, region (US|CA), limit, offset.",
        parameters: {
          type: "object",
          properties: {
            dealerId: { type: "string" },
            query: { type: "string" },
            sku: { type: "string" },
            mpn: { type: "string" },
            upc: { type: "string" },
            status: { type: "string" },
            dcCode: { type: "string" },
            region: { type: "string", enum: ["US", "CA"] },
            limit: { type: "number" },
            offset: { type: "number" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "getDistributionCenters",
        description: "List DCs with counts; optionally filter by dealerId.",
        parameters: {
          type: "object",
          properties: {
            dealerId: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "getDealerInfo",
        description: "Dealer summary: productCount, statuses, DCs, files.",
        parameters: {
          type: "object",
          properties: {
            dealerId: { type: "string" }
          },
          required: ["dealerId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "getDealerProductCount",
        description: "Total product count for a dealer.",
        parameters: {
          type: "object",
          properties: {
            dealerId: { type: "string" }
          },
          required: ["dealerId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "listDealers",
        description: "List all loaded dealer IDs.",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "listLoadedFiles",
        description: "List loaded files grouped by dealer.",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "summarizeCatalog",
        description: "Overall analytics: totals by dealer/status/DC.",
        parameters: { type: "object", properties: {} }
      }
    }
  ];
}

async function executeToolCall(toolCall) {
  const name = toolCall.function?.name;
  let argsObj = {};
  try {
    argsObj = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};
  } catch {
    argsObj = {};
  }
  if (process.env.DEBUG_MCP === "1" || process.env.DEBUG_MCP === "true") {
    try {
      console.log(`[llm->mcp] tool=${name} args=${JSON.stringify(argsObj)}`);
    } catch {
      console.log(`[llm->mcp] tool=${name} args=[unserializable]`);
    }
  }
  const data = await mcp.callTool(name, argsObj);
  return { name, data, args: argsObj };
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = ChatRequestSchema.parse(req.body);
    await mcp.connect();

    const systemPrompt =
      "You are an assistant for a hardware retail product catalog. Use tools as needed. Keep answers concise and accurate.";

    const tools = buildToolsSchema();
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ];

    let finalAnswer = "";
    const usedTools = [];
    for (let i = 0; i < 3; i++) {
      const resp = await openai.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2
      });
      const msg = resp.choices[0]?.message;
      if (!msg) break;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push(msg);
        for (const tc of msg.tool_calls) {
          const { name, data, args } = await executeToolCall(tc);
          usedTools.push({ name, args });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name,
            content: JSON.stringify(data)
          });
        }
        continue;
      }

      finalAnswer = msg.content || "";
      break;
    }

    res.json({ ok: true, tools: usedTools, answer: finalAnswer });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, async () => {
  console.log(`Middleware listening on http://localhost:${port}`);
  try {
    await mcp.connect();
    console.log("Connected to MCP server.");
  } catch (e) {
    console.error("Failed to connect MCP server:", e);
  }
});


