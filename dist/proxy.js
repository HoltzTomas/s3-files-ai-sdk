import {
  createDirectBackend,
  createLocalCommandExecutor
} from "./chunk-CE7EMM3L.js";
import {
  S3FilesError,
  assertValidAgentId,
  proxyRequestSchema,
  serializeError
} from "./chunk-IMGFCLOX.js";

// src/http/proxy-handler.ts
function createS3FilesProxy(config) {
  return async function POST(request) {
    try {
      if (request.method && request.method !== "POST") {
        return json(
          {
            ok: false,
            error: serializeError(
              new S3FilesError({
                code: "INVALID_REQUEST",
                message: "Only POST requests are supported.",
                statusCode: 405
              })
            )
          },
          405
        );
      }
      const authorization = request.headers.get("authorization");
      const expected = `Bearer ${config.bearerToken}`;
      if (authorization !== expected) {
        return json(
          {
            ok: false,
            error: serializeError(
              new S3FilesError({
                code: "AUTHENTICATION_FAILED",
                message: "Invalid bearer token.",
                statusCode: 401
              })
            )
          },
          401
        );
      }
      const rawBody = await request.json();
      const parsed = proxyRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return json(
          {
            ok: false,
            error: serializeError(
              new S3FilesError({
                code: "INVALID_REQUEST",
                message: "Request body did not match the filesystem protocol.",
                statusCode: 400,
                details: { issues: parsed.error.issues }
              })
            )
          },
          400
        );
      }
      assertValidAgentId(parsed.data.agentId);
      const backendConfig = {
        mountPath: config.mountPath,
        agentId: parsed.data.agentId
      };
      if (config.retryPolicy !== void 0) {
        backendConfig.retryPolicy = config.retryPolicy;
      }
      const backend = createDirectBackend(backendConfig);
      const executorOptions = {
        backend,
        agentId: parsed.data.agentId
      };
      if (parsed.data.options?.lockTimeoutMs !== void 0) {
        executorOptions.lockTimeoutMs = parsed.data.options.lockTimeoutMs;
      }
      if (parsed.data.options?.maxReadBytes !== void 0) {
        executorOptions.maxReadBytes = parsed.data.options.maxReadBytes;
      }
      if (parsed.data.options?.maxReadLines !== void 0) {
        executorOptions.maxReadLines = parsed.data.options.maxReadLines;
      }
      if (parsed.data.options?.maxListEntries !== void 0) {
        executorOptions.maxListEntries = parsed.data.options.maxListEntries;
      }
      const execute = createLocalCommandExecutor(executorOptions);
      const result = await execute(parsed.data.command);
      return json({
        ok: true,
        result
      });
    } catch (error) {
      const serialized = serializeError(error);
      return json(
        {
          ok: false,
          error: serialized
        },
        serialized.statusCode
      );
    }
  };
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
export {
  createS3FilesProxy
};
//# sourceMappingURL=proxy.js.map