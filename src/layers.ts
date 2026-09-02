/**
 * LayeredKB の中核ロジック（VS Code API 非依存）．
 *
 * ワークスペース内のファイルを「レイヤー」に分類し，レイヤーごとのツリーを組み立てる．
 * レイヤーは glob パターンの集合で定義され，先に定義されたレイヤーが優先される
 * （first-match-wins）．どのレイヤーにも一致しないファイルは "other" レイヤーに入る．
 */
import { minimatch } from 'minimatch';

/** レイヤー定義（`layeredkb.layers` 設定の 1 要素） */
export interface LayerDefinition {
	/** 一意な ID */
	id: string;
	/** ツリーに表示する名前 */
	label: string;
	/** ツリーのツールチップなどに使う説明 */
	description?: string;
	/** codicon 名（例: "law", "book"） */
	icon?: string;
	/** エクスプローラーのバッジ（1〜2 文字） */
	badge?: string;
	/** エクスプローラー装飾に使うテーマカラー ID */
	color?: string;
	/** ワークスペースルートからの相対 glob（ブレース展開・`**` 可） */
	patterns: string[];
}

/** どのレイヤーにも属さないファイルを収める疑似レイヤーの ID */
export const OTHER_LAYER_ID = 'other';

/** 既定のレイヤー定義．上から順にマッチが試される． */
export const DEFAULT_LAYERS: LayerDefinition[] = [
	{
		id: 'schema',
		label: 'Schema',
		description: 'CLI エージェントの振る舞いを規定する層（.claude, AGENTS.md など）',
		icon: 'law',
		badge: 'S',
		color: 'charts.purple',
		patterns: [
			'.claude/**',
			'.claude.json',
			'**/CLAUDE.md',
			'**/CLAUDE.local.md',
			'**/AGENTS.md',
			'.agents/**',
			'.codex/**',
			'.cursor/**',
			'.cursorrules',
			'.gemini/**',
			'**/GEMINI.md',
			'.github/copilot-instructions.md',
			'.github/instructions/**',
			'.github/prompts/**',
			'.windsurfrules',
			'.mcp.json',
		],
	},
	{
		id: 'knowledge',
		label: 'Knowledge',
		description: '知見・情報とオントロジー（Markdown / CSV）',
		icon: 'book',
		badge: 'K',
		color: 'charts.blue',
		patterns: ['**/*.md', '**/*.mdx', '**/*.csv', '**/*.tsv'],
	},
];

/** "other" 疑似レイヤーの表示定義 */
export const OTHER_LAYER: LayerDefinition = {
	id: OTHER_LAYER_ID,
	label: 'Other',
	description: 'どのレイヤーにも属さないファイル',
	icon: 'files',
	patterns: [],
};

/** 分類対象となる 1 ファイル */
export interface ClassifiedFile {
	/** ファイルを一意に識別するキー（URI 文字列など） */
	key: string;
	/** ワークスペースフォルダからの相対パス（区切りは `/`） */
	relativePath: string;
	/** マルチルート時にツリーの先頭に置くフォルダ名（単一ルートなら undefined） */
	rootLabel?: string;
}

export interface ClassificationResult {
	/** レイヤー ID → そのレイヤーに属するファイル（相対パス順） */
	byLayer: Map<string, ClassifiedFile[]>;
	/** ファイルキー → レイヤー ID */
	layerOfFile: Map<string, string>;
}

const MATCH_OPTIONS = { dot: true, nocomment: true } as const;

/** レイヤー定義から `(relativePath) => boolean` を作る */
export function compileLayerMatcher(layer: LayerDefinition): (relativePath: string) => boolean {
	const matchers = layer.patterns
		.map((p) => normalizePattern(p))
		.filter((p) => p.length > 0)
		.map((p) => minimatch.filter(p, MATCH_OPTIONS));
	return (relativePath) => matchers.some((m) => m(relativePath));
}

/** 先頭の `./` や `/` を取り除き，区切りを `/` に揃える */
export function normalizePattern(pattern: string): string {
	return pattern.trim().replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
}

