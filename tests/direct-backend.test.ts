import { afterEach, describe, expect, it } from "vitest";

import { createDirectBackend } from "../src/adapters/direct-backend.ts";
import { createTempMount } from "./test-helpers.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("direct backend", () => {
  it("reads, writes, stats, and lists files inside the scoped root", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const backend = createDirectBackend({
      mountPath: temp.mountPath,
      agentId: "agent-direct",
    });

    await backend.ensureRoot();
    await backend.mkdir("/notes", { recursive: true });
    await backend.writeFile("/notes/idea.md", "hello world", {
      createParents: true,
    });

    const file = await backend.readFile("/notes/idea.md");
    const stat = await backend.stat("/notes/idea.md");
    const entries = await backend.readdir("/", { depth: 2, limit: 10 });

    expect(file.content).toBe("hello world");
    expect(stat.type).toBe("file");
    expect(entries.map((entry) => entry.path)).toEqual([
      "/notes",
      "/notes/idea.md",
    ]);
  });

  it("removes files and directories", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const backend = createDirectBackend({
      mountPath: temp.mountPath,
      agentId: "agent-delete",
    });

    await backend.ensureRoot();
    await backend.writeFile("/tmp.txt", "delete me", {
      createParents: true,
    });
    await backend.rm("/tmp.txt");

    await expect(backend.stat("/tmp.txt")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
