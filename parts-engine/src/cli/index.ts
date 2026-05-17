#!/usr/bin/env node
// CLI: パーツ一覧・詳細表示・整合性チェック（仕様 §10, §13）．
// 段階C: list / show / check を実装．グラフ操作・分割/結合は拡張側（段階E）．

import { VERSION } from "../core/index.js";
import { scanWorkspace } from "../core/scanner.js";
import { RelationGraph } from "../core/graph.js";
import { checkConsistency } from "../consistency/engine.js";

function out(s: string): void {
  process.stdout.write(s + "\n");
}
function err(s: string): void {
  process.stderr.write(s + "\n");
}

async function cmdList(root: string): Promise<number> {
  const idx = await scanWorkspace(root);
  if (idx.parts.length === 0) {
    out("(パーツが見つかりません)");
    return 0;
  }
  const byType = new Map<string, typeof idx.parts>();
  for (const p of idx.parts) {
    const list = byType.get(p.meta.type) ?? [];
    list.push(p);
    byType.set(p.meta.type, list);
  }
  for (const [type, parts] of [...byType.entries()].sort()) {
    out(`# ${type} (${parts.length})`);
    for (const p of parts) {
      out(`  ${p.meta.part}  ${p.meta.title}  — ${p.meta.oneline}`);
    }
  }
  return 0;
}

async function cmdShow(root: string, id: string | undefined): Promise<number> {
  if (!id) {
    err("使い方: parts show <part-id>");
    return 2;
  }
  const idx = await scanWorkspace(root);
  const part = idx.byId.get(id);
  if (!part) {
    err(`パーツ '${id}' が見つかりません`);
    return 1;
  }
  const g = new RelationGraph(idx);
  out(`part:    ${part.meta.part}`);
  out(`type:    ${part.meta.type}`);
  out(`title:   ${part.meta.title}`);
  out(`oneline: ${part.meta.oneline}`);
  out(`summary: ${part.meta.summary}`);
  out(`file:    ${part.filePath}  (${part.lineCount} 行)`);
  const og = g.outgoing(id);
  if (og.length) out(`-> ${og.map((e) => `${e.relation}:${e.to}`).join(", ")}`);
  const ic = g.incoming(id);
  if (ic.length) out(`<- ${ic.map((e) => `${e.relation}:${e.from}`).join(", ")}`);
  return 0;
}

async function cmdCheck(root: string): Promise<number> {
  const idx = await scanWorkspace(root);
  let failed = false;

  for (const issue of idx.issues) {
    failed = true;
    const loc = issue.field ? `${issue.filePath} [${issue.field}]` : issue.filePath;
    err(`構造エラー: ${loc}: ${issue.message}`);
  }

  const inconsistencies = checkConsistency(idx);
  for (const v of inconsistencies) {
    const tag =
      v.tier === "tier1_absolute_block"
        ? "BLOCK"
        : v.tier === "tier2_decision_block"
          ? "DECIDE"
          : "REVIEW";
    err(`[${tag}] ${v.kind} @ ${v.part}: ${v.message}`);
    if (v.tier === "tier1_absolute_block") failed = true;
  }

  const tier1 = inconsistencies.filter((v) => v.tier === "tier1_absolute_block").length;
  out(
    `パーツ ${idx.parts.length} 件 / 構造エラー ${idx.issues.length} / ` +
      `整合性違反 ${inconsistencies.length}（うち絶対ブロック ${tier1}）`,
  );
  return failed ? 1 : 0;
}

async function main(argv: string[]): Promise<number> {
  const [, , cmd, arg] = argv;
  const root = process.cwd();
  switch (cmd) {
    case "--version":
    case "-v":
      out(`parts ${VERSION}`);
      return 0;
    case "list":
      return cmdList(root);
    case "show":
      return cmdShow(root, arg);
    case "check":
      return cmdCheck(root);
    default:
      out("使い方: parts <list|show <id>|check> [--version]");
      return cmd ? 2 : 0;
  }
}

main(process.argv).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    err(`エラー: ${(e as Error).message}`);
    process.exitCode = 1;
  },
);
