import { afterEach, describe, expect, it } from "vitest";

import { createS3FilesTool } from "../src/index.node.ts";
import { createS3FilesProxy } from "../src/proxy.ts";
import { createTempMount, toolExecutionOptions } from "./test-helpers.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("remote proxy mode", () => {
  it("executes tool commands through the proxy", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const handler = createS3FilesProxy({
      mountPath: temp.mountPath,
      bearerToken: "secret-token",
    });

    const filesystem = createS3FilesTool({
      mode: "remote",
      remoteEndpoint: "https://example.test/api/fs",
      bearerToken: "secret-token",
      agentId: "agent-remote",
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        return handler(new Request(url, init));
      },
    });

    const execute = filesystem.tool.execute;
    if (!execute) {
      throw new Error("Expected the tool to have an execute function.");
    }

    await execute(
      {
        command: "write",
        path: "/remote.txt",
        content: "remote contents",
      },
      toolExecutionOptions,
    );

    const result = await execute(
      {
        command: "view",
        path: "/remote.txt",
      },
      toolExecutionOptions,
    );

    expect(result).toMatchObject({
      command: "view",
      content: "remote contents",
    });
  });

  it("accepts lockTimeoutMs: 0 for remote mode", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const handler = createS3FilesProxy({
      mountPath: temp.mountPath,
      bearerToken: "secret-token",
    });

    const filesystem = createS3FilesTool({
      mode: "remote",
      remoteEndpoint: "https://example.test/api/fs",
      bearerToken: "secret-token",
      agentId: "agent-remote-no-locks",
      lockTimeoutMs: 0,
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        return handler(new Request(url, init));
      },
    });

    const execute = filesystem.tool.execute;
    if (!execute) {
      throw new Error("Expected the tool to have an execute function.");
    }

    const result = await execute(
      {
        command: "write",
        path: "/remote.txt",
        content: "remote contents",
      },
      toolExecutionOptions,
    );

    expect(result).toMatchObject({
      command: "write",
      bytesWritten: 15,
    });
  });

  it("retries retryable proxy failures and surfaces auth errors", async () => {
    const temp = await createTempMount();
    cleanup = temp.cleanup;

    const handler = createS3FilesProxy({
      mountPath: temp.mountPath,
      bearerToken: "secret-token",
    });

    let calls = 0;
    const retryingTool = createS3FilesTool({
      mode: "remote",
      remoteEndpoint: "https://example.test/api/fs",
      bearerToken: "secret-token",
      agentId: "agent-retry",
      retryPolicy: {
        retries: 1,
        initialDelayMs: 1,
        maxDelayMs: 1,
        jitter: false,
      },
      fetch: async (input, init) => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: "BACKEND_UNAVAILABLE",
                message: "retry me",
                statusCode: 503,
                retryable: true,
              },
            }),
            {
              status: 503,
              headers: { "content-type": "application/json" },
            },
          );
        }

        const url = typeof input === "string" ? input : input.toString();
        return handler(new Request(url, init));
      },
    });

    const execute = retryingTool.tool.execute;
    if (!execute) {
      throw new Error("Expected the tool to have an execute function.");
    }

    const result = await execute(
      {
        command: "write",
        path: "/retry.txt",
        content: "retried",
      },
      toolExecutionOptions,
    );

    expect(calls).toBe(2);
    expect(result).toMatchObject({
      command: "write",
      bytesWritten: 7,
    });

    const unauthorizedTool = createS3FilesTool({
      mode: "remote",
      remoteEndpoint: "https://example.test/api/fs",
      bearerToken: "wrong-token",
      agentId: "agent-auth",
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        return handler(new Request(url, init));
      },
    });

    const unauthorizedExecute = unauthorizedTool.tool.execute;
    if (!unauthorizedExecute) {
      throw new Error("Expected the tool to have an execute function.");
    }

    await expect(
      unauthorizedExecute(
        {
          command: "stat",
          path: "/retry.txt",
        },
        toolExecutionOptions,
      ),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
  });
});
