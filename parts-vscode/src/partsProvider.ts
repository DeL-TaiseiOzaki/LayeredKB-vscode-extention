import * as vscode from "vscode";
import * as path from "node:path";
import { scanWorkspace, type Part } from "parts-engine";

type Node =
  | { kind: "type"; type: string; parts: Part[] }
  | { kind: "part"; part: Part };

export class PartsProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private byType: Map<string, Part[]> = new Map();

  constructor(private readonly root: string) {}

  async refresh(): Promise<void> {
    const index = await scanWorkspace(this.root);
    const map = new Map<string, Part[]>();
    for (const p of index.parts) {
      const list = map.get(p.meta.type) ?? [];
      list.push(p);
      map.set(p.meta.type, list);
    }
    this.byType = map;
    this._onDidChange.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "type") {
      const item = new vscode.TreeItem(
        `${node.type} (${node.parts.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.contextValue = "partsType";
      item.iconPath = new vscode.ThemeIcon("symbol-namespace");
      return item;
    }
    const p = node.part;
    const item = new vscode.TreeItem(
      p.meta.title || p.meta.part,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = p.meta.part;
    item.tooltip = new vscode.MarkdownString(
      `**${p.meta.title}**\n\n${p.meta.oneline}\n\n${p.meta.summary}`,
    );
    item.contextValue = "part";
    item.iconPath = new vscode.ThemeIcon("symbol-field");
    item.command = {
      command: "vscode.open",
      title: "Open",
      arguments: [vscode.Uri.file(path.join(this.root, p.filePath))],
    };
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return [...this.byType.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, parts]) => ({ kind: "type", type, parts }));
    }
    if (node.kind === "type") {
      return node.parts
        .slice()
        .sort((a, b) => a.meta.part.localeCompare(b.meta.part))
        .map((part) => ({ kind: "part", part }));
    }
    return [];
  }
}
