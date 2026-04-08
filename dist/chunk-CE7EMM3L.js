import {
  INTERNAL_LOCK_DIR,
  S3FilesError,
  assertValidAgentId,
  byteLength,
  createLockPath,
  isS3FilesError,
  normalizeVirtualPath,
  sleep,
  withRetry
} from "./chunk-IMGFCLOX.js";

// src/adapters/direct-backend.ts
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "fs/promises";
import path from "path";
function createDirectBackend(config) {
  assertValidAgentId(config.agentId);
  const rootPath = path.join(config.mountPath, "agents", config.agentId);
  const runFs = (virtualPath, operation) => withRetry({
    policy: config.retryPolicy,
    run: async () => {
      try {
        return await operation();
      } catch (error) {
        throw mapNodeError(error, virtualPath);
      }
    },
    shouldRetry: (error) => error instanceof S3FilesError && error.retryable
  });
  const backend = {
    async ensureRoot() {
      await runFs(void 0, async () => {
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
          options?.recursive !== void 0 ? { recursive: options.recursive } : void 0
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
            statusCode: 400
          });
        }
        const entries = [];
        await walkDirectory({
          rootPath,
          currentVirtualPath: virtualPath,
          remainingDepth: options?.depth ?? 1,
          limit: options?.limit,
          entries
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
        const rmOptions = options?.recursive !== void 0 || options?.force !== void 0 ? {
          ...options?.recursive !== void 0 ? { recursive: options.recursive } : {},
          ...options?.force !== void 0 ? { force: options.force } : {}
        } : void 0;
        await rm(fullPath, rmOptions);
      });
    }
  };
  return backend;
}
async function walkDirectory(options) {
  if (options.remainingDepth <= 0) {
    return;
  }
  const fullPath = resolveFsPath(options.rootPath, options.currentVirtualPath);
  const dirents = await readdir(fullPath, { withFileTypes: true });
  dirents.sort((left, right) => left.name.localeCompare(right.name));
  for (const dirent of dirents) {
    if (options.limit !== void 0 && options.entries.length >= options.limit) {
      return;
    }
    const childVirtualPath = joinVirtualPath(
      options.currentVirtualPath,
      dirent.name
    );
    const childFullPath = resolveFsPath(options.rootPath, childVirtualPath);
    const childStat = await stat(childFullPath);
    const entry = toStat(childVirtualPath, childStat);
    options.entries.push({
      ...entry,
      name: dirent.name
    });
    if (dirent.isDirectory()) {
      await walkDirectory({
        ...options,
        currentVirtualPath: childVirtualPath,
        remainingDepth: options.remainingDepth - 1
      });
    }
  }
}
function resolveFsPath(rootPath, virtualPath) {
  if (virtualPath === "/") {
    return rootPath;
  }
  return path.join(rootPath, ...virtualPath.slice(1).split("/"));
}
function joinVirtualPath(parent, child) {
  return parent === "/" ? `/${child}` : `${parent}/${child}`;
}
function toFileStat(virtualPath, stats, content) {
  return {
    ...toStat(virtualPath, stats),
    content
  };
}
function toStat(virtualPath, stats) {
  return {
    path: virtualPath,
    type: stats.isDirectory() ? "directory" : "file",
    size: Number(stats.size),
    mtime: stats.mtime.toISOString(),
    mode: Number(stats.mode)
  };
}
function isNodeError(error) {
  return error instanceof Error;
}
function mapNodeError(error, virtualPath) {
  if (!isNodeError(error)) {
    return new S3FilesError({
      code: "REMOTE_ERROR",
      message: "An unknown filesystem error occurred.",
      details: { error, virtualPath }
    });
  }
  switch (error.code) {
    case "ENOENT":
      return new S3FilesError({
        code: "NOT_FOUND",
        message: virtualPath ? `${virtualPath} does not exist.` : "Path does not exist.",
        statusCode: 404,
        cause: error
      });
    case "ENOTDIR":
      return new S3FilesError({
        code: "NOT_A_DIRECTORY",
        message: virtualPath ? `${virtualPath} is not a directory.` : "Path is not a directory.",
        statusCode: 400,
        cause: error
      });
    case "EISDIR":
      return new S3FilesError({
        code: "IS_A_DIRECTORY",
        message: virtualPath ? `${virtualPath} is a directory.` : "Path is a directory.",
        statusCode: 400,
        cause: error
      });
    case "EEXIST":
      return new S3FilesError({
        code: "ALREADY_EXISTS",
        message: virtualPath ? `${virtualPath} already exists.` : "Path already exists.",
        statusCode: 409,
        cause: error
      });
    case "ENOTEMPTY":
      return new S3FilesError({
        code: "DIRECTORY_NOT_EMPTY",
        message: virtualPath ? `${virtualPath} is not empty.` : "Directory is not empty.",
        statusCode: 409,
        cause: error
      });
    case "ENAMETOOLONG":
      return new S3FilesError({
        code: "PATH_TOO_LONG",
        message: virtualPath ? `${virtualPath} is too long.` : "Path is too long.",
        statusCode: 400,
        cause: error
      });
    case "EACCES":
    case "EPERM":
      return new S3FilesError({
        code: "PERMISSION_DENIED",
        message: virtualPath ? `Permission denied for ${virtualPath}.` : "Permission denied.",
        statusCode: 403,
        cause: error
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
        cause: error
      });
    default:
      return new S3FilesError({
        code: "REMOTE_ERROR",
        message: error.message,
        cause: error,
        details: { code: error.code, virtualPath }
      });
  }
}

