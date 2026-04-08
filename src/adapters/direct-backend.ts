import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  BackendEntry,
  BackendFile,
  BackendStat,
  FileSystemBackend,
  ReadDirOptions,
  RemoveOptions,
  WriteFileOptions,
} from "../core/backend.js";
import { S3FilesError } from "../core/errors.js";
import { assertValidAgentId } from "../core/path-scope.js";
import type { RetryPolicy } from "../core/retry-policy.js";
import { withRetry } from "../core/retry-policy.js";

export interface DirectBackendConfig {
  mountPath: string;
  agentId: string;
  retryPolicy?: RetryPolicy;
}

export function createDirectBackend(
  config: DirectBackendConfig,
): FileSystemBackend {
  assertValidAgentId(config.agentId);

  const rootPath = path.join(config.mountPath, "agents", config.agentId);
  const runFs = <T>(
    virtualPath: string | undefined,
    operation: () => Promise<T>,
  ) =>
    withRetry({
      policy: config.retryPolicy,
      run: async () => {
        try {
          return await operation();
        } catch (error) {
          throw mapNodeError(error, virtualPath);
        }
      },
      shouldRetry: (error) =>
        error instanceof S3FilesError && error.retryable,
    });

  const backend: FileSystemBackend = {
    async ensureRoot() {
      await runFs(undefined, async () => {
        await mkdir(rootPath, { recursive: true });
      });
    },

    async readFile(virtualPath) {
      return runFs(virtualPath, async () => {
        const fullPath = resolveFsPath(rootPath, virtualPath);
        const content = await readFile(fullPath, "utf8");
        const fileStat = await stat(fullPath);
        return toFileStat(virtualPath, fileStat, content);
      });
    },

    async writeFile(virtualPath, content, options) {
      return runFs(virtualPath, async () => {
        const fullPath = resolveFsPath(rootPath, virtualPath);
        if (options?.createParents) {
          await mkdir(path.dirname(fullPath), { recursive: true });
        }

        if (options?.append) {
          await appendFile(fullPath, content, "utf8");
        } else {
          await writeFile(fullPath, content, "utf8");
        }

        const fileStat = await stat(fullPath);
        return toStat(virtualPath, fileStat);
      });
    },

    async mkdir(virtualPath, options) {
      return runFs(virtualPath, async () => {
        const fullPath = resolveFsPath(rootPath, virtualPath);
        await mkdir(
          fullPath,
          options?.recursive !== undefined
            ? { recursive: options.recursive }
            : undefined,
        );
      });
    },

    async readdir(virtualPath, options) {
      return runFs(virtualPath, async () => {
        const fullPath = resolveFsPath(rootPath, virtualPath);
        const directoryStat = await stat(fullPath);
        if (!directoryStat.isDirectory()) {
          throw new S3FilesError({
            code: "NOT_A_DIRECTORY",
            message: `${virtualPath} is not a directory.`,
            statusCode: 400,
          });
        }

        const entries: BackendEntry[] = [];
        await walkDirectory({
          rootPath,
          currentVirtualPath: virtualPath,
          remainingDepth: options?.depth ?? 1,
          limit: options?.limit,
          entries,
        });
        return entries;
      });
    },

    async stat(virtualPath) {
      return runFs(virtualPath, async () => {
        const fullPath = resolveFsPath(rootPath, virtualPath);
        const result = await stat(fullPath);
        return toStat(virtualPath, result);
      });
    },

    async rm(virtualPath, options) {
      return runFs(virtualPath, async () => {
        const fullPath = resolveFsPath(rootPath, virtualPath);
        const rmOptions =
          options?.recursive !== undefined || options?.force !== undefined
            ? {
                ...(options?.recursive !== undefined
                  ? { recursive: options.recursive }
                  : {}),
                ...(options?.force !== undefined ? { force: options.force } : {}),
              }
            : undefined;

        await rm(fullPath, rmOptions);
      });
    },
  };

  return backend;
}

