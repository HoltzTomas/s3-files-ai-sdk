import { z } from "zod";

import { s3FilesToolInputSchema, s3FilesToolOutputSchema } from "../core/tool-schema.js";

export const PROTOCOL_VERSION = "2026-04-07";

export const proxyRuntimeOptionsSchema = z.object({
  lockTimeoutMs: z.number().int().min(0).max(60_000).optional(),
  maxReadBytes: z.number().int().positive().max(1_000_000).optional(),
  maxReadLines: z.number().int().positive().max(10_000).optional(),
  maxListEntries: z.number().int().positive().max(10_000).optional(),
});

export const proxyRequestSchema = z.object({
  version: z.literal(PROTOCOL_VERSION),
  agentId: z.string().min(1).max(255),
  command: s3FilesToolInputSchema,
  options: proxyRuntimeOptionsSchema.optional(),
});

export const proxySuccessResponseSchema = z.object({
  ok: z.literal(true),
  result: s3FilesToolOutputSchema,
});

export const proxyErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number().int().positive(),
    details: z.record(z.string(), z.unknown()).optional(),
    retryable: z.boolean().optional(),
  }),
});

export const proxyResponseSchema = z.discriminatedUnion("ok", [
  proxySuccessResponseSchema,
  proxyErrorResponseSchema,
]);

export type ProxyRequest = z.infer<typeof proxyRequestSchema>;
export type ProxyResponse = z.infer<typeof proxyResponseSchema>;
