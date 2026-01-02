import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import stripJsonComments from "strip-json-comments";
import { ProductRecord, DistributionCenterAvailability, DistributionCenterSpecific } from "../types.js";

export interface CatalogState {
  products: ProductRecord[];
  productsByDealer: Map<string, ProductRecord[]>;
  filesByDealer: Map<string, Set<string>>;
}

export class CatalogLoader {
  private state: CatalogState = {
    products: [],
    productsByDealer: new Map(),
    filesByDealer: new Map()
  };

  getState(): CatalogState {
    return this.state;
  }

  clear(): void {
    this.state = {
      products: [],
      productsByDealer: new Map(),
      filesByDealer: new Map()
    };
  }

  async loadFiles(paths: string[], options?: { dealerId?: string; inferDealerFromFilename?: boolean }): Promise<number> {
    const patterns = paths.map((p) => path.resolve(p));
    const files = await fg(patterns, { onlyFiles: true, unique: true, dot: false });
    let loaded = 0;
    for (const file of files) {
      const dealerId = this.resolveDealerId(file, options?.dealerId, options?.inferDealerFromFilename !== false);
      const items = await this.readAnyJsonLike(file, dealerId);
      for (const product of items) {
        this.addProduct(product);
        this.trackFile(dealerId ?? "unknown", file);
        loaded += 1;
      }
    }
    return loaded;
  }

  private resolveDealerId(filePath: string, dealerId?: string, inferFromFilename: boolean = true): string | undefined {
    if (dealerId) return dealerId;
    if (!inferFromFilename) return undefined;
    // Heuristic: products-<dealer>-*.json(l)
    const base = path.basename(filePath);
    const m = base.match(/products-([A-Za-z0-9_-]+)-/);
    if (m) return m[1];
    return undefined;
  }

  private addProduct(product: ProductRecord): void {
    this.state.products.push(product);
    const dealerId = product.dealerId ?? "unknown";
    if (!this.state.productsByDealer.has(dealerId)) {
      this.state.productsByDealer.set(dealerId, []);
    }
    this.state.productsByDealer.get(dealerId)!.push(product);
  }

  private trackFile(dealerId: string, filePath: string): void {
    if (!this.state.filesByDealer.has(dealerId)) {
      this.state.filesByDealer.set(dealerId, new Set());
    }
    this.state.filesByDealer.get(dealerId)!.add(filePath);
  }

  private async readAnyJsonLike(file: string, dealerId?: string): Promise<ProductRecord[]> {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".jsonl" || ext === ".ndjson" || ext === ".jsonlines") {
      return this.readJsonLines(file, dealerId);
    }
    return this.readJsonArray(file, dealerId);
  }

  private async readJsonLines(file: string, dealerId?: string): Promise<ProductRecord[]> {
    const content = await fs.promises.readFile(file, "utf8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const records: ProductRecord[] = [];
    for (const line of lines) {
      const obj = JSON.parse(stripJsonComments(line));
      const normalized = this.normalizeProduct(obj, dealerId, file);
      records.push(normalized);
    }
    return records;
  }

  private async readJsonArray(file: string, dealerId?: string): Promise<ProductRecord[]> {
    const content = await fs.promises.readFile(file, "utf8");
    const data = JSON.parse(stripJsonComments(content));
    const arr: unknown[] = Array.isArray(data) ? data : [data];
    return arr.map((obj) => this.normalizeProduct(obj as Record<string, unknown>, dealerId, file));
  }

  private normalizeProduct(raw: Record<string, unknown>, dealerId: string | undefined, sourceFile: string): ProductRecord {
    const name = this.extractLocaleMap(raw["name"]);
    const description = this.extractLocaleMap(raw["description"]);
    const attributes = this.extractAttributes(raw["attributes"]);
    const dcAvailability = this.extractDcAvailability(attributes);
    const dcSpecific = this.extractDcSpecific(attributes);
    return {
      sku: String(raw["sku"] ?? ""),
      slug: this.optionalString(raw["slug"]),
      externalRef: this.optionalString(raw["externalRef"]),
      mpn: this.optionalString(raw["mpn"]),
      upc_ean: this.optionalString(raw["upc_ean"]),
      productType: this.optionalString(raw["productType"]),
      name,
      description,
      commodityType: this.optionalString(raw["commodityType"]),
      status: this.optionalString(raw["status"]),
      attributes,
      dealerId,
      dc_availability: dcAvailability,
      dc_specific: dcSpecific,
      sourceFile
    };
  }

  private optionalString(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    return String(v);
  }

  private extractLocaleMap(v: unknown): Record<string, string> | undefined {
    // Supports input as [{locale: "en", value: "..."}, ...] or string
    if (!v) return undefined;
    if (typeof v === "string") {
      return { en: v };
    }
    if (Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const item of v) {
        if (item && typeof item === "object" && "locale" in item && "value" in item) {
          const loc = String((item as any).locale ?? "en");
          out[loc] = String((item as any).value ?? "");
        }
      }
      return Object.keys(out).length ? out : undefined;
    }
    if (typeof v === "object") {
      // already a map
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v as any)) {
        out[k] = String(val);
      }
      return out;
    }
    return undefined;
  }

  private extractAttributes(v: unknown): Record<string, unknown> | undefined {
    // In sample, attributes is [{ templateSlug, templateAttributes: [{fieldSlug, type, value}, ...]}]
    if (!v || !Array.isArray(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const group of v) {
      if (!group || typeof group !== "object") continue;
      const templateAttributes = (group as any).templateAttributes;
      if (!Array.isArray(templateAttributes)) continue;
      for (const attr of templateAttributes) {
        if (!attr || typeof attr !== "object") continue;
        const fieldSlug = String((attr as any).fieldSlug ?? "");
        const value = (attr as any).value;
        out[fieldSlug] = value;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  private extractDcAvailability(attributes?: Record<string, unknown>): DistributionCenterAvailability | undefined {
    if (!attributes) return undefined;
    const raw = attributes["dc_availability"];
    if (!raw) return undefined;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed as DistributionCenterAvailability;
    } catch {
      return undefined;
    }
  }

  private extractDcSpecific(attributes?: Record<string, unknown>): DistributionCenterSpecific | undefined {
    if (!attributes) return undefined;
    const raw = attributes["dc_specific"];
    if (!raw) return undefined;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed as DistributionCenterSpecific;
    } catch {
      return undefined;
    }
  }
}


