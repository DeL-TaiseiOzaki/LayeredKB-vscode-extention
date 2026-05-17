import * as vscode from "vscode";
import * as path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  RelationGraph,
  splitPart,
  mergeParts,
  SPLIT_MARKER,
  type Part,
} from "parts-engine";
import type { PartsState } from "./state.js";

const today = (): string => new Date().toISOString().slice(0, 10);

function activePart(state: PartsState): Part | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) return undefined;
  const rel = path.relative(state.root, uri.fsPath);
  return state.index?.parts.find((p) => p.filePath === rel);
}

function fileFor(state: PartsState, rel: string): string {
  return path.join(state.root, rel);
}

async function confirm(message: string): Promise<boolean> {
  const pick = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    "実行",
  );
  return pick === "実行";
}

export async function goToRelated(state: PartsState): Promise<void> {
  const part = activePart(state);
  if (!part || !state.index) {
    void vscode.window.showInformationMessage("アクティブなパーツがありません");
    return;
  }
  const g = new RelationGraph(state.index);
  const items: (vscode.QuickPickItem & { target: string })[] = [
    ...g.outgoing(part.meta.part).map((e) => ({
      label: `→ ${e.to}`,
      description: e.relation,
      target: e.to,
    })),
    ...g.incoming(part.meta.part).map((e) => ({
      label: `← ${e.from}`,
      description: `${e.relation} (被参照)`,
      target: e.from,
    })),
  ];
  if (items.length === 0) {
    void vscode.window.showInformationMessage("関係がありません");
    return;
  }
  const chosen = await vscode.window.showQuickPick(items, {
    placeHolder: "移動先の関係パーツ",
  });
  if (!chosen) return;
  const target = state.index.byId.get(chosen.target);
  if (!target) {
    void vscode.window.showWarningMessage(`'${chosen.target}' は未解決の参照です`);
    return;
  }
  await vscode.window.showTextDocument(
    vscode.Uri.file(fileFor(state, target.filePath)),
  );
}

export async function splitActivePart(state: PartsState): Promise<void> {
  const part = activePart(state);
  if (!part) {
    void vscode.window.showInformationMessage("アクティブなパーツがありません");
    return;
  }
  if (!part.body.includes(SPLIT_MARKER)) {
    void vscode.window.showWarningMessage(
      `本文に分割位置の marker '${SPLIT_MARKER}' を置いてください`,
    );
    return;
  }
  const newId = await vscode.window.showInputBox({
    prompt: "新パーツの part ID",
    validateInput: (v) => (v.trim() ? null : "ID は必須です"),
  });
  if (!newId) return;
  const newTitle = await vscode.window.showInputBox({ prompt: "新パーツの title" });
  if (newTitle === undefined) return;

  const { original, extracted } = splitPart(part, {
    newId: newId.trim(),
    newTitle: newTitle.trim() || newId.trim(),
    today: today(),
  });
  const dir = path.dirname(fileFor(state, part.filePath));
  const newFile = path.join(dir, `${newId.trim().replace(/[/\\]/g, "_")}.md`);
  if (!(await confirm(`分割を実行: 元を更新し ${path.basename(newFile)} を作成します`))) {
    return;
  }
  await writeFile(fileFor(state, part.filePath), original, "utf8");
  await writeFile(newFile, extracted, "utf8");
  await vscode.commands.executeCommand("parts.refresh");
  await vscode.window.showTextDocument(vscode.Uri.file(newFile));
}

export async function mergeSelectedParts(state: PartsState): Promise<void> {
  const all = state.index?.parts ?? [];
  if (all.length < 2) {
    void vscode.window.showInformationMessage("結合できるパーツが不足しています");
    return;
  }
  const picks = await vscode.window.showQuickPick(
    all.map((p) => ({ label: p.meta.part, description: p.meta.title, part: p })),
    { canPickMany: true, placeHolder: "結合するパーツを 2 つ以上選択" },
  );
  if (!picks || picks.length < 2) return;
  const newId = await vscode.window.showInputBox({
    prompt: "結合後の part ID",
    validateInput: (v) => (v.trim() ? null : "ID は必須です"),
  });
  if (!newId) return;
  const newTitle = await vscode.window.showInputBox({ prompt: "結合後の title" });
  if (newTitle === undefined) return;

  const doc = mergeParts(
    picks.map((p) => p.part),
    { newId: newId.trim(), newTitle: newTitle.trim() || newId.trim(), today: today() },
  );
  const newFile = path.join(
    state.root,
    `${newId.trim().replace(/[/\\]/g, "_")}.md`,
  );
  if (
    !(await confirm(
      `結合を実行: ${path.basename(newFile)} を作成します（元パーツは保持し supersedes で連結）`,
    ))
  ) {
    return;
  }
  await writeFile(newFile, doc, "utf8");
  await vscode.commands.executeCommand("parts.refresh");
  await vscode.window.showTextDocument(vscode.Uri.file(newFile));
}
