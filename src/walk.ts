/**
 * ディレクトリ走査（VS Code API 非依存）．
 *
 * 外部フォルダ（`roots`）の再帰走査を，ファイルシステムアクセスを {@link WalkPort} に
 * 注入する形で切り出したもの．VS Code に依存しないので単体テストできる．
 *
 * シンボリックリンクの扱いが本モジュールの主題である．リンクを辿らない場合は
 * 従来どおり「リンクを数えてスキップするだけ」で追加のシステムコールを一切行わない．
 * 辿る場合だけ，リンク先の正規パスを 1 回だけ解決して祖先チェーンと突き合わせ，
 * 自己参照リンクによる無限再帰を止める．通常のディレクトリの正規パスは親の正規パスに
 * 名前を連結して導出するため，走査の共通経路に `stat` を増やさない．
 */

/** ディレクトリ 1 エントリ（`vscode.FileType` のビットマスクを真偽値に開いたもの） */
export interface DirectoryEntry {
	name: string;
	isFile: boolean;
	isDirectory: boolean;
	/** リンク自体かどうか．リンク先の種別は isFile / isDirectory 側に入る */
	isSymbolicLink: boolean;
}

/** 走査対象のファイルシステムへの入口 */
export interface WalkPort {
	/** ルートからの相対パス（`/` 区切り，ルート自身は `''`）のディレクトリを列挙する */
	readDirectory(relativePath: string): Promise<DirectoryEntry[]>;
	/**
	 * 相対パスをシンボリックリンク解決済みの正規パスにする．
	 * 解決できない場合（対応していないファイルシステム，壊れたリンクなど）は undefined．
	 */
	realPath(relativePath: string): Promise<string | undefined>;
	/** 正規パスに子要素名を連結する（プラットフォーム固有の区切りを扱う） */
	childPath(parentRealPath: string, name: string): string;
}

/** 上限に達して走査を打ち切った理由 */
export type TruncationReason = 'max-depth' | 'max-entries';

/** 走査の上限．リンクを辿るときだけ適用される */
export interface WalkLimits {
	/** ルートからの最大の深さ */
	maxDepth: number;
	/** 検査したディレクトリエントリ数の上限（除外されたものも数える） */
	maxEntries: number;
}

export interface WalkOptions {
	/** シンボリックリンクのディレクトリを辿るか */
	followSymlinks: boolean;
	/** 走査から除外する相対パスの判定 */
	excluded: (relativePath: string) => boolean;
	/** 見つかったファイルを受け取る */
	visit: (relativePath: string) => void;
	/** 省略時は {@link DEFAULT_WALK_LIMITS} */
	limits?: Partial<WalkLimits>;
}

/** 走査結果の診断情報．空パネルの理由を利用者に説明するために使う */
export interface WalkDiagnostics {
	/** 検査したディレクトリエントリの総数 */
	entriesInspected: number;
	/** followSymlinks が false のためスキップしたシンボリックリンクの数 */
	skippedSymlinks: number;
	/** 正規パスを解決できず辿らなかったシンボリックリンクの数 */
	unresolvedSymlinks: number;
	/** 祖先と同じ実体を指しており循環と判定してスキップしたリンクの数 */
	cycles: number;
	/** 上限に達して打ち切った理由（打ち切っていなければ undefined） */
	truncatedBy?: TruncationReason;
	/** 打ち切りが起きた相対パス */
	truncatedAt?: string;
}

/** 子ディレクトリを辿ってはいけないことを表す番兵 */
const SKIP_DIRECTORY = Symbol('skip-directory');

/**
 * 走査の上限．リンクを辿らない従来動作では適用しないので，
 * 既存の巨大なルートの見え方を変えない．
 */
export const DEFAULT_WALK_LIMITS: WalkLimits = {
	maxDepth: 64,
	maxEntries: 200_000,
};

/**
 * ルート直下から再帰的に走査し，見つかったファイルを `visit` に渡す．
 * 例外（ルートが読めないなど）は呼び出し側に投げる．
 */
export async function walkDirectory(port: WalkPort, options: WalkOptions): Promise<WalkDiagnostics> {
	const limits: WalkLimits = { ...DEFAULT_WALK_LIMITS, ...options.limits };
	const diagnostics: WalkDiagnostics = {
		entriesInspected: 0,
		skippedSymlinks: 0,
		unresolvedSymlinks: 0,
		cycles: 0,
	};
	// ルート自身がシンボリックリンクでも辿る．利用者が roots に明示したパスだから．
	const rootRealPath = options.followSymlinks ? await port.realPath('') : undefined;
	const walker = new Walker(port, options, limits, diagnostics);
	await walker.walk('', rootRealPath, rootRealPath === undefined ? [] : [rootRealPath], 0);
	return diagnostics;
}