async function walkDirectory(options: {
  rootPath: string;
  currentVirtualPath: string;
  remainingDepth: number;
  limit: number | undefined;
  entries: BackendEntry[];
}): Promise<void> {
  if (options.remainingDepth <= 0) {
    return;
  }

  const fullPath = resolveFsPath(options.rootPath, options.currentVirtualPath);
  const dirents = await readdir(fullPath, { withFileTypes: true });
  dirents.sort((left, right) => left.name.localeCompare(right.name));

  for (const dirent of dirents) {
    if (
      options.limit !== undefined &&
      options.entries.length >= options.limit
    ) {
      return;
    }

    const childVirtualPath = joinVirtualPath(
      options.currentVirtualPath,
      dirent.name,
    );
    const childFullPath = resolveFsPath(options.rootPath, childVirtualPath);
    const childStat = await stat(childFullPath);
    const entry = toStat(childVirtualPath, childStat);
    options.entries.push({
      ...entry,
      name: dirent.name,
    });

    if (dirent.isDirectory()) {
      await walkDirectory({
        ...options,
        currentVirtualPath: childVirtualPath,
        remainingDepth: options.remainingDepth - 1,
      });
    }
  }
}

function resolveFsPath(rootPath: string, virtualPath: string): string {
  if (virtualPath === "/") {
    return rootPath;
  }

  return path.join(rootPath, ...virtualPath.slice(1).split("/"));
}

function joinVirtualPath(parent: string, child: string): string {
  return parent === "/" ? `/${child}` : `${parent}/${child}`;
}

function toFileStat(
  virtualPath: string,
  stats: Awaited<ReturnType<typeof stat>>,
  content: string,
): BackendFile {
  return {
    ...toStat(virtualPath, stats),
    content,
  };
}

function toStat(
  virtualPath: string,
  stats: Awaited<ReturnType<typeof stat>>,
): BackendStat {
  return {
    path: virtualPath,
    type: stats.isDirectory() ? "directory" : "file",
    size: Number(stats.size),
    mtime: stats.mtime.toISOString(),
    mode: Number(stats.mode),
  };
}

function isRetryableNodeError(error: unknown): boolean {
  if (!isNodeError(error)) {
    return false;
  }

  return ["EAGAIN", "EBUSY", "EIO", "ENOTCONN", "ESTALE", "ETIMEDOUT"].includes(
    error.code ?? "",
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function mapNodeError(error: unknown, virtualPath?: string): S3FilesError {
  if (!isNodeError(error)) {
    return new S3FilesError({
      code: "REMOTE_ERROR",
      message: "An unknown filesystem error occurred.",
      details: { error, virtualPath },
    });
  }

  switch (error.code) {
    case "ENOENT":
      return new S3FilesError({
        code: "NOT_FOUND",
        message: virtualPath
          ? `${virtualPath} does not exist.`
          : "Path does not exist.",
        statusCode: 404,
        cause: error,
      });
    case "ENOTDIR":
      return new S3FilesError({
        code: "NOT_A_DIRECTORY",
        message: virtualPath
          ? `${virtualPath} is not a directory.`
          : "Path is not a directory.",
        statusCode: 400,
        cause: error,
      });
    case "EISDIR":
      return new S3FilesError({
        code: "IS_A_DIRECTORY",
        message: virtualPath
          ? `${virtualPath} is a directory.`
          : "Path is a directory.",
        statusCode: 400,
        cause: error,
      });
    case "EEXIST":
      return new S3FilesError({
        code: "ALREADY_EXISTS",
        message: virtualPath
          ? `${virtualPath} already exists.`
          : "Path already exists.",
        statusCode: 409,
        cause: error,
      });
    case "ENOTEMPTY":
      return new S3FilesError({
        code: "DIRECTORY_NOT_EMPTY",
        message: virtualPath
          ? `${virtualPath} is not empty.`
          : "Directory is not empty.",
        statusCode: 409,
        cause: error,
      });
    case "ENAMETOOLONG":
      return new S3FilesError({
        code: "PATH_TOO_LONG",
        message: virtualPath
          ? `${virtualPath} is too long.`
          : "Path is too long.",
        statusCode: 400,
        cause: error,
      });
    case "EACCES":
    case "EPERM":
      return new S3FilesError({
        code: "PERMISSION_DENIED",
        message: virtualPath
          ? `Permission denied for ${virtualPath}.`
          : "Permission denied.",
        statusCode: 403,
        cause: error,
      });
    case "EAGAIN":
    case "EBUSY":
    case "EIO":
    case "ENOTCONN":
    case "ESTALE":
    case "ETIMEDOUT":
      return new S3FilesError({
        code: "BACKEND_UNAVAILABLE",
        message: "The mounted filesystem is temporarily unavailable.",
        statusCode: 503,
        retryable: true,
        cause: error,
      });
    default:
      return new S3FilesError({
        code: "REMOTE_ERROR",
        message: error.message,
        cause: error,
        details: { code: error.code, virtualPath },
      });
  }
}
