import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogLoader } from "./lib/loader.js";
import { LoadFilesInputSchema, SearchProductsInputSchema } from "./types.js";
import { filterProducts, summarizeDistributionCenters, summarizeStatuses } from "./lib/search.js";

const loader = new CatalogLoader();
const server = new McpServer({
  name: "orgill-product-mcp-server",
  version: "0.1.0"
});

function ok(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result
  };
}

server.registerTool("loadFiles", {
  description:
    "Load one or more JSON/JSONL files into memory. Accepts glob patterns. Dealer can be inferred from filename 'products-<dealer>-*.json(l)'.",
  inputSchema: LoadFilesInputSchema
}, async (args) => {
  const parsed = LoadFilesInputSchema.parse(args);
  if (parsed.clearBeforeLoad) {
    loader.clear();
  }
  const count = await loader.loadFiles(parsed.paths, {
    dealerId: parsed.dealerId,
    inferDealerFromFilename: parsed.inferDealerFromFilename
  });
  return ok({ loaded: count });
});

server.registerTool("listDealers", {
  description: "List dealer IDs loaded in memory.",
  inputSchema: z.object({})
}, async () => {
  const st = loader.getState();
  const dealers = Array.from(st.productsByDealer.keys());
  return ok({ dealers });
});

server.registerTool("getDealerInfo", {
  description:
    "Get high-level dealer summary including product count, statuses, distribution centers and source files.",
  inputSchema: z.object({
    dealerId: z.string()
  })
}, async (args) => {
  const { dealerId } = z.object({ dealerId: z.string() }).parse(args);
  const st = loader.getState();
  const products = st.productsByDealer.get(dealerId) ?? [];
  const statuses = summarizeStatuses(products);
  const dcCounts = summarizeDistributionCenters(products);
  const ds = {
    dealerId,
    productCount: products.length,
    statuses,
    distributionCenters: Object.keys(dcCounts),
    files: Array.from(st.filesByDealer.get(dealerId) ?? [])
  };
  return ok(ds);
});

server.registerTool("getDealerProductCount", {
  description: "Return total product count for the specified dealer.",
  inputSchema: z.object({
    dealerId: z.string()
  })
}, async (args) => {
  const { dealerId } = z.object({ dealerId: z.string() }).parse(args);
  const st = loader.getState();
  const count = (st.productsByDealer.get(dealerId) ?? []).length;
  return ok({ dealerId, count });
});

server.registerTool("getProductBySku", {
  description: "Get a single product by SKU. Optionally filter by dealerId.",
  inputSchema: z.object({
    sku: z.string(),
    dealerId: z.string().optional()
  })
}, async (args) => {
  const { sku, dealerId } = z.object({ sku: z.string(), dealerId: z.string().optional() }).parse(args);
  const st = loader.getState();
  let pool = st.products;
  if (dealerId) {
    pool = st.productsByDealer.get(dealerId) ?? [];
  }
  const found = pool.find((p) => p.sku === sku);
  return ok({ product: found ?? null });
});

server.registerTool("searchProducts", {
  description:
    "Flexible search by text and filters. Filters: dealerId, sku, mpn, upc, status, dcCode, region (US|CA). Supports pagination.",
  inputSchema: SearchProductsInputSchema
}, async (args) => {
  const input = SearchProductsInputSchema.parse(args);
  const st = loader.getState();
  const filtered = filterProducts(st.products, input);
  const { offset, limit } = input;
  const page = filtered.slice(offset, offset + limit);
  return ok({
    total: filtered.length,
    offset,
    limit,
    results: page
  });
});

server.registerTool("getDistributionCenters", {
  description:
    "List distribution centers observed in data, with counts of how many products are available per DC. Optionally filter by dealer.",
  inputSchema: z.object({
    dealerId: z.string().optional()
  })
}, async (args) => {
  const { dealerId } = z.object({ dealerId: z.string().optional() }).parse(args);
  const st = loader.getState();
  const pool = dealerId ? st.productsByDealer.get(dealerId) ?? [] : st.products;
  const dcCounts = summarizeDistributionCenters(pool);
  return ok(dcCounts);
});

server.registerTool("summarizeCatalog", {
  description:
    "High-level analytics summary: totals by dealer, by status, and by distribution center. Useful for LLM planning.",
  inputSchema: z.object({})
}, async () => {
  const st = loader.getState();
  const byDealer = {};
  for (const [dealer, list] of st.productsByDealer.entries()) {
    byDealer[dealer] = list.length;
  }
  const byStatus = summarizeStatuses(st.products);
  const byDc = summarizeDistributionCenters(st.products);
  const summary = {
    totalProducts: st.products.length,
    byDealer,
    byStatus,
    byDc,
    sampleSkus: st.products.slice(0, 10).map((p) => p.sku)
  };
  return ok(summary);
});

server.registerTool("listLoadedFiles", {
  description: "List all files that have been loaded, grouped by dealer.",
  inputSchema: z.object({})
}, async () => {
  const st = loader.getState();
  const files = {};
  for (const [dealer, set] of st.filesByDealer.entries()) {
    files[dealer] = Array.from(set);
  }
  return ok(files);
});

async function main() {
  const envGlobs = (process.env.PRELOAD_GLOBS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, "../..");
  const defaultGlobs = [
    path.resolve(projectRoot, "data/*.jsonl"),
    path.resolve(projectRoot, "data/*.json")
  ];
  const globs = envGlobs.length ? envGlobs : defaultGlobs;
  try {
    const loaded = await loader.loadFiles(globs, { inferDealerFromFilename: true });
    console.error(`[orgill-product-mcp-server] Preloaded ${loaded} products from ${globs.join(", ")}`);
  } catch (e) {
    console.error("[orgill-product-mcp-server] Preload failed:", e);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});


