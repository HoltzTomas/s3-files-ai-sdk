import { ToolLoopAgent, type LanguageModel } from "ai";
import { createS3FilesTool } from "s3-files-ai-sdk";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function createRemoteWorkspaceAgent(model: LanguageModel) {
  const agentFs = createS3FilesTool({
    mode: "remote",
    remoteEndpoint: requiredEnv("S3_FILES_ENDPOINT"),
    bearerToken: requiredEnv("S3_FILES_BEARER_TOKEN"),
    agentId: process.env.AGENT_ID ?? "agent-remote-demo",
    lockTimeoutMs: 10_000,
  });

  return new ToolLoopAgent({
    model,
    tools: agentFs.tools,
    instructions:
      "Use the filesystem tool to inspect, update, and persist project files.",
  });
}
