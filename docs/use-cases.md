# Use Cases

## 1. Direct mode in Lambda, EC2, or EKS

Use `mode: "direct"` when your runtime can mount Amazon S3 Files locally.

This is the best fit when:

- the application already runs in a Node.js environment
- the S3 Files mount is available at boot
- you want the fewest moving parts between the agent and the filesystem

Typical pattern:

- mount S3 Files at `/mnt/agent-fs`
- create one tool instance per agent run
- scope that tool with a stable `agentId`
- let the model read, update, and persist files within `/agents/${agentId}/`

## 2. Remote mode behind Next.js or Vercel

Use `mode: "remote"` when the user-facing runtime cannot mount the filesystem itself.

Typical architecture:

- your edge app or route handler uses `createS3FilesTool({ mode: "remote", ... })`
- requests go to a small Node.js proxy created by `createS3FilesProxy`
- the proxy runs in an environment that can mount S3 Files directly

This keeps the LLM-facing code simple while isolating mount access to the backend service that owns the filesystem.

## 3. Persistent memory and scratch space across runs

Agents often need a workspace that survives beyond one tool loop.

Examples:

- project notes in `/notes/`
- generated drafts in `/drafts/`
- intermediate artifacts in `/scratch/`
- durable memory summaries in `/memory/`

Because the tool always scopes to the same agent root, you can reuse a stable `agentId` when you want state to persist across invocations.

## 4. Multi-agent isolation

Use different `agentId` values to isolate independent agents, users, or jobs.

Examples:

- `agent-user-123`
- `agent-session-2026-04-08`
- `agent-research-worker-7`

Each tool instance sees only `/`, but the underlying storage resolves to `/agents/${agentId}/`. That keeps one agent from accidentally reading or mutating another agent's workspace.

## Choosing between direct and remote

Choose direct mode when:

- you already have a mounted S3 Files path
- your runtime is Node.js
- you want the lowest latency and least infrastructure

Choose remote mode when:

- your frontend or edge environment cannot mount S3 Files
- you want a single backend service to own mount access
- you need a simple HTTP boundary between the app runtime and the filesystem
