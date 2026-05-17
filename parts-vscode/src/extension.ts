import * as vscode from "vscode";
import { PartsProvider } from "./partsProvider.js";
import { refreshDiagnostics } from "./diagnostics.js";

export function activate(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }
  const root = folder.uri.fsPath;

  const provider = new PartsProvider(root);
  const treeView = vscode.window.createTreeView("partsExplorer", {
    treeDataProvider: provider,
  });

  const diagnostics = vscode.languages.createDiagnosticCollection("parts");

  const runAll = async (notify: boolean): Promise<void> => {
    await provider.refresh();
    const { index, blocking } = await refreshDiagnostics(root, diagnostics);
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
    vscode.commands.registerCommand("parts.refresh", () => runAll(false)),
    vscode.commands.registerCommand("parts.check", () => runAll(true)),
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