/** レイヤー定義の妥当性を検証し，問題があれば理由を返す */
export function validateLayers(layers: LayerDefinition[]): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const layer of layers) {
		if (!layer.id || typeof layer.id !== 'string') {
			problems.push(`レイヤーに id がありません: ${JSON.stringify(layer)}`);
			continue;
		}
		if (layer.id === OTHER_LAYER_ID) {
			problems.push(`"${OTHER_LAYER_ID}" は予約された ID です`);
		}
		if (seen.has(layer.id)) {
			problems.push(`レイヤー ID が重複しています: ${layer.id}`);
		}
		seen.add(layer.id);
		if (!Array.isArray(layer.patterns) || layer.patterns.length === 0) {
			problems.push(`レイヤー "${layer.id}" に patterns がありません`);
		}
	}
	return problems;
}

/**
 * ファイル群をレイヤーに分類する．レイヤーは定義順に評価され，最初に一致した
 * レイヤーが採用される．どれにも一致しない場合は OTHER_LAYER_ID に入る．
 */
export function classifyFiles(files: ClassifiedFile[], layers: LayerDefinition[]): ClassificationResult {
	const matchers = layers.map((layer) => ({ id: layer.id, matches: compileLayerMatcher(layer) }));
	const byLayer = new Map<string, ClassifiedFile[]>();
	for (const layer of layers) {
		byLayer.set(layer.id, []);
	}
	byLayer.set(OTHER_LAYER_ID, []);
	const layerOfFile = new Map<string, string>();

	for (const file of files) {
		const hit = matchers.find((m) => m.matches(file.relativePath));
		const id = hit ? hit.id : OTHER_LAYER_ID;
		byLayer.get(id)!.push(file);
		layerOfFile.set(file.key, id);
	}

	for (const list of byLayer.values()) {
		list.sort((a, b) => (treePath(a) < treePath(b) ? -1 : treePath(a) > treePath(b) ? 1 : 0));
	}
	return { byLayer, layerOfFile };
}

/** ツリー上でのフルパス（マルチルート時はルート名を先頭に付ける） */
export function treePath(file: ClassifiedFile): string {
	return file.rootLabel ? `${file.rootLabel}/${file.relativePath}` : file.relativePath;
}

// ---------------------------------------------------------------------------
// ツリー構築
// ---------------------------------------------------------------------------

export interface DirectoryNode {
	kind: 'directory';
	/** 表示名（compact 時は "a/b/c" のように連結される） */
	name: string;
	/** ツリールートからのパス（`/` 区切り） */
	path: string;
	directories: DirectoryNode[];
	files: FileNode[];
}

export interface FileNode {
	kind: 'file';
	name: string;
	path: string;
	file: ClassifiedFile;
}

export type TreeNode = DirectoryNode | FileNode;

/**
 * 相対パスの一覧からディレクトリツリーを組み立てる．
 * `compact` が真なら，子が 1 つのディレクトリしか持たないディレクトリを
 * エクスプローラーの「コンパクトフォルダー」と同様に連結する．
 */
export function buildTree(files: ClassifiedFile[], compact: boolean): DirectoryNode {
	const root: DirectoryNode = { kind: 'directory', name: '', path: '', directories: [], files: [] };

	for (const file of files) {
		const segments = treePath(file).split('/').filter((s) => s.length > 0);
		const fileName = segments.pop();
		if (!fileName) {
			continue;
		}
		let dir = root;
		let currentPath = '';
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			let next = dir.directories.find((d) => d.name === segment);
			if (!next) {
				next = { kind: 'directory', name: segment, path: currentPath, directories: [], files: [] };
				dir.directories.push(next);
			}
			dir = next;
		}
		dir.files.push({ kind: 'file', name: fileName, path: treePath(file), file });
	}

	sortTree(root);
	return compact ? compactTree(root) : root;
}

function sortTree(node: DirectoryNode): void {
	node.directories.sort((a, b) => a.name.localeCompare(b.name));
	node.files.sort((a, b) => a.name.localeCompare(b.name));
	node.directories.forEach(sortTree);
}

function compactTree(node: DirectoryNode): DirectoryNode {
	const directories = node.directories.map((child) => {
		let current = child;
		while (current.files.length === 0 && current.directories.length === 1) {
			const only = current.directories[0];
			current = { ...only, name: `${current.name}/${only.name}` };
		}
		return compactTree(current);
	});
	return { ...node, directories };
}

/** ノードの子要素（ディレクトリが先，次にファイル） */
export function childrenOf(node: DirectoryNode): TreeNode[] {
	return [...node.directories, ...node.files];
}
