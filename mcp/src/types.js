import { z } from "zod";

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

export const LoadFilesInputSchema = z.object({
  paths: z.array(z.string()).min(1),
  dealerId: z.string().optional(),
  inferDealerFromFilename: z.boolean().default(true),
  clearBeforeLoad: z.boolean().default(false)
});


