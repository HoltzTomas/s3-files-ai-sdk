import type { ToolSet } from "ai";

import type { RetryPolicy } from "./core/retry-policy.js";
import type { S3FilesToolInput, S3FilesToolOutput } from "./core/tool-schema.js";

/**
 * Shared configuration for both direct and remote modes.
 */
export interface BaseS3FilesToolConfig {
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
   * Advisory lock timeout for mutating operations.
   * Defaults to `10000`; set to `0` to disable library-level locking.
   *
   * @default 10000
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
export interface DirectS3FilesToolConfig extends BaseS3FilesToolConfig {
  mode: "direct";
  mountPath: string;
}

/**
 * Remote mode forwards commands to a lightweight HTTP proxy that has the S3 Files mount.
 */
export interface RemoteS3FilesToolConfig extends BaseS3FilesToolConfig {
  mode: "remote";
  remoteEndpoint: string;
  bearerToken: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

export type S3FilesToolConfig =
  | DirectS3FilesToolConfig
  | RemoteS3FilesToolConfig;

/**
 * Configuration for the HTTP proxy endpoint.
 */
export interface S3FilesProxyConfig {
  mountPath: string;
  bearerToken: string;
  retryPolicy?: RetryPolicy;
}

/**
 * Returned by `createS3FilesTool`.
 */
export interface CreateS3FilesToolResult {
  name: string;
  tool: ToolSet[string];
  tools: Record<string, ToolSet[string]>;
  agentRoot: "/";
}

export type { RetryPolicy, S3FilesToolInput, S3FilesToolOutput };
