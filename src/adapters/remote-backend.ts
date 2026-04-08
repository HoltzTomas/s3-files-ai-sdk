import type { S3FilesToolInput, S3FilesToolOutput } from "../core/tool-schema.js";
import { fromSerializedError, S3FilesError } from "../core/errors.js";
import { withRetry } from "../core/retry-policy.js";
import { PROTOCOL_VERSION, proxyResponseSchema } from "../http/protocol.js";
import type { RemoteS3FilesToolConfig } from "../types.js";

export function createRemoteCommandExecutor(
  config: RemoteS3FilesToolConfig,
): (input: S3FilesToolInput) => Promise<S3FilesToolOutput> {
  const fetchImpl = config.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new S3FilesError({
      code: "NOT_SUPPORTED",
      message: "Remote mode requires a global fetch implementation.",
      statusCode: 500,
    });
  }

  return async (input) =>
    withRetry({
      policy: config.retryPolicy,
      run: async () => {
        const response = await fetchImpl(config.remoteEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.bearerToken}`,
            ...config.headers,
          },
          body: JSON.stringify({
            version: PROTOCOL_VERSION,
            agentId: config.agentId,
            command: input,
            options: {
              lockTimeoutMs: config.lockTimeoutMs,
              maxReadBytes: config.maxReadBytes,
              maxReadLines: config.maxReadLines,
              maxListEntries: config.maxListEntries,
            },
          }),
        });

        const payload = await parseResponse(response);

        if (!payload.ok) {
          const errorOptions: Parameters<typeof fromSerializedError>[0] = {
            code: payload.error.code as Parameters<
              typeof fromSerializedError
            >[0]["code"],
            message: payload.error.message,
            statusCode: payload.error.statusCode,
          };

          if (payload.error.details !== undefined) {
            errorOptions.details = payload.error.details;
          }

          if (payload.error.retryable !== undefined) {
            errorOptions.retryable = payload.error.retryable;
          }

          throw fromSerializedError(errorOptions);
        }

        return payload.result;
      },
      shouldRetry: (error) => {
        return (
          error instanceof TypeError ||
          (error instanceof S3FilesError &&
            (error.retryable || error.statusCode === 429 || error.statusCode >= 500))
        );
      },
    });
}

async function parseResponse(response: Response) {
  const rawText = await response.text();
  let parsed: unknown = null;

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
      message:
        response.status === 401
          ? "Proxy authentication failed."
          : `Remote filesystem request failed with status ${response.status}.`,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
      details: { body: rawText || undefined },
    });
  }

  const validated = proxyResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new S3FilesError({
      code: "REMOTE_ERROR",
      message: "Remote filesystem response did not match the expected protocol.",
      statusCode: response.status || 500,
      details: { issues: validated.error.issues },
    });
  }

  if (!response.ok && validated.data.ok) {
    throw new S3FilesError({
      code: "REMOTE_ERROR",
      message: `Remote filesystem request failed with status ${response.status}.`,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
    });
  }

  return validated.data;
}
