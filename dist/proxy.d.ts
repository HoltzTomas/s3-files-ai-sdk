import { b as S3FilesProxyConfig } from './types-Cr6q34CI.js';
import 'ai';

/**
 * Creates a POST handler for environments that can access the mounted S3 Files path.
 */
declare function createS3FilesProxy(config: S3FilesProxyConfig): (request: Request) => Promise<Response>;

export { S3FilesProxyConfig, createS3FilesProxy };
