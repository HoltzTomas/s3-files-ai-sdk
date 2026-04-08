import { createDirectBackend } from "./adapters/direct-backend.js";
import { createRemoteCommandExecutor } from "./adapters/remote-backend.js";
import { createLocalCommandExecutor } from "./core/commands.js";
import { createToolFromExecutor } from "./core/create-tool.js";
import { assertValidAgentId } from "./core/path-scope.js";
import type {
  CreateS3FilesToolResult,
  S3FilesToolConfig,
} from "./types.js";

export type * from "./types.js";

/**
 * Create an AI SDK tool that exposes an agent-scoped filesystem.
 */
export function createS3FilesTool(
  config: S3FilesToolConfig,
): CreateS3FilesToolResult {
  assertValidAgentId(config.agentId);

  const execute =
    config.mode === "direct"
      ? createLocalCommandExecutor(
          createLocalExecutorOptions(config),
        )
      : createRemoteCommandExecutor(config);

  return createToolFromExecutor({
    toolName: config.toolName ?? "s3_files",
    execute,
  });
}

function createLocalExecutorOptions(
  config: Extract<S3FilesToolConfig, { mode: "direct" }>,
): Parameters<typeof createLocalCommandExecutor>[0] {
  const backendConfig: Parameters<typeof createDirectBackend>[0] = {
    mountPath: config.mountPath,
    agentId: config.agentId,
  };
  if (config.retryPolicy !== undefined) {
    backendConfig.retryPolicy = config.retryPolicy;
  }

  const options: Parameters<typeof createLocalCommandExecutor>[0] = {
    backend: createDirectBackend(backendConfig),
    agentId: config.agentId,
  };

  if (config.lockTimeoutMs !== undefined) {
    options.lockTimeoutMs = config.lockTimeoutMs;
  }
  if (config.maxReadBytes !== undefined) {
    options.maxReadBytes = config.maxReadBytes;
  }
  if (config.maxReadLines !== undefined) {
    options.maxReadLines = config.maxReadLines;
  }
  if (config.maxListEntries !== undefined) {
    options.maxListEntries = config.maxListEntries;
  }

  return options;
}
