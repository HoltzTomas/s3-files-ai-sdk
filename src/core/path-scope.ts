import { S3FilesError } from "./errors.js";

export const AGENT_ROOT_PATH = "/" as const;
export const INTERNAL_LOCK_DIR = "/.s3-files-locks";
export const MAX_S3_KEY_BYTES = 1024;
export const MAX_SAFE_SEGMENT_BYTES = 255;

const textEncoder = new TextEncoder();

export interface PathScopeOptions {
  agentId: string;
  allowInternal?: boolean;
  allowRoot?: boolean;
}

/**
 * Normalize a tool-facing path so every command runs inside a single agent root.
 */
export function normalizeVirtualPath(
  inputPath: string,
  options: PathScopeOptions,
): string {
  const rawPath = inputPath.length === 0 ? AGENT_ROOT_PATH : inputPath;

  if (rawPath.includes("\0")) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Paths cannot contain NUL bytes.",
      statusCode: 400,
    });
  }

  if (rawPath.includes("\\")) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Paths must use POSIX-style '/' separators.",
      statusCode: 400,
    });
  }

  const prefixed = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const trimmed =
    prefixed !== AGENT_ROOT_PATH ? prefixed.replace(/\/+$/u, "") : prefixed;

  if (trimmed.length === 0) {
    return AGENT_ROOT_PATH;
  }

  if (trimmed.includes("//")) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Paths cannot contain empty segments.",
      statusCode: 400,
    });
  }

  const segments = trimmed
    .split("/")
    .slice(1)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    if (options.allowRoot === false) {
      throw new S3FilesError({
        code: "INVALID_PATH",
        message: "This command cannot target the agent root directory.",
        statusCode: 400,
      });
    }

    return AGENT_ROOT_PATH;
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new S3FilesError({
        code: "INVALID_PATH",
        message: "Path traversal segments are not allowed.",
        statusCode: 400,
      });
    }

    if (byteLength(segment) > MAX_SAFE_SEGMENT_BYTES) {
      throw new S3FilesError({
        code: "NAME_TOO_LONG",
        message: `Path segment "${segment}" exceeds ${MAX_SAFE_SEGMENT_BYTES} bytes.`,
        statusCode: 400,
      });
    }

    if (segment.startsWith(".s3files-lost+found-")) {
      throw new S3FilesError({
        code: "INVALID_PATH",
        message: "Reserved S3 Files recovery directories are not accessible.",
        statusCode: 400,
      });
    }
  }

  const normalized = `/${segments.join("/")}`;

  if (
    options.allowInternal !== true &&
    (normalized === INTERNAL_LOCK_DIR ||
      normalized.startsWith(`${INTERNAL_LOCK_DIR}/`))
  ) {
    throw new S3FilesError({
      code: "INVALID_PATH",
      message: "Internal lock paths are not accessible through the tool.",
      statusCode: 400,
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
        path: normalized,
      },
    });
  }

  return normalized;
}

export function assertValidAgentId(agentId: string): void {
  if (agentId.length === 0) {
    throw new S3FilesError({
      code: "INVALID_REQUEST",
      message: "agentId must not be empty.",
      statusCode: 400,
    });
  }

  if (agentId.includes("/") || agentId.includes("\0")) {
    throw new S3FilesError({
      code: "INVALID_REQUEST",
      message: "agentId must be a single path-safe segment.",
      statusCode: 400,
    });
  }

  if (byteLength(agentId) > MAX_SAFE_SEGMENT_BYTES) {
    throw new S3FilesError({
      code: "INVALID_REQUEST",
      message: `agentId exceeds ${MAX_SAFE_SEGMENT_BYTES} bytes.`,
      statusCode: 400,
    });
  }
}

export async function createLockPath(targetPath: string): Promise<string> {
  const digest = await sha256Hex(targetPath);
  return `${INTERNAL_LOCK_DIR}/${digest}`;
}

export function byteLength(value: string): number {
  return textEncoder.encode(value).length;
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
