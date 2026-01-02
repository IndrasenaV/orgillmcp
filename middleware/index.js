import express from "express";
import cors from "cors";
import { z } from "zod";
import OpenAI from "openai";
import { OrgillMcpClient } from "./mcpClient.js";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

(() => {
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

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = ChatRequestSchema.parse(req.body);
    await mcp.connect();

    let toolName = null;
    let toolArgs = {};

    const skuMatch = message.match(/\b(?:sku|product)\s*[:#]?\s*([A-Za-z0-9_-]{3,})\b/i);
    const dealerMatch = message.match(/\bdealer\s*[:#]?\s*([A-Za-z0-9_-]{2,})\b/i);
    const dcMatch = /\bdistribution (?:centers?|dc)s?\b/i.test(message);
    const searchMatch = message.match(/\bsearch\s+(?:for\s+)?(.+)/i);

    if (skuMatch) {
      toolName = "getProductBySku";
      toolArgs = { sku: skuMatch[1] };
      if (dealerMatch) toolArgs.dealerId = dealerMatch[1];
    } else if (dcMatch) {
      toolName = "getDistributionCenters";
      if (dealerMatch) toolArgs.dealerId = dealerMatch[1];
    } else if (dealerMatch && /info|summary|count|products/i.test(message)) {
      toolName = "getDealerInfo";
      toolArgs = { dealerId: dealerMatch[1] };
    } else if (searchMatch) {
      toolName = "searchProducts";
      toolArgs = { query: searchMatch[1].trim(), limit: 10 };
      if (dealerMatch) toolArgs.dealerId = dealerMatch[1];
    } else if (/summary|analytics|overview|totals?/i.test(message)) {
      toolName = "summarizeCatalog";
    } else {
      toolName = "searchProducts";
      toolArgs = { query: message, limit: 5 };
      if (dealerMatch) toolArgs.dealerId = dealerMatch[1];
    }

    const toolResult = await mcp.callTool(toolName, toolArgs);

    const systemPrompt =
      "You are an assistant for a hardware retail product catalog. Use the provided tool data to answer. Be concise and accurate.";
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
        {
          role: "system",
          content: `Tool: ${toolName}\nArgs: ${JSON.stringify(toolArgs)}\nResult JSON:\n${JSON.stringify(
            toolResult
          )}`
        }
      ],
      temperature: 0.2
    });

    const text = completion.choices[0]?.message?.content ?? "";
    res.json({
      ok: true,
      tool: { name: toolName, args: toolArgs },
      data: toolResult,
      answer: text
    });
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


