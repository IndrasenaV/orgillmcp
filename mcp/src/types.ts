import { z } from "zod";

export type LocaleString = Record<string, string>;

export interface DistributionCenterAvailability {
  [dcCode: string]: {
    US?: number;
    CA?: number;
    [region: string]: unknown;
  };
}

export interface DistributionCenterSpecific {
  [dcCode: string]: Record<string, unknown>;
}

export interface ProductRecord {
  sku: string;
  slug?: string | null;
  externalRef?: string | null;
  mpn?: string | null;
  upc_ean?: string | null;
  productType?: string | null;
  name?: LocaleString;
  description?: LocaleString;
  commodityType?: string | null;
  status?: string | null;
  attributes?: Record<string, unknown>;
  dealerId?: string;
  dc_availability?: DistributionCenterAvailability;
  dc_specific?: DistributionCenterSpecific;
  sourceFile?: string;
}

export const SearchProductsInputSchema = z.object({
  dealerId: z.string().optional(),
  query: z.string().optional(),
  sku: z.string().optional(),
  mpn: z.string().optional(),
  upc: z.string().optional(),
  status: z.string().optional(),
  dcCode: z.string().optional(),
  region: z.enum(["US", "CA"]).optional(),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0)
});

export type SearchProductsInput = z.infer<typeof SearchProductsInputSchema>;

export const LoadFilesInputSchema = z.object({
  paths: z.array(z.string()).min(1),
  dealerId: z.string().optional(),
  inferDealerFromFilename: z.boolean().default(true),
  clearBeforeLoad: z.boolean().default(false)
});

export type LoadFilesInput = z.infer<typeof LoadFilesInputSchema>;

export interface DealerSummary {
  dealerId: string;
  productCount: number;
  statuses: Record<string, number>;
  distributionCenters: string[];
  files: string[];
}

export interface CatalogSummary {
  totalProducts: number;
  byDealer: Record<string, number>;
  byStatus: Record<string, number>;
  byDc: Record<string, number>;
  sampleSkus: string[];
}


