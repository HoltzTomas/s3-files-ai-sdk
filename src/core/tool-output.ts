import type { S3FilesToolOutput } from "./tool-schema.js";

export function toModelOutput(output: S3FilesToolOutput): string {
  switch (output.command) {
    case "list": {
      const header = `Listed ${output.entries.length} entr${output.entries.length === 1 ? "y" : "ies"} in ${output.path}.`;
      const body =
        output.entries.length === 0
          ? "Directory is empty."
          : output.entries
              .map((entry) => {
                const parts = [`[${entry.type}]`, entry.path];
                if (entry.type === "file") {
                  parts.push(`${entry.size} B`);
                }
                if (entry.mtime) {
                  parts.push(`mtime ${entry.mtime}`);
                }
                return parts.join(" ");
              })
              .join("\n");

      const suffix = output.truncated
        ? `\nOutput truncated to ${output.limit} entries.`
        : "";

      return `${header}\n${body}${suffix}`;
    }

    case "view": {
      const range = `Viewing ${output.path} lines ${output.startLine}-${output.endLine} of ${output.totalLines}.`;
      const truncation = output.truncated
        ? `\nTruncated${output.truncatedByBytes ? " by byte limit" : ""}${output.truncatedByLines ? " by line limit" : ""}.`
        : "";
      return `${range}\n${output.content}${truncation}`;
    }

    case "write":
      return `${output.appended ? "Appended" : "Wrote"} ${output.bytesWritten} bytes to ${output.path}.`;

    case "mkdir":
      return `Created directory ${output.path}.`;

    case "delete":
      return `Deleted ${output.path}.`;

    case "stat": {
      const entry = output.entry;
      const parts = [
        `${entry.path} is a ${entry.type}`,
        `${entry.size} B`,
        entry.mtime ? `mtime ${entry.mtime}` : null,
        entry.mode !== undefined ? `mode ${entry.mode.toString(8)}` : null,
      ].filter(Boolean);

      return parts.join(", ");
    }

    case "str_replace":
      return `Replaced ${output.replacements} match${output.replacements === 1 ? "" : "es"} in ${output.path} and wrote ${output.bytesWritten} bytes.`;
  }
}
