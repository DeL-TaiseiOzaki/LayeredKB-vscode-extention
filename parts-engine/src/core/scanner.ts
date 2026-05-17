// コア層: ワークスペース走査でパーツを収集する（仕様 §10 CLI/UI が共有する索引）．

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { PartId } from "./index.js";
import { parsePart, type Part, type PartParseIssue } from "./part.js";

export interface PartIndex {
  // PartId → Part（重複 ID は最初に見つかったものを採用し issue を立てる）．
  byId: Map<PartId, Part>;
  parts: Part[];
  issues: PartParseIssue[];
}

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  ".vscode-test",
]);

async function collectMarkdown(root: string, dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE.has(entry.name) || entry.name.startsWith(".")) continue;
      await collectMarkdown(root, full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(full);
    }
  }
}

// root 配下の *.md を再帰的に読み、パーツ索引を構築する．
export async function scanWorkspace(root: string): Promise<PartIndex> {
  const files: string[] = [];
  await collectMarkdown(root, root, files);
  files.sort();

  const byId = new Map<PartId, Part>();
  const parts: Part[] = [];
  const issues: PartParseIssue[] = [];

  for (const file of files) {
    const rel = relative(root, file);
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch (err) {
      issues.push({ filePath: rel, message: `読み込み失敗: ${(err as Error).message}` });
      continue;
    }
    const { part, issues: partIssues } = parsePart(source, rel);
    issues.push(...partIssues);
    if (!part) continue;
    const id = part.meta.part;
    if (id && byId.has(id)) {
      issues.push({
        filePath: rel,
        field: "part",
        message: `パーツ ID '${id}' が重複しています（既出: ${byId.get(id)!.filePath}）`,
      });
      continue;
    }
    if (id) byId.set(id, part);
    parts.push(part);
  }

  return { byId, parts, issues };
}
