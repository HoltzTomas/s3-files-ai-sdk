import { generateText } from "ai";
import { createS3FilesTool } from "s3-files-ai-sdk";

declare const model: Parameters<typeof generateText>[0]["model"];

const agentFs = createS3FilesTool({
  mode: "direct",
  mountPath: "/mnt/agent-fs",
  agentId: "agent-123abc",
  lockTimeoutMs: 10_000,
});

async function main() {
  const result = await generateText({
    model,
    prompt: "Read /notes and summarize the current project ideas.",
    tools: agentFs.tools,
  });

  console.log(result.text);
}

void main();
