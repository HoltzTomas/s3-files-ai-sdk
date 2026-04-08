import { createDirectBackend } from "../adapters/direct-backend.js";
import { createLocalCommandExecutor } from "../core/commands.js";
import { serializeError, S3FilesError } from "../core/errors.js";
import { assertValidAgentId } from "../core/path-scope.js";
import { proxyRequestSchema } from "./protocol.js";
import type { S3FilesProxyConfig } from "../types.js";

/**
 * Creates a POST handler for environments that can access the mounted S3 Files path.
 */
export function createS3FilesProxy(config: S3FilesProxyConfig) {
  return async function POST(request: Request): Promise<Response> {
    try {
      if (request.method && request.method !== "POST") {
        return json(
          {
            ok: false,
            error: serializeError(
              new S3FilesError({
                code: "INVALID_REQUEST",
                message: "Only POST requests are supported.",
                statusCode: 405,
              }),
            ),
          },
          405,
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
                statusCode: 401,
              }),
            ),
          },
          401,
        );
      }

      const rawBody = (await request.json()) as unknown;
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
                details: { issues: parsed.error.issues },
              }),
            ),
          },
          400,
        );
      }

      assertValidAgentId(parsed.data.agentId);

      const backendConfig: Parameters<typeof createDirectBackend>[0] = {
        mountPath: config.mountPath,
        agentId: parsed.data.agentId,
      };
      if (config.retryPolicy !== undefined) {
        backendConfig.retryPolicy = config.retryPolicy;
      }

      const backend = createDirectBackend(backendConfig);

      const executorOptions: Parameters<typeof createLocalCommandExecutor>[0] = {
        backend,
        agentId: parsed.data.agentId,
      };
      if (parsed.data.options?.lockTimeoutMs !== undefined) {
        executorOptions.lockTimeoutMs = parsed.data.options.lockTimeoutMs;
      }
      if (parsed.data.options?.maxReadBytes !== undefined) {
        executorOptions.maxReadBytes = parsed.data.options.maxReadBytes;
      }
      if (parsed.data.options?.maxReadLines !== undefined) {
        executorOptions.maxReadLines = parsed.data.options.maxReadLines;
      }
      if (parsed.data.options?.maxListEntries !== undefined) {
        executorOptions.maxListEntries = parsed.data.options.maxListEntries;
      }

      const execute = createLocalCommandExecutor(executorOptions);
      const result = await execute(parsed.data.command);

      return json({
        ok: true,
        result,
      });
    } catch (error) {
      const serialized = serializeError(error);
      return json(
        {
          ok: false,
          error: serialized,
        },
        serialized.statusCode,
      );
    }
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
