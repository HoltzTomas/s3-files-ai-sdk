import { describe, expect, it } from "vitest";

import {
  assertValidAgentId,
  normalizeVirtualPath,
} from "../src/core/path-scope.ts";
import { S3FilesError } from "../src/core/errors.ts";

describe("path scoping", () => {
  it("normalizes relative paths under the agent root", () => {
    expect(
      normalizeVirtualPath("notes/idea.md", {
        agentId: "agent-123",
      }),
    ).toBe("/notes/idea.md");
  });

  it("rejects traversal and internal paths", () => {
    expect(() =>
      normalizeVirtualPath("../secrets.txt", {
        agentId: "agent-123",
      }),
    ).toThrowError(S3FilesError);

    expect(() =>
      normalizeVirtualPath("/.s3-files-locks/abc", {
        agentId: "agent-123",
      }),
    ).toThrowError(S3FilesError);
  });

  it("rejects reserved S3 Files recovery paths", () => {
    expect(() =>
      normalizeVirtualPath("/.s3files-lost+found-2026-04-07/orphan", {
        agentId: "agent-123",
      }),
    ).toThrowError(/Reserved S3 Files recovery directories/);
  });

  it("enforces the scoped S3 key length limit", () => {
    const tooLong = `/${Array.from({ length: 6 }, () => "a".repeat(200)).join("/")}`;

    expect(() =>
      normalizeVirtualPath(tooLong, {
        agentId: "agent-123",
      }),
    ).toThrowError(/S3 key limit/);
  });

  it("requires a path-safe agent id", () => {
    expect(() => assertValidAgentId("agent/123")).toThrowError(
      /single path-safe segment/,
    );
  });
});
