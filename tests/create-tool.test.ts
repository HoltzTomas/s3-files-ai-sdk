import { afterEach, describe, expect, it } from "vitest";

import { createS3FilesTool } from "../src/index.node.ts";
import { createTempMount, toolExecutionOptions } from "./test-helpers.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("createS3FilesTool", () => {
  it("supports write, view with truncation, and list", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const filesystem = createS3FilesTool({
      mode: "direct",
      mountPath: temp.mountPath,
      agentId: "agent-tool",
      maxReadLines: 2,
      maxListEntries: 1,
    });

    const execute = filesystem.tool.execute;
    if (!execute) {
      throw new Error("Expected the tool to have an execute function.");
    }

    await execute(
      {
        command: "write",
        path: "/notes/idea.md",
        content: "line1\nline2\nline3\nline4",
        createParents: true,
      },
      toolExecutionOptions,
    );

    await execute(
      {
        command: "write",
        path: "/notes/todo.md",
        content: "todo",
      },
      toolExecutionOptions,
    );

    const viewResult = await execute(
      {
        command: "view",
        path: "/notes/idea.md",
        startLine: 2,
        endLine: 4,
      },
      toolExecutionOptions,
    );

    const listResult = await execute(
      {
        command: "list",
        path: "/notes",
      },
      toolExecutionOptions,
    );

    expect(viewResult).toMatchObject({
      command: "view",
      content: "line2\nline3",
      truncated: true,
      truncatedByLines: true,
    });
    expect(listResult).toMatchObject({
      command: "list",
      truncated: true,
      entries: [{ path: "/notes/idea.md" }],
    });
  });

  it("requires explicit replaceAll when multiple matches exist", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const filesystem = createS3FilesTool({
      mode: "direct",
      mountPath: temp.mountPath,
      agentId: "agent-replace",
    });

    const execute = filesystem.tool.execute;
    if (!execute) {
      throw new Error("Expected the tool to have an execute function.");
    }

    await execute(
      {
        command: "write",
        path: "/doc.txt",
        content: "hello world\nhello again",
      },
      toolExecutionOptions,
    );

    await expect(
      execute(
        {
          command: "str_replace",
          path: "/doc.txt",
          oldStr: "hello",
          newStr: "hi",
        },
        toolExecutionOptions,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
