import * as vscode from 'vscode';
import { LayeredKbConfig, readConfig } from './config';
import { ClassificationResult, ClassifiedFile, classifyFiles } from './layers';

/**
 * ワークスペース全体を走査してレイヤー分類を保持する．
 * ツリービューとエクスプローラー装飾の両方がこのインデックスを参照する．
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
		const folders = vscode.workspace.workspaceFolders ?? [];
		const multiRoot = folders.length > 1;
		const exclude = this._config.exclude.length > 0 ? `{${this._config.exclude.join(',')}}` : undefined;

		const files: ClassifiedFile[] = [];
		const uris = new Map<string, vscode.Uri>();
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

		this._uris = uris;
		this._result = classifyFiles(files, this._config.layers);
		this._onDidChange.fire();
	}

	dispose(): void {
		if (this._debounce) {
			clearTimeout(this._debounce);
		}
		vscode.Disposable.from(...this._disposables).dispose();
	}
}

function toPosix(p: string): string {
	return p.replace(/\\/g, '/');
}
