import { createRemoteCommandExecutor } from "./adapters/remote-backend.js";
import { createToolFromExecutor } from "./core/create-tool.js";
import { S3FilesError } from "./core/errors.js";
import { assertValidAgentId } from "./core/path-scope.js";
import type {
  CreateS3FilesToolResult,
  S3FilesToolConfig,
} from "./types.js";

export type * from "./types.js";

/**
 * Edge-safe entrypoint. Direct mode must use the Node export.
 */
export function createS3FilesTool(
  config: S3FilesToolConfig,
): CreateS3FilesToolResult {
  assertValidAgentId(config.agentId);

  if (config.mode !== "remote") {
    throw new S3FilesError({
      code: "NOT_SUPPORTED",
      message:
        "Direct mode requires a Node.js runtime with an S3 Files mount. Use the Node export or switch to remote mode.",
      statusCode: 500,
    });
  }

  return createToolFromExecutor({
    toolName: config.toolName ?? "s3_files",
    execute: createRemoteCommandExecutor(config),
  });
}
