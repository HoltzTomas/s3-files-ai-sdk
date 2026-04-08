// src/core/errors.ts
var S3FilesError = class extends Error {
  code;
  statusCode;
  details;
  retryable;
  constructor(options) {
    super(options.message, { cause: options.cause });
    this.name = "S3FilesError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
};
function isS3FilesError(error) {
  return error instanceof S3FilesError;
}
function toS3FilesError(error) {
  if (isS3FilesError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new S3FilesError({
      code: "REMOTE_ERROR",
      message: error.message,
      cause: error
    });
  }
  return new S3FilesError({
    code: "REMOTE_ERROR",
    message: "An unknown filesystem error occurred.",
    details: { error }
  });
}
function serializeError(error) {
  const normalized = toS3FilesError(error);
  const serialized = {
    code: normalized.code,
    message: normalized.message,
    statusCode: normalized.statusCode
  };
  if (normalized.details !== void 0) {
    serialized.details = normalized.details;
  }
  if (normalized.retryable) {
    serialized.retryable = true;
  }
  return serialized;
}
function fromSerializedError(error) {
  const options = {
    code: error.code,
    message: error.message,
    statusCode: error.statusCode
  };
  if (error.details !== void 0) {
    options.details = error.details;
  }
  if (error.retryable !== void 0) {
    options.retryable = error.retryable;
  }
  return new S3FilesError(options);
}

// src/core/path-scope.ts
var AGENT_ROOT_PATH = "/";
var INTERNAL_LOCK_DIR = "/.s3-files-locks";
var MAX_S3_KEY_BYTES = 1024;
var MAX_SAFE_SEGMENT_BYTES = 255;
var textEncoder = new TextEncoder();
function normalizeVirtualPath(inputPath, options) {
  const rawPath = inputPath.length === 0 ? AGENT_ROOT_PATH : inputPath;
  if (rawPath.includes("\0")) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Paths cannot contain NUL bytes.",
      statusCode: 400
    });
  }
  if (rawPath.includes("\\")) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Paths must use POSIX-style '/' separators.",
      statusCode: 400
    });
  }
  const prefixed = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const trimmed = prefixed !== AGENT_ROOT_PATH ? prefixed.replace(/\/+$/u, "") : prefixed;
  if (trimmed.length === 0) {
    return AGENT_ROOT_PATH;
  }
  if (trimmed.includes("//")) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Paths cannot contain empty segments.",
      statusCode: 400
    });
  }
  const segments = trimmed.split("/").slice(1).filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    if (options.allowRoot === false) {
      throw new S3FilesError({
        code: "INVALID_PATH",
        message: "This command cannot target the agent root directory.",
        statusCode: 400
      });
    }
    return AGENT_ROOT_PATH;
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new S3FilesError({
        code: "INVALID_PATH",
        message: "Path traversal segments are not allowed.",
        statusCode: 400
      });
    }
    if (byteLength(segment) > MAX_SAFE_SEGMENT_BYTES) {
      throw new S3FilesError({
        code: "NAME_TOO_LONG",
        message: `Path segment "${segment}" exceeds ${MAX_SAFE_SEGMENT_BYTES} bytes.`,
        statusCode: 400
      });
    }
    if (segment.startsWith(".s3files-lost+found-")) {
      throw new S3FilesError({
        code: "INVALID_PATH",
        message: "Reserved S3 Files recovery directories are not accessible.",
        statusCode: 400
      });
    }
  }
  const normalized = `/${segments.join("/")}`;
  if (options.allowInternal !== true && (normalized === INTERNAL_LOCK_DIR || normalized.startsWith(`${INTERNAL_LOCK_DIR}/`))) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Internal lock paths are not accessible through the tool.",
      statusCode: 400
    });
  }
  const scopedKeyPath = `agents/${options.agentId}${normalized === "/" ? "/" : normalized}`;
  if (byteLength(scopedKeyPath) > MAX_S3_KEY_BYTES) {
    throw new S3FilesError({
      code: "PATH_TOO_LONG",
      message: `The scoped path exceeds the ${MAX_S3_KEY_BYTES}-byte S3 key limit.`,
      statusCode: 400,
      details: {
        agentId: options.agentId,
        path: normalized
      }
    });
  }
  return normalized;
}
function assertValidAgentId(agentId) {
  if (agentId.length === 0) {
    throw new S3FilesError({
      code: "INVALID_REQUEST",
      message: "agentId must not be empty.",
      statusCode: 400
    });
  }
  if (agentId.includes("/") || agentId.includes("\0")) {
    throw new S3FilesError({
      code: "INVALID_REQUEST",
      message: "agentId must be a single path-safe segment.",
      statusCode: 400
    });
  }
  if (byteLength(agentId) > MAX_SAFE_SEGMENT_BYTES) {
    throw new S3FilesError({
      code: "INVALID_REQUEST",
      message: `agentId exceeds ${MAX_SAFE_SEGMENT_BYTES} bytes.`,
      statusCode: 400
    });
  }
}
async function createLockPath(targetPath) {
  const digest = await sha256Hex(targetPath);
  return `${INTERNAL_LOCK_DIR}/${digest}`;
}
function byteLength(value) {
  return textEncoder.encode(value).length;
}
async function sha256Hex(input) {
  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/core/retry-policy.ts
var DEFAULT_RETRY_POLICY = {
  retries: 2,
  initialDelayMs: 100,
  maxDelayMs: 1e3,
  factor: 2,
  jitter: true
};
function normalizeRetryPolicy(policy) {
  return {
    retries: policy?.retries ?? DEFAULT_RETRY_POLICY.retries,
    initialDelayMs: policy?.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
    maxDelayMs: policy?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
    factor: policy?.factor ?? DEFAULT_RETRY_POLICY.factor,
    jitter: policy?.jitter ?? DEFAULT_RETRY_POLICY.jitter
  };
}
async function withRetry(options) {
  const policy = normalizeRetryPolicy(options.policy);
  let attempt = 0;
  while (true) {
    try {
      return await options.run(attempt);
    } catch (error) {
      const canRetry = attempt < policy.retries && options.shouldRetry(error, attempt);
      if (!canRetry) {
        throw error;
      }
      attempt += 1;
      const waitMs = computeDelay(policy, attempt);
      await sleep(waitMs);
    }
  }
}
function computeDelay(policy, attempt) {
  const exponent = Math.max(0, attempt - 1);
  const baseDelay = Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * policy.factor ** exponent
  );
  if (!policy.jitter) {
    return baseDelay;
  }
  const minDelay = Math.max(0, baseDelay / 2);
  return Math.round(minDelay + Math.random() * (baseDelay - minDelay));
}
async function sleep(delayMs) {
  if (delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

// src/core/tool-schema.ts
import { z } from "zod";
var boundedPathSchema = z.string().min(1).max(4096);
var listSchema = z.object({
  command: z.literal("list"),
  path: boundedPathSchema.default("/"),
  depth: z.number().int().min(1).max(32).optional(),
  limit: z.number().int().min(1).max(1e3).optional()
});
var viewSchema = z.object({
  command: z.literal("view"),
  path: boundedPathSchema,
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional()
}).refine(
  (value) => value.startLine === void 0 || value.endLine === void 0 || value.endLine >= value.startLine,
  {
    message: "endLine must be greater than or equal to startLine.",
    path: ["endLine"]
  }
);
var writeSchema = z.object({
  command: z.literal("write"),
  path: boundedPathSchema,
  content: z.string(),
  append: z.boolean().optional(),
  createParents: z.boolean().optional()
});
var mkdirSchema = z.object({
  command: z.literal("mkdir"),
  path: boundedPathSchema,
  recursive: z.boolean().optional()
});
var deleteSchema = z.object({
  command: z.literal("delete"),
  path: boundedPathSchema,
  recursive: z.boolean().optional()
});
var statSchema = z.object({
  command: z.literal("stat"),
  path: boundedPathSchema
});
var strReplaceSchema = z.object({
  command: z.literal("str_replace"),
  path: boundedPathSchema,
  oldStr: z.string().min(1),
  newStr: z.string(),
  replaceAll: z.boolean().optional()
});
var entrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative(),
  mtime: z.string().nullable(),
  mode: z.number().int().nonnegative().optional()
});
var statResultSchema = z.object({
  path: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative(),
  mtime: z.string().nullable(),
  mode: z.number().int().nonnegative().optional()
});
var s3FilesToolInputSchema = z.discriminatedUnion("command", [
  listSchema,
  viewSchema,
  writeSchema,
  mkdirSchema,
  deleteSchema,
  statSchema,
  strReplaceSchema
]);
var s3FilesToolOutputSchema = z.discriminatedUnion("command", [
  z.object({
    ok: z.literal(true),
    command: z.literal("list"),
    path: z.string(),
    entries: z.array(entrySchema),
    truncated: z.boolean(),
    limit: z.number().int().positive()
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
    truncatedByLines: z.boolean()
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("write"),
    path: z.string(),
    bytesWritten: z.number().int().nonnegative(),
    appended: z.boolean()
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("mkdir"),
    path: z.string(),
    created: z.literal(true)
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("delete"),
    path: z.string(),
    deleted: z.literal(true)
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("stat"),
    path: z.string(),
    entry: statResultSchema
  }),
  z.object({
    ok: z.literal(true),
    command: z.literal("str_replace"),
    path: z.string(),
    replacements: z.number().int().positive(),
    bytesWritten: z.number().int().nonnegative()
  })
]);

