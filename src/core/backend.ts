import type { RetryPolicy } from "./retry-policy.js";

export type EntryType = "file" | "directory";

export interface BackendEntry {
  path: string;
  name: string;
  type: EntryType;
  size: number;
  mtime: string | null;
  mode?: number;
}

export interface BackendStat {
  path: string;
  type: EntryType;
  size: number;
  mtime: string | null;
  mode?: number;
}

export interface BackendFile extends BackendStat {
  content: string;
}

export interface WriteFileOptions {
  append?: boolean;
  createParents?: boolean;
}

export interface ReadDirOptions {
  depth?: number;
  limit?: number;
}

export interface RemoveOptions {
  recursive?: boolean;
  force?: boolean;
}

export interface FileSystemBackend {
  ensureRoot(): Promise<void>;
  readFile(path: string): Promise<BackendFile>;
  writeFile(path: string, content: string, options?: WriteFileOptions): Promise<BackendStat>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string, options?: ReadDirOptions): Promise<BackendEntry[]>;
  stat(path: string): Promise<BackendStat>;
  rm(path: string, options?: RemoveOptions): Promise<void>;
}

export interface BackendConfig {
  agentId: string;
  retryPolicy?: RetryPolicy;
}
