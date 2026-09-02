import * as vscode from 'vscode';
import {
	buildTree,
	childrenOf,
	DirectoryNode,
	FileNode,
	LayerDefinition,
	OTHER_LAYER,
	OTHER_LAYER_ID,
	TreeNode,
} from './layers';
import { WorkspaceIndex } from './workspaceIndex';

export interface LayerElement {
	kind: 'layer';
	layer: LayerDefinition;
	root: DirectoryNode;
	count: number;
}

export type Element = LayerElement | TreeNode;

/** エクスプローラーに表示する「レイヤー → ディレクトリ → ファイル」のツリー */
export class LayerTreeProvider implements vscode.TreeDataProvider<Element> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<Element | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly index: WorkspaceIndex) {
		index.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
	}

	getTreeItem(element: Element): vscode.TreeItem {
		switch (element.kind) {
			case 'layer':
				return this.layerItem(element);
			case 'directory':
				return this.directoryItem(element);
			case 'file':
				return this.fileItem(element);
		}
	}

	getChildren(element?: Element): Element[] {
		if (!element) {
			return this.rootElements();
		}
		if (element.kind === 'layer') {
			return childrenOf(element.root);
		}
		if (element.kind === 'directory') {
			return childrenOf(element);
		}
		return [];
	}

	private rootElements(): LayerElement[] {
		const { layers, showOtherLayer, compactFolders } = this.index.config;
		const { byLayer } = this.index.result;
		const visible: LayerDefinition[] = showOtherLayer ? [...layers, OTHER_LAYER] : layers;
		return visible.map((layer) => {
			const files = byLayer.get(layer.id) ?? [];
			return { kind: 'layer', layer, root: buildTree(files, compactFolders), count: files.length };
		});
	}

	private layerItem(element: LayerElement): vscode.TreeItem {
		const { layer, count } = element;
		const item = new vscode.TreeItem(
			layer.label,
			count > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
		);
		item.id = `layer:${layer.id}`;
		item.description = `${count}`;
		item.tooltip = layer.description ?? layer.label;
		item.iconPath = new vscode.ThemeIcon(layer.icon ?? 'layers');
		item.contextValue = layer.id === OTHER_LAYER_ID ? 'layeredkb.otherLayer' : 'layeredkb.layer';
		return item;
	}

	private directoryItem(node: DirectoryNode): vscode.TreeItem {
		const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
		item.tooltip = node.path;
		item.contextValue = 'layeredkb.directory';
		// resourceUri を与えるとファイルアイコンテーマのフォルダーアイコンが使われる
		const sample = firstFile(node);
		if (sample) {
			const uri = this.index.uriOf(sample.file);
			if (uri) {
				const depth = sample.path.split('/').length - node.path.split('/').length;
				item.resourceUri = ascend(uri, depth);
			}
		}
		return item;
	}

	private fileItem(node: FileNode): vscode.TreeItem {
		const uri = this.index.uriOf(node.file);
		const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
		item.tooltip = node.path;
		item.contextValue = 'layeredkb.file';
		if (uri) {
			item.resourceUri = uri;
			item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
		}
		return item;
	}
}

function firstFile(node: DirectoryNode): FileNode | undefined {
	if (node.files.length > 0) {
		return node.files[0];
	}
	for (const dir of node.directories) {
		const found = firstFile(dir);
		if (found) {
			return found;
		}
	}
	return undefined;
}

function ascend(uri: vscode.Uri, levels: number): vscode.Uri {
	let current = uri;
	for (let i = 0; i < levels; i++) {
		current = vscode.Uri.joinPath(current, '..');
	}
	return current;
}
