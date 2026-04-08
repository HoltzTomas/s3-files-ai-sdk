import {
  PROTOCOL_VERSION,
  S3FilesError,
  fromSerializedError,
  proxyResponseSchema,
  s3FilesToolInputSchema,
  s3FilesToolOutputSchema,
  withRetry
} from "./chunk-IMGFCLOX.js";

// src/adapters/remote-backend.ts
function createRemoteCommandExecutor(config) {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new S3FilesError({
      code: "NOT_SUPPORTED",
      message: "Remote mode requires a global fetch implementation.",
      statusCode: 500
    });
  }
  return async (input) => withRetry({
    policy: config.retryPolicy,
    run: async () => {
      const response = await fetchImpl(config.remoteEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.bearerToken}`,
          ...config.headers
        },
        body: JSON.stringify({
          version: PROTOCOL_VERSION,
          agentId: config.agentId,
          command: input,
          options: {
            lockTimeoutMs: config.lockTimeoutMs,
            maxReadBytes: config.maxReadBytes,
            maxReadLines: config.maxReadLines,
            maxListEntries: config.maxListEntries
          }
        })
      });
      const payload = await parseResponse(response);
      if (!payload.ok) {
        const errorOptions = {
          code: payload.error.code,
          message: payload.error.message,
          statusCode: payload.error.statusCode
        };
        if (payload.error.details !== void 0) {
          errorOptions.details = payload.error.details;
        }
        if (payload.error.retryable !== void 0) {
          errorOptions.retryable = payload.error.retryable;
        }
        throw fromSerializedError(errorOptions);
      }
      return payload.result;
    },
    shouldRetry: (error) => {
      return error instanceof TypeError || error instanceof S3FilesError && (error.retryable || error.statusCode === 429 || error.statusCode >= 500);
    }
  });
}
async function parseResponse(response) {
  const rawText = await response.text();
  let parsed = null;
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok && parsed === null) {
    throw new S3FilesError({
      code: response.status === 401 ? "AUTHENTICATION_FAILED" : "BACKEND_UNAVAILABLE",
      message: response.status === 401 ? "Proxy authentication failed." : `Remote filesystem request failed with status ${response.status}.`,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
      details: { body: rawText || void 0 }
    });
  }
  const validated = proxyResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new S3FilesError({
      code: "REMOTE_ERROR",
      message: "Remote filesystem response did not match the expected protocol.",
      statusCode: response.status || 500,
      details: { issues: validated.error.issues }
    });
  }
  if (!response.ok && validated.data.ok) {
    throw new S3FilesError({
      code: "REMOTE_ERROR",
      message: `Remote filesystem request failed with status ${response.status}.`,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500
    });
  }
  return validated.data;
}

// src/core/create-tool.ts
import { tool } from "ai";

// src/core/tool-output.ts
function toModelOutput(output) {
  switch (output.command) {
    case "list": {
      const header = `Listed ${output.entries.length} entr${output.entries.length === 1 ? "y" : "ies"} in ${output.path}.`;
      const body = output.entries.length === 0 ? "Directory is empty." : output.entries.map((entry) => {
        const parts = [`[${entry.type}]`, entry.path];
        if (entry.type === "file") {
          parts.push(`${entry.size} B`);
        }
        if (entry.mtime) {
          parts.push(`mtime ${entry.mtime}`);
        }
        return parts.join(" ");
      }).join("\n");
      const suffix = output.truncated ? `
Output truncated to ${output.limit} entries.` : "";
      return `${header}
${body}${suffix}`;
    }
    case "view": {
      const range = `Viewing ${output.path} lines ${output.startLine}-${output.endLine} of ${output.totalLines}.`;
      const truncation = output.truncated ? `
Truncated${output.truncatedByBytes ? " by byte limit" : ""}${output.truncatedByLines ? " by line limit" : ""}.` : "";
      return `${range}
${output.content}${truncation}`;
    }
    case "write":
      return `${output.appended ? "Appended" : "Wrote"} ${output.bytesWritten} bytes to ${output.path}.`;
    case "mkdir":
      return `Created directory ${output.path}.`;
    case "delete":
      return `Deleted ${output.path}.`;
    case "stat": {
      const entry = output.entry;
      const parts = [
        `${entry.path} is a ${entry.type}`,
        `${entry.size} B`,
        entry.mtime ? `mtime ${entry.mtime}` : null,
        entry.mode !== void 0 ? `mode ${entry.mode.toString(8)}` : null
      ].filter(Boolean);
      return parts.join(", ");
    }
    case "str_replace":
      return `Replaced ${output.replacements} match${output.replacements === 1 ? "" : "es"} in ${output.path} and wrote ${output.bytesWritten} bytes.`;
  }
}

// src/core/create-tool.ts
function createToolFromExecutor(options) {
  const filesystemTool = tool({
    description: options.description ?? "Read, write, list, inspect, create, delete, and safely edit files inside the agent's isolated filesystem root.",
    inputSchema: s3FilesToolInputSchema,
    outputSchema: s3FilesToolOutputSchema,
    execute: async (input) => options.execute(input),
    toModelOutput: ({ output }) => ({
      type: "text",
      value: toModelOutput(output)
    })
  });
  return {
    name: options.toolName,
    tool: filesystemTool,
    tools: {
      [options.toolName]: filesystemTool
    },
    agentRoot: "/"
  };
}

export {
  createRemoteCommandExecutor,
  createToolFromExecutor
};
//# sourceMappingURL=chunk-5U3BLEEU.js.map