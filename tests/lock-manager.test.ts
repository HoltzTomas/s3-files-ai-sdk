import { afterEach, describe, expect, it } from "vitest";

import { createDirectBackend } from "../src/adapters/direct-backend.ts";
import { AdvisoryLockManager } from "../src/core/lock-manager.ts";
import { createLockPath, INTERNAL_LOCK_DIR } from "../src/core/path-scope.ts";
import { createTempMount } from "./test-helpers.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("AdvisoryLockManager", () => {
  it("times out when another operation holds the same lock", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const backend = createDirectBackend({
      mountPath: temp.mountPath,
      agentId: "agent-lock",
    });

    const holder = new AdvisoryLockManager(backend, 200);
    const waiter = new AdvisoryLockManager(backend, 120);

    await backend.ensureRoot();

    await holder.withLock("/notes/shared.txt", async () => {
      await expect(
        waiter.withLock("/notes/shared.txt", async () => "unreachable"),
      ).rejects.toMatchObject({
        code: "LOCK_TIMEOUT",
      });
    });
  });

  it("cleans up stale locks and acquires the path", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const backend = createDirectBackend({
      mountPath: temp.mountPath,
      agentId: "agent-stale-lock",
    });

    await backend.ensureRoot();
    await backend.mkdir(INTERNAL_LOCK_DIR, { recursive: true });

    const targetPath = "/notes/stale.txt";
    const lockPath = await createLockPath(targetPath);
    await backend.mkdir(lockPath);
    await backend.writeFile(
      `${lockPath}/lease.json`,
      JSON.stringify({
        targetPath,
        ownerId: "stale-owner",
        createdAt: new Date(Date.now() - 10_000).toISOString(),
        expiresAt: new Date(Date.now() - 5_000).toISOString(),
      }),
    );

    const manager = new AdvisoryLockManager(backend, 250);
    const value = await manager.withLock(targetPath, async () => "acquired");

    expect(value).toBe("acquired");
  });
});
