import { S as S3FilesToolConfig, C as CreateS3FilesToolResult } from './types-Cr6q34CI.js';
export { B as BaseS3FilesToolConfig, D as DirectS3FilesToolConfig, R as RemoteS3FilesToolConfig, a as RetryPolicy, b as S3FilesProxyConfig } from './types-Cr6q34CI.js';
export { S as S3FilesToolInput, a as S3FilesToolOutput } from './tool-schema-C7yc_tDK.js';
import 'ai';
import 'zod';

/**
 * Create an AI SDK tool that exposes an agent-scoped filesystem.
 */
declare function createS3FilesTool(config: S3FilesToolConfig): CreateS3FilesToolResult;

export { CreateS3FilesToolResult, S3FilesToolConfig, createS3FilesTool };
