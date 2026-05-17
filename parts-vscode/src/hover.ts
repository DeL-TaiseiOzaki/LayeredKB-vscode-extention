import * as vscode from "vscode";
import type { PartsState } from "./state.js";

// パーツ ID トークン（例: auth/login）上でホバー時、対象パーツの要約を表示する。
export class PartHoverProvider implements vscode.HoverProvider {
  constructor(private readonly state: PartsState) {}

  provideHover(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ): vscode.Hover | undefined {
    const range = doc.getWordRangeAtPosition(pos, /[A-Za-z0-9._\-/]+/);
    if (!range) return undefined;
    const token = doc.getText(range);
    const part = this.state.index?.byId.get(token);
    if (!part) return undefined;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${part.meta.title}** \`${part.meta.part}\` (${part.meta.type})\n\n`);
    md.appendMarkdown(`${part.meta.oneline}\n\n`);
    md.appendMarkdown(part.meta.summary);
    return new vscode.Hover(md, range);
  }
}
