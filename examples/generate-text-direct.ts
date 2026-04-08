import { generateText, type LanguageModel } from "ai";
import { createS3FilesTool } from "s3-files-ai-sdk";

const mountPath = process.env.S3_FILES_MOUNT_PATH ?? "/mnt/agent-fs";
const agentId = process.env.AGENT_ID ?? "agent-direct-demo";

export async function summarizeWorkspace(model: LanguageModel) {
  const agentFs = createS3FilesTool({
    mode: "direct",
    mountPath,
    agentId,
    lockTimeoutMs: 10_000,
  });

  const result = await generateText({
    model,
    tools: agentFs.tools,
    prompt:
      "List /notes, read the most relevant file, and summarize the current project state.",
  });

  return result.text;
}
