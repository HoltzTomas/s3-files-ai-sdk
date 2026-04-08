import { createS3FilesProxy } from "s3-files-ai-sdk/proxy";

export const POST = createS3FilesProxy({
  mountPath: process.env.S3_FILES_MOUNT_PATH ?? "/mnt/agent-fs",
  bearerToken: process.env.S3_FILES_BEARER_TOKEN!,
});