// src/core/lock-manager.ts
var AdvisoryLockManager = class {
  constructor(backend, timeoutMs) {
    this.backend = backend;
    this.timeoutMs = timeoutMs;
  }
  backend;
  timeoutMs;
  async withLock(targetPath, run) {
    const release = await this.acquire(targetPath);
    try {
      return await run();
    } finally {
      await release();
    }
  }
  async acquire(targetPath) {
    await this.backend.mkdir(INTERNAL_LOCK_DIR, { recursive: true });
    const lockPath = await createLockPath(targetPath);
    const ownerId = crypto.randomUUID();
    const now = Date.now();
    const staleAfterMs = Math.max(this.timeoutMs, 5e3);
    const lease = {
      targetPath,
      ownerId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + staleAfterMs).toISOString()
    };
    const startedAt = Date.now();
    while (true) {
      try {
        await this.backend.mkdir(lockPath, { recursive: false });
        try {
          await this.backend.writeFile(
            `${lockPath}/lease.json`,
            JSON.stringify(lease)
          );
        } catch (error) {
          await this.backend.rm(lockPath, { recursive: true, force: true });
          throw error;
        }
        return async () => {
          await this.safeRemove(lockPath);
        };
      } catch (error) {
        if (!this.isAlreadyExists(error)) {
          throw error;
        }
        const stale = await this.isStale(lockPath, staleAfterMs);
        if (!stale) {
          if (Date.now() - startedAt >= this.timeoutMs) {
            throw new S3FilesError({
              code: "LOCK_TIMEOUT",
              message: `Timed out waiting for a lock on ${targetPath}.`,
              statusCode: 409,
              details: { targetPath, timeoutMs: this.timeoutMs }
            });
          }
          await sleep(100);
          continue;
        }
        await this.safeRemove(lockPath);
      }
    }
  }
  async isStale(lockPath, staleAfterMs) {
    try {
      const leaseFile = await this.backend.readFile(`${lockPath}/lease.json`);
      const parsed = JSON.parse(leaseFile.content);
      if (typeof parsed.expiresAt === "string") {
        return Date.parse(parsed.expiresAt) <= Date.now();
      }
    } catch (error) {
      if (!this.isNotFound(error)) {
        return false;
      }
    }
    try {
      const stat2 = await this.backend.stat(lockPath);
      if (!stat2.mtime) {
        return false;
      }
      return Date.parse(stat2.mtime) + staleAfterMs <= Date.now();
    } catch (error) {
      return this.isNotFound(error);
    }
  }
  async safeRemove(lockPath) {
    try {
      await this.backend.rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (!this.isNotFound(error)) {
        throw error;
      }
    }
  }
  isAlreadyExists(error) {
    return isS3FilesError(error) && error.code === "ALREADY_EXISTS";
  }
  isNotFound(error) {
    return isS3FilesError(error) && error.code === "NOT_FOUND";
  }
};

