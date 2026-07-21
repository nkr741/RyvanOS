import { z } from "zod";

export const IdSchema = z.string().min(1).max(128);
export const NameSchema = z.string().min(1).max(256);
export const EmailSchema = z.string().email();
export const UrlSchema = z.string().url();
export const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(1000).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const TenantContextSchema = z.object({
  tenantId: IdSchema,
  organizationId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  environment: z.enum(["development", "staging", "production"]),
});

export const RetryOptionsSchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  baseDelay: z.number().min(100).default(1000),
  maxDelay: z.number().min(1000).default(30000),
  backoffMultiplier: z.number().min(1).default(2),
});

export const RateLimitSchema = z.object({
  maxRequests: z.number().int().min(1).default(100),
  windowMs: z.number().min(1000).default(60000),
  keyPrefix: z.string().optional(),
});

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, label = "input"): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Validation failed for ${label}: ${messages.join("; ")}`);
  }
  return result.data;
}

export { z };
