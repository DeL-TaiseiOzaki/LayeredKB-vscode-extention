import * as vscode from "vscode";
import * as path from "node:path";
import { type Part } from "parts-engine";
import type { PartsState } from "./state.js";

type Node =
  | { kind: "type"; type: string; parts: Part[] }
  | { kind: "part"; part: Part };

export class PartsProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly state: PartsState) {}

  refresh(): void {
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
      arguments: [vscode.Uri.file(path.join(this.state.root, p.filePath))],
    };
    return item;
  }

  getChildren(node?: Node): Node[] {
    const parts = this.state.index?.parts ?? [];
    if (!node) {
      const byType = new Map<string, Part[]>();
      for (const p of parts) {
        const list = byType.get(p.meta.type) ?? [];
        list.push(p);
        byType.set(p.meta.type, list);
      }
      return [...byType.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, ps]) => ({ kind: "type", type, parts: ps }));
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
