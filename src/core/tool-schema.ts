import { z } from "zod";

const boundedPathSchema = z.string().min(1).max(4096);

const listSchema = z.object({
  command: z.literal("list"),
  path: boundedPathSchema.default("/"),
  depth: z.number().int().min(1).max(32).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const viewSchema = z
  .object({
    command: z.literal("view"),
    path: boundedPathSchema,
    startLine: z.number().int().min(1).optional(),
    endLine: z.number().int().min(1).optional(),
  })
  .refine(
    (value) =>
      value.startLine === undefined ||
      value.endLine === undefined ||
      value.endLine >= value.startLine,
    {
      message: "endLine must be greater than or equal to startLine.",
      path: ["endLine"],
    },
  );

const writeSchema = z.object({
  command: z.literal("write"),
  path: boundedPathSchema,
  content: z.string(),
  append: z.boolean().optional(),
  createParents: z.boolean().optional(),
});

const mkdirSchema = z.object({
  command: z.literal("mkdir"),
  path: boundedPathSchema,
  recursive: z.boolean().optional(),
});

const deleteSchema = z.object({
  command: z.literal("delete"),
  path: boundedPathSchema,
  recursive: z.boolean().optional(),
});

const statSchema = z.object({
  command: z.literal("stat"),
  path: boundedPathSchema,
});

const strReplaceSchema = z.object({
  command: z.literal("str_replace"),
  path: boundedPathSchema,
  oldStr: z.string().min(1),
  newStr: z.string(),
  replaceAll: z.boolean().optional(),
});

const entrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative(),
  mtime: z.string().nullable(),
  mode: z.number().int().nonnegative().optional(),
});

const statResultSchema = z.object({
  path: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative(),
  mtime: z.string().nullable(),
  mode: z.number().int().nonnegative().optional(),
});

export const s3FilesToolInputSchema = z.discriminatedUnion("command", [
  listSchema,
  viewSchema,
  writeSchema,
  mkdirSchema,
  deleteSchema,
  statSchema,
  strReplaceSchema,
]);

export const s3FilesToolOutputSchema = z.discriminatedUnion("command", [
  z.object({
    ok: z.literal(true),
    command: z.literal("list"),
    path: z.string(),
    entries: z.array(entrySchema),
    truncated: z.boolean(),
    limit: z.number().int().positive(),
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("view"),
    path: z.string(),
    content: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().nonnegative(),
    totalLines: z.number().int().positive(),
    size: z.number().int().nonnegative(),
    truncated: z.boolean(),
    truncatedByBytes: z.boolean(),
    truncatedByLines: z.boolean(),
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("write"),
    path: z.string(),
    bytesWritten: z.number().int().nonnegative(),
    appended: z.boolean(),
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("mkdir"),
    path: z.string(),
    created: z.literal(true),
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("delete"),
    path: z.string(),
    deleted: z.literal(true),
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("stat"),
    path: z.string(),
    entry: statResultSchema,
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("str_replace"),
    path: z.string(),
    replacements: z.number().int().positive(),
    bytesWritten: z.number().int().nonnegative(),
  }),
]);

export type S3FilesToolInput = z.infer<typeof s3FilesToolInputSchema>;
export type S3FilesToolOutput = z.infer<typeof s3FilesToolOutputSchema>;
