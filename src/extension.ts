import * as vscode from 'vscode';
import { affectsConfig } from './config';
import { ExplorerDecorationProvider } from './explorerDecorations';
import { Element, LayerTreeProvider } from './layerTreeProvider';
import { WorkspaceIndex } from './workspaceIndex';

export const VIEW_ID = 'layeredkb.layers';

export function activate(context: vscode.ExtensionContext) {
	const index = new WorkspaceIndex();
	const provider = new LayerTreeProvider(index);
	const treeView = vscode.window.createTreeView(VIEW_ID, {
		treeDataProvider: provider,
		showCollapseAll: true,
	});
	const decorations = new ExplorerDecorationProvider(index);

	context.subscriptions.push(
		index,
		treeView,
		decorations,
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (affectsConfig(e)) {
				void index.reloadConfig();
			}
		}),
		vscode.commands.registerCommand('layeredkb.refresh', () => index.refresh()),
		vscode.commands.registerCommand('layeredkb.configureLayers', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', 'layeredkb.layers')
		),
		vscode.commands.registerCommand('layeredkb.openToSide', (element?: Element) => {
			const uri = resourceOf(index, element);
			if (uri) {
				return vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Beside);
			}
		}),
		vscode.commands.registerCommand('layeredkb.revealInExplorer', (element?: Element) => {
			const uri = resourceOf(index, element);
			if (uri) {
				return vscode.commands.executeCommand('revealInExplorer', uri);
			}
		}),
		vscode.commands.registerCommand('layeredkb.revealFileInOS', (element?: Element) => {
			const uri = resourceOf(index, element);
			if (uri) {
				return vscode.commands.executeCommand('revealFileInOS', uri);
			}
		}),
		vscode.commands.registerCommand('layeredkb.copyPath', async (element?: Element) => {
			const uri = resourceOf(index, element);
			if (uri) {
				await vscode.env.clipboard.writeText(uri.fsPath);
			}
		}),
		vscode.commands.registerCommand('layeredkb.copyRelativePath', async (element?: Element) => {
			const uri = resourceOf(index, element);
			if (uri) {
				await vscode.env.clipboard.writeText(vscode.workspace.asRelativePath(uri, false));
			}
		})
	);

	void index.refresh();
}

export function deactivate() {}

function resourceOf(index: WorkspaceIndex, element?: Element): vscode.Uri | undefined {
	if (!element || element.kind !== 'file') {
		return undefined;
	}
	return index.uriOf(element.file);
}
