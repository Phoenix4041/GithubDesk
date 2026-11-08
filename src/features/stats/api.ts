import { call } from "@/shared/lib/tauri-client";

export interface DayActivity {
  date: string;
  commits: number;
}

export interface Contributor {
  name: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
  firstCommit: number;
  lastCommit: number;
}

export interface FileChurn {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  authors: number;
}

export interface FolderActivity {
  path: string;
  commits: number;
  lines: number;
}

export interface SoleOwnerFile {
  path: string;
  commits: number;
  size: number;
  author: string;
  email: string;
}

export interface RepoStats {
  commits: number;
  limit: number;
  truncated: boolean;
  activity: DayActivity[];
  contributors: Contributor[];
  files: FileChurn[];
  folders: FolderActivity[];
  busFactor: SoleOwnerFile[];
}

export interface TodoItem {
  path: string;
  line: number;
  kind: string;
  text: string;
}

export interface TodoReport {
  items: TodoItem[];
  truncated: boolean;
}

export interface LineAuthor {
  hash: string;
  author: string;
  email: string;
  time: number;
  committed: boolean;
}

export const STATS_COMMIT_LIMIT = 20_000;

export function collectStats(repoPath: string, jobId: string, limit: number = STATS_COMMIT_LIMIT): Promise<RepoStats> {
  return call<RepoStats>("stats_collect", { repoPath, jobId, limit });
}

export function findTodos(repoPath: string): Promise<TodoReport> {
  return call<TodoReport>("stats_todos", { repoPath });
}

export function lineAuthor(repoPath: string, path: string, line: number): Promise<LineAuthor> {
  return call<LineAuthor>("stats_line_author", { repoPath, path, line });
}
