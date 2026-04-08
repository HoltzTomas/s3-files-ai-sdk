# s3-files-ai-sdk

`s3-files-ai-sdk` gives AI agents using the Vercel AI SDK a real, persistent filesystem backed by [Amazon S3 Files](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files.html).

It is designed for agent workloads that want filesystem semantics without paying for EFS or relying on local disk. Each agent gets its own isolated root at `/agents/${agentId}/`, and the tool works in either direct mount mode or through a lightweight HTTP proxy for edge-style runtimes.

## Why this package exists

Amazon S3 Files turns an S3 bucket into a POSIX filesystem that you mount with:

```bash
sudo mount -t s3files <file-system-id>:/ /mnt/agent-fs
```

That is a great fit for AI agents, but most agent frameworks want a model-facing tool, not raw `fs.promises`. This package wraps that mounted filesystem in a compact AI SDK tool that supports safe reads, edits, writes, listings, and deletes while staying scoped to a single agent.

## Features

- Works with `generateText`, `streamText`, and `ToolLoopAgent`
- Two runtime modes:
  - `direct` for Node.js runtimes with a mounted S3 Files filesystem
  - `remote` for edge or proxy-based runtimes that call a mounted backend over HTTP
- Per-agent isolation under `/agents/${agentId}/`
- Compact tool responses to keep token usage down
- Optional advisory locking for mutating operations
- Strict TypeScript types and exported public config/input/output types

## Install

```bash
npm install s3-files-ai-sdk ai zod
```

Peer/runtime requirements:

- Node.js `>=20`
- `ai@^6`
- A mounted Amazon S3 Files filesystem for direct mode or for the proxy backend

## Quickstart: Direct Mode

The direct mode is for environments that already have S3 Files mounted, such as Lambda, EC2, EKS, or ECS.

```ts
import { generateText, type LanguageModel } from "ai";
import { createS3FilesTool } from "s3-files-ai-sdk";

export async function summarizeWorkspace(model: LanguageModel) {
  const agentFs = createS3FilesTool({
    mode: "direct",
    mountPath: process.env.S3_FILES_MOUNT_PATH ?? "/mnt/agent-fs",
    agentId: process.env.AGENT_ID ?? "agent-direct-demo",
    lockTimeoutMs: 10_000,
  });

  const result = await generateText({
    model,
    tools: agentFs.tools,
    prompt:
      "List /notes, read the most relevant file, and summarize the current project state.",
  });

  return result.text;
}
```

See the runnable example in [`examples/generate-text-direct.ts`](./examples/generate-text-direct.ts).

## Quickstart: Remote Mode

The remote mode is for environments that cannot mount S3 Files directly, such as Vercel or other edge-style runtimes.

```ts
import { ToolLoopAgent, type LanguageModel } from "ai";
import { createS3FilesTool } from "s3-files-ai-sdk";

export function createRemoteWorkspaceAgent(model: LanguageModel) {
  const agentFs = createS3FilesTool({
    mode: "remote",
    remoteEndpoint: process.env.S3_FILES_ENDPOINT!,
    bearerToken: process.env.S3_FILES_BEARER_TOKEN!,
    agentId: process.env.AGENT_ID ?? "agent-remote-demo",
    lockTimeoutMs: 10_000,
  });

  return new ToolLoopAgent({
    model,
    tools: agentFs.tools,
    instructions:
      "Use the filesystem tool to inspect, update, and persist project files.",
  });
}
```

See [`examples/tool-loop-agent-remote.ts`](./examples/tool-loop-agent-remote.ts).

## Quickstart: Proxy Endpoint

The proxy runs in a Node.js environment that can access the mount.

```ts
import { createS3FilesProxy } from "s3-files-ai-sdk/proxy";

export const POST = createS3FilesProxy({
  mountPath: process.env.S3_FILES_MOUNT_PATH ?? "/mnt/agent-fs",
  bearerToken: process.env.S3_FILES_BEARER_TOKEN!,
});
```

See [`examples/next-route-proxy.ts`](./examples/next-route-proxy.ts).

## Supported Commands

The tool exposes a single AI SDK tool with these commands:

| Command | Purpose | Notes |
| --- | --- | --- |
| `list` | List directory contents | Supports `depth` and `limit` |
| `view` | Read file contents | Supports `startLine` and `endLine`; output is truncated by configured byte/line limits |
| `write` | Create, overwrite, or append to a file | Supports `append` and `createParents` |
| `mkdir` | Create a directory | Supports `recursive` |
| `delete` | Delete a file or directory | `recursive` is required for non-empty directories |
| `stat` | Inspect metadata | Returns type, size, mtime, and mode when available |
| `str_replace` | Perform safe text replacement | Errors on 0 or multiple matches unless `replaceAll: true` |

The tool returns compact, command-specific output objects and an even smaller model-facing string output for the LLM.

## Security and Isolation

- Every tool instance is scoped to `/agents/${agentId}/`
- Paths are normalized and rejected if they attempt traversal, target reserved S3 Files recovery paths, or access the internal lock directory
- Remote mode uses bearer-token authentication and keeps the protocol internal to the package

## Locking

Set `lockTimeoutMs` to enable library-level advisory locking for mutating commands.

- Locks are cooperative, not OS-level mandatory locks
- Lock directories live under `/.s3-files-locks/` inside the scoped agent root
- The lock manager cleans up stale leases and times out rather than blocking forever

Amazon S3 Files itself supports POSIX locking, but this package uses portable sidecar locks so the behavior is predictable across both direct and proxied flows.

## S3 Files Behavior to Know About

This library intentionally documents S3 Files behavior instead of hiding it:

- First access to a directory can be slower while metadata is warmed
- Sync between the mounted filesystem and S3 is asynchronous
- S3 remains the source of truth if another writer updates the same keys outside the mount

For the official details, see the AWS docs:

- [Working with Amazon S3 Files](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files.html)
- [Getting started with Amazon S3 Files](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-getting-started.html)
- [Launch blog post](https://aws.amazon.com/blogs/aws/launching-s3-files-making-s3-buckets-accessible-as-file-systems/)

## Public API

The package exports:

- `createS3FilesTool`
- `createS3FilesProxy`
- `S3FilesToolConfig`
- `CreateS3FilesToolResult`
- `S3FilesProxyConfig`
- `RetryPolicy`
- `S3FilesToolInput`
- `S3FilesToolOutput`

Type definitions live in [`src/types.ts`](./src/types.ts).

## Examples and Use Cases

- [`examples/generate-text-direct.ts`](./examples/generate-text-direct.ts)
- [`examples/tool-loop-agent-remote.ts`](./examples/tool-loop-agent-remote.ts)
- [`examples/next-route-proxy.ts`](./examples/next-route-proxy.ts)
- [`examples/persistent-workspace-cycle.ts`](./examples/persistent-workspace-cycle.ts)
- [`docs/use-cases.md`](./docs/use-cases.md)

## Development

```bash
npm install
npm run ci
```

## Releasing

This repo uses Changesets and GitHub Actions for releases.

- Normal releases can use npm trusted publishing with GitHub OIDC
- The first-ever publish of a brand-new package still needs `NPM_TOKEN` so npm can create the package before a trusted publisher is attached

For contribution and release details, see [`CONTRIBUTING.md`](./CONTRIBUTING.md).