/** `walkDirectory` の再帰状態を持つ内部クラス */
class Walker {
	private stopped = false;

	constructor(
		private readonly port: WalkPort,
		private readonly options: WalkOptions,
		private readonly limits: WalkLimits,
		private readonly diagnostics: WalkDiagnostics
	) {}

	async walk(relativePath: string, realPath: string | undefined, ancestors: string[], depth: number): Promise<void> {
		const entries = await this.port.readDirectory(relativePath);
		for (const entry of entries) {
			if (this.stopped) {
				return;
			}
			const childPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
			if (this.overEntryBudget(childPath)) {
				return;
			}
			if (entry.isSymbolicLink && !this.options.followSymlinks) {
				this.diagnostics.skippedSymlinks++;
				continue;
			}
			if (entry.isDirectory) {
				await this.enterDirectory(entry, childPath, realPath, ancestors, depth);
				continue;
			}
			if (entry.isFile && !this.options.excluded(childPath)) {
				this.options.visit(childPath);
			}
			// 壊れたリンクなど種別不明のエントリは無視する
		}
	}

	/** エントリ 1 件を数え，上限を超えていたら走査全体を止める */
	private overEntryBudget(childPath: string): boolean {
		this.diagnostics.entriesInspected++;
		if (!this.options.followSymlinks || this.diagnostics.entriesInspected <= this.limits.maxEntries) {
			return false;
		}
		this.truncate('max-entries', childPath);
		return true;
	}

	private async enterDirectory(
		entry: DirectoryEntry,
		childPath: string,
		parentRealPath: string | undefined,
		ancestors: string[],
		depth: number
	): Promise<void> {
		if (this.options.excluded(`${childPath}/`) || this.options.excluded(childPath)) {
			return;
		}
		if (this.options.followSymlinks && depth + 1 > this.limits.maxDepth) {
			// 深すぎる枝だけを捨て，兄弟の走査は続ける
			this.record('max-depth', childPath);
			return;
		}
		const childRealPath = await this.resolveChild(entry, childPath, parentRealPath, ancestors);
		if (childRealPath === SKIP_DIRECTORY) {
			return;
		}
		const nextAncestors = childRealPath === undefined ? ancestors : [...ancestors, childRealPath];
		await this.walk(childPath, childRealPath, nextAncestors, depth + 1);
	}

	/**
	 * 子ディレクトリの正規パスを返す．辿ってはいけない場合は SKIP_DIRECTORY．
	 * シンボリックリンクのときだけ解決コスト（1 回）を払う．通常のディレクトリは
	 * 親の正規パスからの導出で済ませ，共通経路にシステムコールを増やさない．
	 */
	private async resolveChild(
		entry: DirectoryEntry,
		childPath: string,
		parentRealPath: string | undefined,
		ancestors: string[]
	): Promise<string | undefined | typeof SKIP_DIRECTORY> {
		if (!entry.isSymbolicLink) {
			return parentRealPath === undefined ? undefined : this.port.childPath(parentRealPath, entry.name);
		}
		const resolved = await this.port.realPath(childPath);
		if (resolved === undefined) {
			// 実体を確認できないリンクは辿らない（循環を検出できないため）
			this.diagnostics.unresolvedSymlinks++;
			return SKIP_DIRECTORY;
		}
		// 祖先チェーンとの照合だけで循環を止める．走査済みパス全体の集合にすると，
		// 同じ実体を指す 2 本のリンクのうち片方が patterns に一致する場合に取りこぼす．
		if (ancestors.includes(resolved)) {
			this.diagnostics.cycles++;
			return SKIP_DIRECTORY;
		}
		return resolved;
	}

	private truncate(reason: TruncationReason, relativePath: string): void {
		this.stopped = true;
		this.record(reason, relativePath);
	}

	private record(reason: TruncationReason, relativePath: string): void {
		if (this.diagnostics.truncatedBy === undefined) {
			this.diagnostics.truncatedBy = reason;
			this.diagnostics.truncatedAt = relativePath;
		}
	}
}