// src/http/protocol.ts
import { z as z2 } from "zod";
var PROTOCOL_VERSION = "2026-04-07";
var proxyRuntimeOptionsSchema = z2.object({
  lockTimeoutMs: z2.number().int().positive().max(6e4).optional(),
  maxReadBytes: z2.number().int().positive().max(1e6).optional(),
  maxReadLines: z2.number().int().positive().max(1e4).optional(),
  maxListEntries: z2.number().int().positive().max(1e4).optional()
});
var proxyRequestSchema = z2.object({
  version: z2.literal(PROTOCOL_VERSION),
  agentId: z2.string().min(1).max(255),
  command: s3FilesToolInputSchema,
  options: proxyRuntimeOptionsSchema.optional()
});
var proxySuccessResponseSchema = z2.object({
  ok: z2.literal(true),
  result: s3FilesToolOutputSchema
});
var proxyErrorResponseSchema = z2.object({
  ok: z2.literal(false),
  error: z2.object({
    code: z2.string(),
    message: z2.string(),
    statusCode: z2.number().int().positive(),
    details: z2.record(z2.string(), z2.unknown()).optional(),
    retryable: z2.boolean().optional()
  })
});
var proxyResponseSchema = z2.discriminatedUnion("ok", [
  proxySuccessResponseSchema,
  proxyErrorResponseSchema
]);

export {
  S3FilesError,
  isS3FilesError,
  serializeError,
  fromSerializedError,
  INTERNAL_LOCK_DIR,
  normalizeVirtualPath,
  assertValidAgentId,
  createLockPath,
  byteLength,
  withRetry,
  sleep,
  s3FilesToolInputSchema,
  s3FilesToolOutputSchema,
  PROTOCOL_VERSION,
  proxyRequestSchema,
  proxyResponseSchema
};
//# sourceMappingURL=chunk-IMGFCLOX.js.map