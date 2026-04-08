import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createTempMount(): Promise<{
  mountPath: string;
  cleanup: () => Promise<void>;
}> {
  const mountPath = await mkdtemp(path.join(tmpdir(), "s3-files-ai-sdk-"));

  return {
    mountPath,
    cleanup: async () => {
      await rm(mountPath, { recursive: true, force: true });
    },
  };
}

export const toolExecutionOptions = {
  toolCallId: "tool-call-1",
  messages: [],
};
