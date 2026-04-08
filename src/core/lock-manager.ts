import type { FileSystemBackend } from "./backend.js";
import { S3FilesError, isS3FilesError } from "./errors.js";
import { createLockPath, INTERNAL_LOCK_DIR } from "./path-scope.js";
import { sleep } from "./retry-policy.js";

interface LockLease {
  targetPath: string;
  ownerId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Cooperative lock manager implemented with sidecar directories inside the agent root.
 */
export class AdvisoryLockManager {
  constructor(
    private readonly backend: FileSystemBackend,
    private readonly timeoutMs: number,
  ) {}

  async withLock<T>(targetPath: string, run: () => Promise<T>): Promise<T> {
    const release = await this.acquire(targetPath);

    try {
      return await run();
    } finally {
      await release();
    }
  }

  private async acquire(targetPath: string): Promise<() => Promise<void>> {
    await this.backend.mkdir(INTERNAL_LOCK_DIR, { recursive: true });

    const lockPath = await createLockPath(targetPath);
    const ownerId = crypto.randomUUID();
    const now = Date.now();
    const staleAfterMs = Math.max(this.timeoutMs, 5000);
    const lease: LockLease = {
      targetPath,
      ownerId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + staleAfterMs).toISOString(),
    };
    const startedAt = Date.now();

    while (true) {
      try {
        await this.backend.mkdir(lockPath, { recursive: false });
        try {
          await this.backend.writeFile(
            `${lockPath}/lease.json`,
            JSON.stringify(lease),
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
              details: { targetPath, timeoutMs: this.timeoutMs },
            });
          }

          await sleep(100);
          continue;
        }

        await this.safeRemove(lockPath);
      }
    }
  }

  private async isStale(lockPath: string, staleAfterMs: number): Promise<boolean> {
    try {
      const leaseFile = await this.backend.readFile(`${lockPath}/lease.json`);
      const parsed = JSON.parse(leaseFile.content) as Partial<LockLease>;

      if (typeof parsed.expiresAt === "string") {
        return Date.parse(parsed.expiresAt) <= Date.now();
      }
    } catch (error) {
      if (!this.isNotFound(error)) {
        return false;
      }
    }

    try {
      const stat = await this.backend.stat(lockPath);
      if (!stat.mtime) {
        return false;
      }

      return Date.parse(stat.mtime) + staleAfterMs <= Date.now();
    } catch (error) {
      return this.isNotFound(error);
    }
  }

  private async safeRemove(lockPath: string): Promise<void> {
    try {
      await this.backend.rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (!this.isNotFound(error)) {
        throw error;
      }
    }
  }

  private isAlreadyExists(error: unknown): boolean {
    return isS3FilesError(error) && error.code === "ALREADY_EXISTS";
  }

  private isNotFound(error: unknown): boolean {
    return isS3FilesError(error) && error.code === "NOT_FOUND";
  }
}
