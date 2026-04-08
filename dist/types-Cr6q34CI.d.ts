import { ToolSet } from 'ai';

interface RetryPolicy {
    /**
     * Number of retries after the first attempt.
     *
     * @default 2
     */
    retries?: number;
    /**
     * Initial delay between attempts in milliseconds.
     *
     * @default 100
     */
    initialDelayMs?: number;
    /**
     * Maximum backoff delay in milliseconds.
     *
     * @default 1000
     */
    maxDelayMs?: number;
    /**
     * Exponential factor applied between attempts.
     *
     * @default 2
     */
    factor?: number;
    /**
     * When true, randomize the backoff delay to reduce stampedes.
     *
     * @default true
     */
    jitter?: boolean;
}

/**
 * Shared configuration for both direct and remote modes.
 */
interface BaseS3FilesToolConfig {
    /**
     * Isolates every tool instance under `/agents/${agentId}/`.
     */
    agentId: string;
    /**
     * Name exposed to the model.
     *
     * @default "s3_files"
     */
    toolName?: string;
    /**
     * Enables advisory locking for mutating operations.
     * Set to `undefined` to disable library-level locking.
     */
    lockTimeoutMs?: number;
    /**
     * Maximum UTF-8 bytes returned by `view`.
     *
     * @default 32768
     */
    maxReadBytes?: number;
    /**
     * Maximum lines returned by `view`.
     *
     * @default 400
     */
    maxReadLines?: number;
    /**
     * Maximum entries returned by `list`.
     *
     * @default 200
     */
    maxListEntries?: number;
    /**
     * Retry policy used for transient filesystem and network failures.
     */
    retryPolicy?: RetryPolicy;
}
/**
 * Direct mode uses a local S3 Files mount and Node's filesystem APIs.
 */
interface DirectS3FilesToolConfig extends BaseS3FilesToolConfig {
    mode: "direct";
    mountPath: string;
}
/**
 * Remote mode forwards commands to a lightweight HTTP proxy that has the S3 Files mount.
 */
interface RemoteS3FilesToolConfig extends BaseS3FilesToolConfig {
    mode: "remote";
    remoteEndpoint: string;
    bearerToken: string;
    headers?: Record<string, string>;
    fetch?: typeof globalThis.fetch;
}
type S3FilesToolConfig = DirectS3FilesToolConfig | RemoteS3FilesToolConfig;
/**
 * Configuration for the HTTP proxy endpoint.
 */
interface S3FilesProxyConfig {
    mountPath: string;
    bearerToken: string;
    retryPolicy?: RetryPolicy;
}
/**
 * Returned by `createS3FilesTool`.
 */
interface CreateS3FilesToolResult {
    name: string;
    tool: ToolSet[string];
    tools: Record<string, ToolSet[string]>;
    agentRoot: "/";
}

export type { BaseS3FilesToolConfig as B, CreateS3FilesToolResult as C, DirectS3FilesToolConfig as D, RemoteS3FilesToolConfig as R, S3FilesToolConfig as S, RetryPolicy as a, S3FilesProxyConfig as b };
