## Orgill Catalog Monorepo

Monorepo with three packages:

- `mcp`: MCP server for querying product catalogs (JSON/JSONL), dealers, DCs and analytics.
- `middleware`: Node/Express middleware that spawns the MCP server, calls its tools, and uses OpenAI to answer user questions.
- `web`: Vite + React chat UI that talks to the middleware.

### Features (MCP server)
- Load one or more files (supports globs). Dealer ID inferred from filenames like `products-<dealer>-*.jsonl`.
- Search products by text and filters (dealer, sku, mpn, upc, status, DC, region).
- Retrieve product by SKU.
- Distribution center listing and counts.
- Dealer summaries (counts, statuses, DCs, files).
- High-level catalog analytics summary.

### Setup
```bash
cd /Users/indra/orgillmcp
npm install
```

### Environment
Create a `.env` at the repo root (recommended) by copying the example and filling values:

```bash
cp .env.example .env
```

Required:
- `OPENAI_API_KEY`: your OpenAI API key

Optional:
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `PRELOAD_GLOBS` to customize MCP preload patterns

### Run (dev)
- MCP server:
  ```bash
  npm run dev:mcp
  # Defaults to preload /Users/indra/orgillmcp/data/*.jsonl and *.json
  # Customize: export PRELOAD_GLOBS="/full/path/*.jsonl"
  ```

- Middleware (reads OpenAI key from .env):
  ```bash
  npm run dev:middleware
  # Serves on http://localhost:4000
  ```

- Web UI:
  ```bash
  npm run dev:web
  # Open http://localhost:5173
  ```

### Build / Start (MCP)
```bash
npm run build:mcp
npm run start:mcp
```

### Cursor MCP configuration
Use the new mcp path:

- Option A (tsx, no build)
  - Command: `/Users/indra/orgillmcp/node_modules/.bin/tsx`
  - Args: `/Users/indra/orgillmcp/mcp/src/index.ts`
  - Env: `PRELOAD_GLOBS=/Users/indra/orgillmcp/data/*.jsonl`

- Option B (built JS)
  - Build: `npm run build:mcp`
  - Command: `node`
  - Args: `/Users/indra/orgillmcp/mcp/dist/index.js`
  - Env: `PRELOAD_GLOBS=/Users/indra/orgillmcp/data/*.jsonl`

### MCP Tools (reference)
- `loadFiles`: `{ paths: string[], dealerId?: string, inferDealerFromFilename?: boolean, clearBeforeLoad?: boolean }`
- `listDealers`: `{}`
- `getDealerInfo`: `{ dealerId: string }`
- `getDealerProductCount`: `{ dealerId: string }`
- `getProductBySku`: `{ sku: string, dealerId?: string }`
- `searchProducts`: `{ dealerId?, query?, sku?, mpn?, upc?, status?, dcCode?, region?: "US"|"CA", limit?, offset? }`
- `getDistributionCenters`: `{ dealerId?: string }`
- `summarizeCatalog`: `{}`
- `listLoadedFiles`: `{}`

### Data Notes
- Some attributes like `dc_availability` and `dc_specific` may be stringified JSON; the server parses those.
- Dealer ID is inferred from filenames by default.


