export type S3FilesErrorCode =
  | "ALREADY_EXISTS"
  | "AUTHENTICATION_FAILED"
  | "BACKEND_UNAVAILABLE"
  | "CONFLICT"
  | "DIRECTORY_NOT_EMPTY"
  | "INVALID_PATH"
  | "INVALID_REQUEST"
  | "IS_A_DIRECTORY"
  | "LOCK_TIMEOUT"
  | "NAME_TOO_LONG"
  | "NOT_A_DIRECTORY"
  | "NOT_FOUND"
  | "NOT_SUPPORTED"
  | "PATH_TOO_LONG"
  | "PERMISSION_DENIED"
  | "REMOTE_ERROR";

export type S3FilesErrorDetails = Record<string, unknown>;

/**
 * Structured error used across direct mode, remote mode, and the proxy.
 */
export class S3FilesError extends Error {
  readonly code: S3FilesErrorCode;
  readonly statusCode: number;
  readonly details: S3FilesErrorDetails | undefined;
  readonly retryable: boolean;

  constructor(options: {
    code: S3FilesErrorCode;
    message: string;
    statusCode?: number;
    details?: S3FilesErrorDetails;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "S3FilesError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

export function isS3FilesError(error: unknown): error is S3FilesError {
  return error instanceof S3FilesError;
}

export function toS3FilesError(error: unknown): S3FilesError {
  if (isS3FilesError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new S3FilesError({
      code: "REMOTE_ERROR",
      message: error.message,
      cause: error,
    });
  }

  return new S3FilesError({
    code: "REMOTE_ERROR",
    message: "An unknown filesystem error occurred.",
    details: { error },
  });
}

export function serializeError(error: unknown): {
  code: S3FilesErrorCode;
  message: string;
  statusCode: number;
  details?: S3FilesErrorDetails;
  retryable?: boolean;
} {
  const normalized = toS3FilesError(error);

  const serialized: {
    code: S3FilesErrorCode;
    message: string;
    statusCode: number;
    details?: S3FilesErrorDetails;
    retryable?: boolean;
  } = {
    code: normalized.code,
    message: normalized.message,
    statusCode: normalized.statusCode,
  };

  if (normalized.details !== undefined) {
    serialized.details = normalized.details;
  }

  if (normalized.retryable) {
    serialized.retryable = true;
  }

  return serialized;
}

export function fromSerializedError(error: {
  code: S3FilesErrorCode;
  message: string;
  statusCode: number;
  details?: S3FilesErrorDetails;
  retryable?: boolean;
}): S3FilesError {
  const options: ConstructorParameters<typeof S3FilesError>[0] = {
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
  };

  if (error.details !== undefined) {
    options.details = error.details;
  }

  if (error.retryable !== undefined) {
    options.retryable = error.retryable;
  }

  return new S3FilesError(options);
}
