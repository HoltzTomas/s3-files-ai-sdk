import {
  createRemoteCommandExecutor,
  createToolFromExecutor
} from "./chunk-5U3BLEEU.js";
import {
  createDirectBackend,
  createLocalCommandExecutor
} from "./chunk-CE7EMM3L.js";
import {
  assertValidAgentId
} from "./chunk-IMGFCLOX.js";

// src/index.node.ts
function createS3FilesTool(config) {
  assertValidAgentId(config.agentId);
  const execute = config.mode === "direct" ? createLocalCommandExecutor(
    createLocalExecutorOptions(config)
  ) : createRemoteCommandExecutor(config);
  return createToolFromExecutor({
    toolName: config.toolName ?? "s3_files",
    execute
  });
}
function createLocalExecutorOptions(config) {
  const backendConfig = {
    mountPath: config.mountPath,
    agentId: config.agentId
  };
  if (config.retryPolicy !== void 0) {
    backendConfig.retryPolicy = config.retryPolicy;
  }
  const options = {
    backend: createDirectBackend(backendConfig),
    agentId: config.agentId
  };
  if (config.lockTimeoutMs !== void 0) {
    options.lockTimeoutMs = config.lockTimeoutMs;
  }
  if (config.maxReadBytes !== void 0) {
    options.maxReadBytes = config.maxReadBytes;
  }
  if (config.maxReadLines !== void 0) {
    options.maxReadLines = config.maxReadLines;
  }
  if (config.maxListEntries !== void 0) {
    options.maxListEntries = config.maxListEntries;
  }
  return options;
}
export {
  createS3FilesTool
};
//# sourceMappingURL=index.node.js.map