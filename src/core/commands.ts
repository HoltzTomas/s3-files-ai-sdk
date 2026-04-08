import type { FileSystemBackend } from "./backend.js";
import { byteLength, normalizeVirtualPath } from "./path-scope.js";
import type { S3FilesToolInput, S3FilesToolOutput } from "./tool-schema.js";
import { AdvisoryLockManager } from "./lock-manager.js";
import { S3FilesError } from "./errors.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface CommandExecutorOptions {
  backend: FileSystemBackend;
  agentId: string;
  lockTimeoutMs?: number;
  maxReadBytes?: number;
  maxReadLines?: number;
  maxListEntries?: number;
}

export function createLocalCommandExecutor(
  options: CommandExecutorOptions,
): (input: S3FilesToolInput) => Promise<S3FilesToolOutput> {
  const lockManager =
    options.lockTimeoutMs !== undefined && options.lockTimeoutMs > 0
      ? new AdvisoryLockManager(options.backend, options.lockTimeoutMs)
      : null;
  const maxReadBytes = options.maxReadBytes ?? 32_768;
  const maxReadLines = options.maxReadLines ?? 400;
  const maxListEntries = options.maxListEntries ?? 200;

  const withOptionalLock = async <T>(
    path: string,
    run: () => Promise<T>,
  ): Promise<T> => {
    if (!lockManager) {
      return run();
    }

    return lockManager.withLock(path, run);
  };

  return async (input) => {
    await options.backend.ensureRoot();

    switch (input.command) {
      case "list": {
        const path = normalizeVirtualPath(input.path ?? "/", {
          agentId: options.agentId,
          allowRoot: true,
        });
        const limit = Math.min(input.limit ?? maxListEntries, maxListEntries);
        const entries = await options.backend.readdir(path, {
          depth: input.depth ?? 1,
          limit: limit + 1,
        });

        return {
          ok: true,
          command: "list",
          path,
          entries: entries.slice(0, limit),
          truncated: entries.length > limit,
          limit,
        };
      }

      case "view": {
        const path = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false,
        });
        const file = await options.backend.readFile(path);
        const lines = splitLines(file.content);
        const totalLines = lines.length === 0 ? 1 : lines.length;
        const requestedStart = input.startLine ?? 1;
        const requestedEnd = Math.min(input.endLine ?? totalLines, totalLines);

        const visibleLines = lines.slice(
          requestedStart - 1,
          Math.max(requestedStart - 1, requestedEnd),
        );
        const lineLimited = visibleLines.slice(0, maxReadLines);
        const truncatedByLines = lineLimited.length < visibleLines.length;
        const truncatedText = truncateUtf8(lineLimited.join("\n"), maxReadBytes);
        const truncatedByBytes = truncatedText.truncated;
        const endLine =
          lineLimited.length === 0
            ? requestedStart
            : requestedStart + lineLimited.length - 1;

        return {
          ok: true,
          command: "view",
          path,
          content: truncatedText.value,
          startLine: requestedStart,
          endLine,
          totalLines,
          size: file.size,
          truncated: truncatedByLines || truncatedByBytes,
          truncatedByBytes,
          truncatedByLines,
        };
      }

      case "write": {
        const path = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false,
        });

        return withOptionalLock(path, async () => {
          const writeOptions =
            input.append !== undefined || input.createParents !== undefined
              ? {
                  ...(input.append !== undefined ? { append: input.append } : {}),
                  ...(input.createParents !== undefined
                    ? { createParents: input.createParents }
                    : {}),
                }
              : undefined;

          await options.backend.writeFile(path, input.content, writeOptions);

          return {
            ok: true,
            command: "write",
            path,
            bytesWritten: byteLength(input.content),
            appended: input.append ?? false,
          };
        });
      }

      case "mkdir": {
        const path = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false,
        });

        return withOptionalLock(path, async () => {
          await options.backend.mkdir(
            path,
            input.recursive !== undefined
              ? { recursive: input.recursive }
              : undefined,
          );
          return {
            ok: true,
            command: "mkdir",
            path,
            created: true,
          };
        });
      }

      case "delete": {
        const path = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false,
        });

        return withOptionalLock(path, async () => {
          await options.backend.rm(
            path,
            input.recursive !== undefined
              ? { recursive: input.recursive }
              : undefined,
          );
          return {
            ok: true,
            command: "delete",
            path,
            deleted: true,
          };
        });
      }

      case "stat": {
        const path = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: true,
        });
        const entry = await options.backend.stat(path);
        return {
          ok: true,
          command: "stat",
          path,
          entry,
        };
      }

      case "str_replace": {
        const path = normalizeVirtualPath(input.path, {
          agentId: options.agentId,
          allowRoot: false,
        });

        return withOptionalLock(path, async () => {
          const file = await options.backend.readFile(path);
          const matches = countOccurrences(file.content, input.oldStr);

          if (matches === 0) {
            throw new S3FilesError({
              code: "NOT_FOUND",
              message: `No match for the requested text was found in ${path}.`,
              statusCode: 404,
            });
          }

          if (!input.replaceAll && matches > 1) {
            throw new S3FilesError({
              code: "CONFLICT",
              message: `Found ${matches} matches in ${path}; set replaceAll to replace every match.`,
              statusCode: 409,
            });
          }

          const nextContent = input.replaceAll
            ? file.content.split(input.oldStr).join(input.newStr)
            : file.content.replace(input.oldStr, input.newStr);

          await options.backend.writeFile(path, nextContent, {
            append: false,
            createParents: false,
          });

          return {
            ok: true,
            command: "str_replace",
            path,
            replacements: input.replaceAll ? matches : 1,
            bytesWritten: byteLength(nextContent),
          };
        });
      }
    }
  };
}

function splitLines(input: string): string[] {
  if (input.length === 0) {
    return [""];
  }

  return input.split(/\r?\n/u);
}

function countOccurrences(content: string, needle: string): number {
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

function truncateUtf8(
  content: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const encoded = textEncoder.encode(content);
  if (encoded.length <= maxBytes) {
    return { value: content, truncated: false };
  }

  return {
    value: textDecoder.decode(encoded.slice(0, maxBytes)),
    truncated: true,
  };
}
