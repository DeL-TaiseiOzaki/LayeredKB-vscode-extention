import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { LayeredKbConfig, readConfig } from './config';
import {
	ClassificationResult,
	ClassifiedFile,
	classifyFiles,
	compileMatcher,
	filterExternalFiles,
	hasExternalRoots,
	LayerDefinition,
} from './layers';

/**
 * ワークスペース（と各レイヤーの外部フォルダ）を走査してレイヤー分類を保持する．
 * 各レイヤーのツリービューとエクスプローラー装飾がこのインデックスを参照する．
 */
export class WorkspaceIndex implements vscode.Disposable {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private _config: LayeredKbConfig = readConfig();
	private _result: ClassificationResult = { byLayer: new Map(), layerOfFile: new Map() };
	private _uris = new Map<string, vscode.Uri>();
	private _pending: Promise<void> | undefined;
	private _dirty = false;
	private _debounce: NodeJS.Timeout | undefined;
	private _externalWatchers: vscode.Disposable[] = [];
	private readonly _disposables: vscode.Disposable[] = [];

	constructor() {
		const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
		this._disposables.push(
			watcher,
			watcher.onDidCreate(() => this.scheduleRefresh()),
			watcher.onDidDelete(() => this.scheduleRefresh()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleRefresh()),
			this._onDidChange
		);
	}

	get config(): LayeredKbConfig {
		return this._config;
	}

	get result(): ClassificationResult {
		return this._result;
	}

	filesOf(layerId: string): ClassifiedFile[] {
		return this._result.byLayer.get(layerId) ?? [];
	}

	uriOf(file: ClassifiedFile): vscode.Uri | undefined {
		return this._uris.get(file.key);
	}

	layerOf(uri: vscode.Uri): string | undefined {
		return this._result.layerOfFile.get(uri.toString());
	}

	/** 設定を読み直してから再走査する */
	reloadConfig(): Promise<void> {
		this._config = readConfig();
		return this.refresh();
	}

	scheduleRefresh(delayMs = 300): void {
		if (this._debounce) {
			clearTimeout(this._debounce);
		}
		this._debounce = setTimeout(() => {
			this._debounce = undefined;
			void this.refresh();
		}, delayMs);
	}

	/** 走査を実行する．走査中に呼ばれた場合は完了後にもう一度走査する． */
	refresh(): Promise<void> {
		if (this._pending) {
			this._dirty = true;
			return this._pending;
		}
		this._pending = this.scan()
			.catch((err) => {
				console.error('[LayeredKB] scan failed', err);
			})
			.finally(() => {
				this._pending = undefined;
				if (this._dirty) {
					this._dirty = false;
					void this.refresh();
				}
			});
		return this._pending;
	}

	private async scan(): Promise<void> {
		const uris = new Map<string, vscode.Uri>();
		const workspaceFiles = await this.scanWorkspace(uris);
		const result = classifyFiles(workspaceFiles, this._config.layers);

		const externalRoots: vscode.Uri[] = [];
		for (const layer of this._config.layers) {
			if (!hasExternalRoots(layer)) {
				continue;
			}
			const roots = resolveRoots(layer.roots ?? []);
			externalRoots.push(...roots);
			const found = await this.scanExternal(layer, roots, uris);
			const files = filterExternalFiles(found, layer);
			result.byLayer.set(layer.id, files);
			for (const f of files) {
				result.layerOfFile.set(f.key, layer.id);
			}
		}

		this._uris = uris;
		this._result = result;
		this.watchExternalRoots(externalRoots);
		this._onDidChange.fire();
	}

	private async scanWorkspace(uris: Map<string, vscode.Uri>): Promise<ClassifiedFile[]> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		const multiRoot = folders.length > 1;
		const exclude = this._config.exclude.length > 0 ? `{${this._config.exclude.join(',')}}` : undefined;
		const files: ClassifiedFile[] = [];
		for (const folder of folders) {
			const include = new vscode.RelativePattern(folder, '**/*');
			const found = exclude
				? await vscode.workspace.findFiles(include, new vscode.RelativePattern(folder, exclude))
				: await vscode.workspace.findFiles(include);
			for (const uri of found) {
				const relativePath = toPosix(vscode.workspace.asRelativePath(uri, false));
				const key = uri.toString();
				uris.set(key, uri);
				files.push({ key, relativePath, rootLabel: multiRoot ? folder.name : undefined });
			}
		}
		return files;
	}

	private async scanExternal(
		layer: LayerDefinition,
		roots: vscode.Uri[],
		uris: Map<string, vscode.Uri>
	): Promise<ClassifiedFile[]> {
		const excluded = compileMatcher(this._config.exclude);
		const multi = roots.length > 1;
		const files: ClassifiedFile[] = [];
		for (const root of roots) {
			const rootLabel = multi ? path.basename(root.fsPath) || root.fsPath : undefined;
			try {
				await walk(root, '', excluded, (uri, relativePath) => {
					const key = uri.toString();
					uris.set(key, uri);
					files.push({ key, relativePath, rootLabel });
				});
			} catch (err) {
				console.warn(`[LayeredKB] レイヤー "${layer.id}" の roots を読めません: ${root.fsPath}`, err);
			}
		}
		return files;
	}

	private watchExternalRoots(roots: vscode.Uri[]): void {
		vscode.Disposable.from(...this._externalWatchers).dispose();
		this._externalWatchers = [];
		const workspaceRoots = new Set((vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.toString()));
		for (const root of roots) {
			if (workspaceRoots.has(root.toString())) {
				continue;
			}
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*'), false, true, false);
			this._externalWatchers.push(
				watcher,
				watcher.onDidCreate(() => this.scheduleRefresh()),
				watcher.onDidDelete(() => this.scheduleRefresh())
			);
		}
	}

	dispose(): void {
		if (this._debounce) {
			clearTimeout(this._debounce);
		}
		vscode.Disposable.from(...this._externalWatchers, ...this._disposables).dispose();
	}
}

/** `~` やワークスペース相対パスを解決して URI にする */
export function resolveRoots(roots: string[]): vscode.Uri[] {
	const firstFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const resolved: vscode.Uri[] = [];
	for (const raw of roots) {
		const trimmed = raw.trim();
		if (!trimmed) {
			continue;
		}
		let p = trimmed;
		if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
			p = path.join(os.homedir(), p.slice(1));
		}
		if (!path.isAbsolute(p)) {
			if (!firstFolder) {
				continue;
			}
			p = path.resolve(firstFolder, p);
		}
		resolved.push(vscode.Uri.file(p));
	}
	return resolved;
}

async function walk(
	dir: vscode.Uri,
	prefix: string,
	excluded: (relativePath: string) => boolean,
	visit: (uri: vscode.Uri, relativePath: string) => void
): Promise<void> {
	const entries = await vscode.workspace.fs.readDirectory(dir);
	for (const [name, type] of entries) {
		const relativePath = prefix ? `${prefix}/${name}` : name;
		const uri = vscode.Uri.joinPath(dir, name);
		if (type & vscode.FileType.SymbolicLink) {
			continue;
		}
		if (type & vscode.FileType.Directory) {
			if (excluded(`${relativePath}/`) || excluded(relativePath)) {
				continue;
			}
			await walk(uri, relativePath, excluded, visit);
		} else if (type & vscode.FileType.File) {
			if (!excluded(relativePath)) {
				visit(uri, relativePath);
			}
		}
	}
}

function toPosix(p: string): string {
	return p.replace(/\\/g, '/');
}
