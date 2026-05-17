import * as vscode from "vscode";
import { PartsState } from "./state.js";
import { PartsProvider } from "./partsProvider.js";
import { refreshDiagnostics } from "./diagnostics.js";
import { PartHoverProvider } from "./hover.js";
import { goToRelated, splitActivePart, mergeSelectedParts } from "./commands.js";

export function activate(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }
  const state = new PartsState(folder.uri.fsPath);
  const provider = new PartsProvider(state);
  const treeView = vscode.window.createTreeView("partsExplorer", {
    treeDataProvider: provider,
  });
  const diagnostics = vscode.languages.createDiagnosticCollection("parts");

  const runAll = async (notify: boolean): Promise<void> => {
    const index = await state.refresh();
    provider.refresh();
    const { blocking } = refreshDiagnostics(state.root, index, diagnostics);
    if (notify) {
      const msg = `Parts: ${index.parts.length} 件 / 構造エラー ${index.issues.length} / 絶対ブロック ${blocking}`;
      if (blocking > 0 || index.issues.length > 0) {
        void vscode.window.showWarningMessage(msg);
      } else {
        void vscode.window.showInformationMessage(msg);
      }
    }
  };

  context.subscriptions.push(
    treeView,
    diagnostics,
    vscode.languages.registerHoverProvider(
      { language: "markdown" },
      new PartHoverProvider(state),
    ),
    vscode.commands.registerCommand("parts.refresh", () => runAll(false)),
    vscode.commands.registerCommand("parts.check", () => runAll(true)),
    vscode.commands.registerCommand("parts.goToRelated", () => goToRelated(state)),
    vscode.commands.registerCommand("parts.split", () => splitActivePart(state)),
    vscode.commands.registerCommand("parts.merge", () => mergeSelectedParts(state)),
  );

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.md");
  const onChange = () => void runAll(false);
  watcher.onDidCreate(onChange);
  watcher.onDidDelete(onChange);
  watcher.onDidChange(onChange);
  context.subscriptions.push(watcher);

  void runAll(false);
}

export function deactivate(): void {}
