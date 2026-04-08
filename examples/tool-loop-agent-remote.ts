import { ToolLoopAgent } from "ai";
import { createS3FilesTool } from "s3-files-ai-sdk";

declare const model: ConstructorParameters<typeof ToolLoopAgent>[0]["model"];

const agentFs = createS3FilesTool({
  mode: "remote",
  remoteEndpoint: "https://fs.example.com/api/fs",
  bearerToken: "replace-me",
  agentId: "agent-123abc",
  lockTimeoutMs: 10_000,
});

const agent = new ToolLoopAgent({
  model,
  tools: agentFs.tools,
  instructions: "Use the filesystem tool to inspect and update project files.",
});

async function main() {
  const result = await agent.generate({
    prompt: "Open /notes/idea.md, improve the draft, and save the result.",
  });

  console.log(result.text);
}

void main();
