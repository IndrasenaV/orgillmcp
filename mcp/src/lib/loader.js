import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import stripJsonComments from "strip-json-comments";

export class CatalogLoader {
  constructor() {
    this.state = {
      products: [],
      productsByDealer: new Map(),
      filesByDealer: new Map()
    };
  }

  getState() {
    return this.state;
  }

  clear() {
    this.state = {
      products: [],
      productsByDealer: new Map(),
      filesByDealer: new Map()
    };
  }

  async loadFiles(paths, options) {
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

  resolveDealerId(filePath, dealerId, inferFromFilename = true) {
    if (dealerId) return dealerId;
    if (!inferFromFilename) return undefined;
    const base = path.basename(filePath);
    const m = base.match(/products-([A-Za-z0-9_-]+)-/);
    if (m) return m[1];
    return undefined;
  }

  addProduct(product) {
    this.state.products.push(product);
    const dealerId = product.dealerId ?? "unknown";
    if (!this.state.productsByDealer.has(dealerId)) {
      this.state.productsByDealer.set(dealerId, []);
    }
    this.state.productsByDealer.get(dealerId).push(product);
  }

  trackFile(dealerId, filePath) {
    if (!this.state.filesByDealer.has(dealerId)) {
      this.state.filesByDealer.set(dealerId, new Set());
    }
    this.state.filesByDealer.get(dealerId).add(filePath);
  }

  async readAnyJsonLike(file, dealerId) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".jsonl" || ext === ".ndjson" || ext === ".jsonlines") {
      return this.readJsonLines(file, dealerId);
    }
    return this.readJsonArray(file, dealerId);
  }

  async readJsonLines(file, dealerId) {
    const content = await fs.promises.readFile(file, "utf8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const records = [];
    for (const line of lines) {
      const obj = JSON.parse(stripJsonComments(line));
      const normalized = this.normalizeProduct(obj, dealerId, file);
      records.push(normalized);
    }
    return records;
  }

  async readJsonArray(file, dealerId) {
    const content = await fs.promises.readFile(file, "utf8");
    const data = JSON.parse(stripJsonComments(content));
    const arr = Array.isArray(data) ? data : [data];
    return arr.map((obj) => this.normalizeProduct(obj, dealerId, file));
  }

  normalizeProduct(raw, dealerId, sourceFile) {
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

  optionalString(v) {
    if (v === undefined || v === null) return null;
    return String(v);
  }

  extractLocaleMap(v) {
    if (!v) return undefined;
    if (typeof v === "string") {
      return { en: v };
    }
    if (Array.isArray(v)) {
      const out = {};
      for (const item of v) {
        if (item && typeof item === "object" && "locale" in item && "value" in item) {
          const loc = String(item.locale ?? "en");
          out[loc] = String(item.value ?? "");
        }
      }
      return Object.keys(out).length ? out : undefined;
    }
    if (typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = String(val);
      }
      return out;
    }
    return undefined;
  }

  extractAttributes(v) {
    if (!v || !Array.isArray(v)) return undefined;
    const out = {};
    for (const group of v) {
      if (!group || typeof group !== "object") continue;
      const templateAttributes = group.templateAttributes;
      if (!Array.isArray(templateAttributes)) continue;
      for (const attr of templateAttributes) {
        if (!attr || typeof attr !== "object") continue;
        const fieldSlug = String(attr.fieldSlug ?? "");
        const value = attr.value;
        out[fieldSlug] = value;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  extractDcAvailability(attributes) {
    if (!attributes) return undefined;
    const raw = attributes["dc_availability"];
    if (!raw) return undefined;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed;
    } catch {
      return undefined;
    }
  }

  extractDcSpecific(attributes) {
    if (!attributes) return undefined;
    const raw = attributes["dc_specific"];
    if (!raw) return undefined;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return parsed;
    } catch {
      return undefined;
    }
  }
}


