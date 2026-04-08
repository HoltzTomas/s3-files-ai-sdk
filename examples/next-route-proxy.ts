import { createS3FilesProxy } from "s3-files-ai-sdk/proxy";

export const POST = createS3FilesProxy({
  mountPath: "/mnt/agent-fs",
  bearerToken: process.env.S3_FILES_PROXY_BEARER_TOKEN!,
});
