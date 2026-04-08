import {
  createRemoteCommandExecutor,
  createToolFromExecutor
} from "./chunk-5U3BLEEU.js";
import {
  S3FilesError,
  assertValidAgentId
} from "./chunk-IMGFCLOX.js";

// src/index.web.ts
function createS3FilesTool(config) {
  assertValidAgentId(config.agentId);
  if (config.mode !== "remote") {
    throw new S3FilesError({
      code: "NOT_SUPPORTED",
      message: "Direct mode requires a Node.js runtime with an S3 Files mount. Use the Node export or switch to remote mode.",
      statusCode: 500
    });
  }
  return createToolFromExecutor({
    toolName: config.toolName ?? "s3_files",
    execute: createRemoteCommandExecutor(config)
  });
}
export {
  createS3FilesTool
};
//# sourceMappingURL=index.web.js.map