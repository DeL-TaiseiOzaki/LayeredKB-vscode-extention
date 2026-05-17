import * as vscode from "vscode";
import * as path from "node:path";
import { checkConsistency, type PartIndex } from "parts-engine";

function severityFor(tier: string): vscode.DiagnosticSeverity {
  if (tier === "tier1_absolute_block") return vscode.DiagnosticSeverity.Error;
  if (tier === "tier2_decision_block") return vscode.DiagnosticSeverity.Warning;
  return vscode.DiagnosticSeverity.Information;
}

// 索引から構造エラーと整合性違反を Problems パネルへ反映する。
export function refreshDiagnostics(
  root: string,
  index: PartIndex,
  collection: vscode.DiagnosticCollection,
): { blocking: number } {
  collection.clear();

  const byFile = new Map<string, vscode.Diagnostic[]>();
  const push = (relPath: string, d: vscode.Diagnostic) => {
    const list = byFile.get(relPath) ?? [];
    list.push(d);
    byFile.set(relPath, list);
  };
  const topOfFile = new vscode.Range(0, 0, 0, 0);

  for (const issue of index.issues) {
    const d = new vscode.Diagnostic(
      topOfFile,
      issue.field ? `[${issue.field}] ${issue.message}` : issue.message,
      vscode.DiagnosticSeverity.Error,
    );
    d.source = "parts:structure";
    push(issue.filePath, d);
  }

  let blocking = 0;
  for (const v of checkConsistency(index)) {
    if (v.tier === "tier1_absolute_block") blocking++;
    const part = index.byId.get(v.part);
    const d = new vscode.Diagnostic(
      topOfFile,
      `${v.kind}: ${v.message}`,
      severityFor(v.tier),
    );
    d.source = `parts:${v.tier}`;
    push(part?.filePath ?? v.part, d);
  }

  for (const [relPath, diags] of byFile) {
    collection.set(vscode.Uri.file(path.join(root, relPath)), diags);
  }
  return { blocking };
}
