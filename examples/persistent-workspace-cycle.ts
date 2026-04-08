import { generateText, type LanguageModel } from "ai";
import { createS3FilesTool } from "s3-files-ai-sdk";

const mountPath = process.env.S3_FILES_MOUNT_PATH ?? "/mnt/agent-fs";
const agentId = process.env.AGENT_ID ?? "agent-persistent-workspace-demo";

/**
 * Example workflow:
 * 1. Inspect the current workspace
 * 2. Update a durable memory file
 * 3. Persist the new plan back to the same agent root
 */
export async function runPersistentWorkspaceCycle(model: LanguageModel) {
  const agentFs = createS3FilesTool({
    mode: "direct",
    mountPath,
    agentId,
    lockTimeoutMs: 10_000,
  });

  const result = await generateText({
    model,
    tools: agentFs.tools,
    prompt: [
      "Open /memory/project-brief.md if it exists.",
      "Review any files in /notes and /drafts that help you understand the current state.",
      "Update /memory/project-brief.md with a concise summary and the next three actions.",
      "If the file does not exist, create it.",
    ].join(" "),
  });

  return result.text;
}
