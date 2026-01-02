export function filterProducts(products, input) {
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

  const out = [];
  for (const p of products) {
    if (dealerId && p.dealerId !== dealerId) continue;
    if (sku && p.sku !== sku) continue;
    if (mpn && (p.mpn ?? "") !== mpn) continue;
    if (upc && (p.upc_ean ?? "") !== upc) continue;
    if (status && (p.status ?? "") !== status) continue;
    if (query) {
      const q = query.trim().toLowerCase();
      const matches =
        (p.sku || "").toLowerCase().includes(q) ||
        (p.mpn || "").toLowerCase().includes(q) ||
        (p.upc_ean || "").toLowerCase().includes(q) ||
        (p.productType || "").toLowerCase().includes(q) ||
        (p.slug || "").toLowerCase().includes(q) ||
        (p.externalRef || "").toLowerCase().includes(q) ||
        Object.values(p.name ?? {}).some((v) => (v || "").toLowerCase().includes(q)) ||
        Object.values(p.description ?? {}).some((v) => (v || "").toLowerCase().includes(q));
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
      const hasRegion = Object.values(p.dc_availability ?? {}).some((r) => r?.[region] === 1);
      if (!hasRegion) continue;
    }
    out.push(p);
  }
  return out;
}

export function summarizeDistributionCenters(products) {
  const countByDc = {};
  for (const p of products) {
    const dcAvail = p.dc_availability;
    if (!dcAvail) continue;
    for (const dc of Object.keys(dcAvail)) {
      countByDc[dc] = (countByDc[dc] ?? 0) + 1;
    }
  }
  return countByDc;
}

export function summarizeStatuses(products) {
  const out = {};
  for (const p of products) {
    const s = p.status ?? "unknown";
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}