// src/core/commands.ts
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
function createLocalCommandExecutor(options) {
  const lockManager = options.lockTimeoutMs !== void 0 && options.lockTimeoutMs > 0 ? new AdvisoryLockManager(options.backend, options.lockTimeoutMs) : null;
  const maxReadBytes = options.maxReadBytes ?? 32768;
  const maxReadLines = options.maxReadLines ?? 400;
  const maxListEntries = options.maxListEntries ?? 200;
  const withOptionalLock = async (path2, run) => {
    if (!lockManager) {
      return run();
    }
    return lockManager.withLock(path2, run);
  };
  return async (input) => {
    await options.backend.ensureRoot();
    switch (input.command) {
      case "list": {
        const path2 = normalizeVirtualPath(input.path ?? "/", {
          agentId: options.agentId,
          allowRoot: true
        });
        const limit = Math.min(input.limit ?? maxListEntries, maxListEntries);
        const entries = await options.backend.readdir(path2, {
          depth: input.depth ?? 1,
          limit: limit + 1
        });
        return {
          ok: true,
          command: "list",
          path: path2,
          entries: entries.slice(0, limit),
          truncated: entries.length > limit,
          limit
        };
      }
      case "view": {
        const path2 = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false
        });
        const file = await options.backend.readFile(path2);
        const lines = splitLines(file.content);
        const totalLines = lines.length === 0 ? 1 : lines.length;
        const requestedStart = input.startLine ?? 1;
        const requestedEnd = Math.min(input.endLine ?? totalLines, totalLines);
        const visibleLines = lines.slice(
          requestedStart - 1,
          Math.max(requestedStart - 1, requestedEnd)
        );
        const lineLimited = visibleLines.slice(0, maxReadLines);
        const truncatedByLines = lineLimited.length < visibleLines.length;
        const truncatedText = truncateUtf8(lineLimited.join("\n"), maxReadBytes);
        const truncatedByBytes = truncatedText.truncated;
        const endLine = lineLimited.length === 0 ? requestedStart : requestedStart + lineLimited.length - 1;
        return {
          ok: true,
          command: "view",
          path: path2,
          content: truncatedText.value,
          startLine: requestedStart,
          endLine,
          totalLines,
          size: file.size,
          truncated: truncatedByLines || truncatedByBytes,
          truncatedByBytes,
          truncatedByLines
        };
      }
      case "write": {
        const path2 = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false
        });
        return withOptionalLock(path2, async () => {
          const writeOptions = input.append !== void 0 || input.createParents !== void 0 ? {
            ...input.append !== void 0 ? { append: input.append } : {},
            ...input.createParents !== void 0 ? { createParents: input.createParents } : {}
          } : void 0;
          await options.backend.writeFile(path2, input.content, writeOptions);
          return {
            ok: true,
            command: "write",
            path: path2,
            bytesWritten: byteLength(input.content),
            appended: input.append ?? false
          };
        });
      }
      case "mkdir": {
        const path2 = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false
        });
        return withOptionalLock(path2, async () => {
          await options.backend.mkdir(
            path2,
            input.recursive !== void 0 ? { recursive: input.recursive } : void 0
          );
          return {
            ok: true,
            command: "mkdir",
            path: path2,
            created: true
          };
        });
      }
      case "delete": {
        const path2 = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false
        });
        return withOptionalLock(path2, async () => {
          await options.backend.rm(
            path2,
            input.recursive !== void 0 ? { recursive: input.recursive } : void 0
          );
          return {
            ok: true,
            command: "delete",
            path: path2,
            deleted: true
          };
        });
      }
      case "stat": {
        const path2 = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: true
        });
        const entry = await options.backend.stat(path2);
        return {
          ok: true,
          command: "stat",
          path: path2,
          entry
        };
      }
      case "str_replace": {
        const path2 = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false
        });
        return withOptionalLock(path2, async () => {
          const file = await options.backend.readFile(path2);
          const matches = countOccurrences(file.content, input.oldStr);
          if (matches === 0) {
            throw new S3FilesError({
              code: "NOT_FOUND",
              message: `No match for the requested text was found in ${path2}.`,
              statusCode: 404
            });
          }
          if (!input.replaceAll && matches > 1) {
            throw new S3FilesError({
              code: "CONFLICT",
              message: `Found ${matches} matches in ${path2}; set replaceAll to replace every match.`,
              statusCode: 409
            });
          }
          const nextContent = input.replaceAll ? file.content.split(input.oldStr).join(input.newStr) : file.content.replace(input.oldStr, input.newStr);
          await options.backend.writeFile(path2, nextContent, {
            append: false,
            createParents: false
          });
          return {
            ok: true,
            command: "str_replace",
            path: path2,
            replacements: input.replaceAll ? matches : 1,
            bytesWritten: byteLength(nextContent)
          };
        });
      }
    }
  };
}
function splitLines(input) {
  if (input.length === 0) {
    return [""];
  }
  return input.split(/\r?\n/u);
}
function countOccurrences(content, needle) {
  let count = 0;
  let index = 0;
  while (true) {
    const next = content.indexOf(needle, index);
    if (next === -1) {
      return count;
    }
    count += 1;
    index = next + needle.length;
  }
}
function truncateUtf8(content, maxBytes) {
  const encoded = textEncoder.encode(content);
  if (encoded.length <= maxBytes) {
    return { value: content, truncated: false };
  }
  return {
    value: textDecoder.decode(encoded.slice(0, maxBytes)),
    truncated: true
  };
}

export {
  createDirectBackend,
  createLocalCommandExecutor
};
//# sourceMappingURL=chunk-CE7EMM3L.js.map