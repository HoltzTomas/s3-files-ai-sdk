# s3-files-ai-sdk

Filesystem tools for the Vercel AI SDK backed by Amazon S3 Files mounts.

## Features

- Agent-scoped filesystem roots under `/agents/${agentId}/`
- Direct mode for runtimes that already have an S3 Files mount
- Remote mode for edge or proxy-based runtimes
- Single AI SDK tool with `list`, `view`, `write`, `mkdir`, `delete`, `stat`, and `str_replace`
- Optional advisory locking for mutating commands

## Usage

```ts
import { createS3FilesTool } from "s3-files-ai-sdk";

const agentFs = createS3FilesTool({
  mode: "direct",
  mountPath: "/mnt/agent-fs",
  agentId: "agent-123abc",
  lockTimeoutMs: 10_000,
});
```

```ts
import { createS3FilesProxy } from "s3-files-ai-sdk/proxy";

export const POST = createS3FilesProxy({
  mountPath: "/mnt/agent-fs",
  bearerToken: process.env.S3_FILES_PROXY_BEARER_TOKEN!,
});
```

## Notes

- Direct mode relies on a local S3 Files mount such as `sudo mount -t s3files <file-system-id>:/ /mnt/agent-fs`.
- Library-level locks use sidecar directories under `/.s3-files-locks/`.
- S3 Files sync remains asynchronous, so S3 is still the source of truth for cross-surface conflicts.
