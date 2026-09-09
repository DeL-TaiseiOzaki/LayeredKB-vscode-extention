/**
 * 交換面（`contents/`）のマウント点の状態判定（VS Code API 非依存）．
 *
 * 方針（2026-09-09 決定）: `contents/` にローカルのファイルは置かない．手元で生まれた
 * 素材は所有者の Google Drive に置き，リポジトリには入れない．したがって
 * **`contents/` の直下にあるものは，すべてマウント点である**．シンボリックリンクでも，
 * Windows のジャンクションでも，本物の FUSE マウントポイントでも同じで，マウントかどうかを
 * 決めるのは「交換面の直下にある」という位置であって，inode の種別ではない．
 *
 * だからここでファイルシステムを見る目的は「これはマウントか」ではなく，
 * 「そのマウントは今この端末に繋がっているか」だけになった．答えは 3 つある．
 *
 * とくに 3 つ目の {@link MountState} `local-data` は，支援すべき構成ではなく
 * **異常として表に出すべき状態**である．マウントが外れたまま，同じ名前の実ディレクトリが
 * 作られてしまった形（rclone や Drive クライアントの失敗がローカル保存に化ける形）であり，
 * `contents/` はバージョン管理の対象外なので，その中身はこの端末にしか存在せず，
 * どこにもバックアップされていない．
 *
 * ここで扱うのはこの 3 状態だけである．FR-11 が要求する 8 状態の全体
 * （`not-configured` / `identity-mismatch` / `unverified` / ...）は宣言レジストリが
 * 入ってからで，今は「繋がっていない」と「ローカルに溜まっている」を黙って捨てないことだけを行う．
 */

/** `vscode.FileType` のビット（`vscode` を import しないためここに写す） */
export const FILE_TYPE_FILE = 1;
export const FILE_TYPE_DIRECTORY = 2;
export const FILE_TYPE_SYMBOLIC_LINK = 64;

/** マウント点の状態（今の段階で観測できるものだけ） */
export type MountState =
	/** 中を列挙できる＝この端末に繋がっている */
	| 'attached'
	/** 入口はあるが辿れない＝この端末に繋がっていない（中身は表示されない） */
	| 'unavailable'
	/** マウントであるべき場所に実ローカルディレクトリがある＝異常（git 外の孤立データ） */
	| 'local-data';

/** 交換面の直下で見つかったマウント点 */
export interface MountPoint {
	/** ワークスペースフォルダからの相対パス（`/` 区切り） */
	path: string;
	/** 複数ルート時のワークスペースフォルダ名（単一ルートなら undefined） */
	rootLabel?: string;
	state: MountState;
}

/** 交換面直下の 1 エントリについて，この端末で観測できたこと */
export interface MountObservation {
	/** エントリ名（交換面直下の 1 セグメント） */
	name: string;
	/** `vscode.workspace.fs.readDirectory` が返す `vscode.FileType` のビット */
	type: number;
	/**
	 * 交換面そのものとは別のデバイス（ファイルシステム）に載っているか．
	 * リンクでない実体について，マウントポイントとただのディレクトリを見分ける手掛かりは
	 * これしかない（rclone や Drive クライアントのマウントは別デバイスとして現れる）．
	 *
	 * 観測できないときは `undefined`（`file` スキーム以外など）．その場合は異常と
	 * 断定しない: 確かめられないことを根拠に「データが消える」と警告しないため．
	 *
	 * 既知の限界（デバイス比較で見分けられない構成）:
	 *  - 同一ファイルシステム内の bind mount は交換面と同じデバイスになるので `local-data`
	 *    になる．マウント境界としては誤りだが，実体はローカルのバイト列で git の外という
	 *    警告内容自体は当たっている．
	 *  - btrfs のサブボリューム，overlayfs，APFS の firmlink などは，マウントでなくても
	 *    別デバイスに見えることがあり，その場合は `attached` に倒れる（警告しそこねる）．
	 * 正確に見るには `/proc/self/mountinfo` などプラットフォーム固有のマウント表が要る．
	 * その差し替え点は `workspaceIndex.ts` の `deviceIdOf` 1 箇所に閉じてある．
	 */
	onSeparateDevice?: boolean;
}

/** 参照先を辿れるか（`readDirectory` は辿れないリンクを type=64 で返す） */
function resolves(fileType: number): boolean {
	return (fileType & (FILE_TYPE_FILE | FILE_TYPE_DIRECTORY)) !== 0;
}

/**
 * リンク（シンボリックリンク / ジャンクション）として置かれているか．
 * リンクの実体は `contents/` の外にあるので，デバイス比較の対象にしない．
 */
function isLink(fileType: number): boolean {
	return (fileType & FILE_TYPE_SYMBOLIC_LINK) !== 0;
}

/** 交換面直下の 1 エントリの状態．マウントかどうかは問わない（位置で決まっている）． */
export function mountStateOf(observation: MountObservation): MountState {
	if (!resolves(observation.type)) {
		return 'unavailable';
	}
	if (isLink(observation.type)) {
		return 'attached';
	}
	// リンクでない実体が交換面と同じデバイスに載っている＝マウントではなくローカルの実体．
	return observation.onSeparateDevice === false ? 'local-data' : 'attached';
}

/**
 * 交換面の直下のエントリを，すべてマウント点として状態つきで返す．
 *
 * 絞り込みは無い．「リンクだけがマウント」という推定は方針の変更で不要になった
 * （実ディレクトリとして現れるマウントを取りこぼす原因でもあった）．
 */
export function collectMountPoints(
	observations: readonly MountObservation[],
	surfacePath: string,
	rootLabel?: string
): MountPoint[] {
	return observations.map((observation) => ({
		path: `${surfacePath}/${observation.name}`,
		rootLabel,
		state: mountStateOf(observation),
	}));
}

/** 表示用のフルパス（複数ルート時はルート名を前置する） */
export function mountDisplayPath(mount: MountPoint): string {
	return mount.rootLabel ? `${mount.rootLabel}/${mount.path}` : mount.path;
}
