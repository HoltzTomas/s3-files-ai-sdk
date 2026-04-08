import { tool } from "ai";

import type { CreateS3FilesToolResult } from "../types.js";
import type { S3FilesToolInput, S3FilesToolOutput } from "./tool-schema.js";
import { s3FilesToolInputSchema, s3FilesToolOutputSchema } from "./tool-schema.js";
import { toModelOutput } from "./tool-output.js";

export interface CreateToolOptions {
  toolName: string;
  description?: string;
  execute: (input: S3FilesToolInput) => Promise<S3FilesToolOutput>;
}

export function createToolFromExecutor(
  options: CreateToolOptions,
): CreateS3FilesToolResult {
  const filesystemTool = tool<S3FilesToolInput, S3FilesToolOutput>({
    description:
      options.description ??
      "Read, write, list, inspect, create, delete, and safely edit files inside the agent's isolated filesystem root.",
    inputSchema: s3FilesToolInputSchema,
    outputSchema: s3FilesToolOutputSchema,
    execute: async (input) => options.execute(input),
    toModelOutput: ({ output }) => ({
      type: "text",
      value: toModelOutput(output),
    }),
  });

  return {
    name: options.toolName,
    tool: filesystemTool,
    tools: {
      [options.toolName]: filesystemTool,
    },
    agentRoot: "/",
  };
}
