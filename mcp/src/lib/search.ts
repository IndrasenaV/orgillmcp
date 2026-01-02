import { ProductRecord, SearchProductsInput } from "../types.js";

function textIncludes(hay: string | undefined | null, needle: string): boolean {
  if (!hay) return false;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function localeMapIncludes(map: Record<string, string> | undefined, needle: string): boolean {
  if (!map) return false;
  const lower = needle.toLowerCase();
  return Object.values(map).some((v) => v?.toLowerCase().includes(lower));
}

export function filterProducts(products: ProductRecord[], input: SearchProductsInput): ProductRecord[] {
  const {
    dealerId,
    query,
    sku,
    mpn,
    upc,
    status,
    dcCode,
    region
  } = input;

  const out: ProductRecord[] = [];
  for (const p of products) {
    if (dealerId && p.dealerId !== dealerId) continue;
    if (sku && p.sku !== sku) continue;
    if (mpn && (p.mpn ?? "") !== mpn) continue;
    if (upc && (p.upc_ean ?? "") !== upc) continue;
    if (status && (p.status ?? "") !== status) continue;
    if (query) {
      const q = query.trim();
      const matches =
        textIncludes(p.sku, q) ||
        textIncludes(p.mpn, q) ||
        textIncludes(p.upc_ean, q) ||
        textIncludes(p.productType, q) ||
        textIncludes(p.slug, q) ||
        textIncludes(p.externalRef, q) ||
        localeMapIncludes(p.name, q) ||
        localeMapIncludes(p.description, q);
      if (!matches) continue;
    }
    if (dcCode) {
      const dcAvail = p.dc_availability?.[dcCode];
      if (!dcAvail) continue;
      if (region) {
        const flag = dcAvail[region];
        if (flag !== 1) continue;
      }
    } else if (region) {
      // If region specified but no dcCode, pass if any DC supports region
      const hasRegion = Object.values(p.dc_availability ?? {}).some((r) => r?.[region] === 1);
      if (!hasRegion) continue;
    }
    out.push(p);
  }
  return out;
}

export function summarizeDistributionCenters(products: ProductRecord[]): Record<string, number> {
  const countByDc: Record<string, number> = {};
  for (const p of products) {
    const dcAvail = p.dc_availability;
    if (!dcAvail) continue;
    for (const dc of Object.keys(dcAvail)) {
      countByDc[dc] = (countByDc[dc] ?? 0) + 1;
    }
  }
  return countByDc;
}

export function summarizeStatuses(products: ProductRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of products) {
    const s = p.status ?? "unknown";
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}


