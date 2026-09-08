import * as assert from 'assert';
import {
	buildTree,
	ClassifiedFile,
	classifyFiles,
	compileLayerMatcher,
	DEFAULT_LAYERS,
	filterExternalFiles,
	hasExternalRoots,
	hasUsableExternalRoots,
	LayerDefinition,
	OTHER_LAYER_ID,
	validateLayers,
} from '../../layers';

function file(relativePath: string, rootLabel?: string): ClassifiedFile {
	return { key: relativePath, relativePath, rootLabel };
}

suite('layers: classifyFiles', () => {
	test('既定レイヤーでスキーマ・オントロジー・ナレッジ・その他に分類される', () => {
		const files = [
			file('.claude/settings.json'),
			file('.claude/commands/review.md'),
			file('AGENTS.md'),
			file('docs/CLAUDE.md'),
			file('ontology/terms.csv'),
			file('notes/2026/idea.md'),
			file('src/index.ts'),
			file('README.md'),
		];
		const { byLayer, layerOfFile } = classifyFiles(files, DEFAULT_LAYERS);

		assert.deepStrictEqual(
			byLayer.get('schema')!.map((f) => f.relativePath),
			['.claude/commands/review.md', '.claude/settings.json', 'AGENTS.md', 'docs/CLAUDE.md']
		);
		assert.deepStrictEqual(byLayer.get('ontology')!.map((f) => f.relativePath), ['ontology/terms.csv']);
		assert.deepStrictEqual(
			byLayer.get('knowledge')!.map((f) => f.relativePath),
			['README.md', 'notes/2026/idea.md'] // コードポイント順（大文字が先）
		);
		assert.deepStrictEqual(byLayer.get(OTHER_LAYER_ID)!.map((f) => f.relativePath), ['src/index.ts']);
		assert.strictEqual(layerOfFile.get('.claude/commands/review.md'), 'schema');
		assert.strictEqual(layerOfFile.get('src/index.ts'), OTHER_LAYER_ID);
	});

	test('roots を持つレイヤーはワークスペース内ファイルを取り込まない', () => {
		const layers: LayerDefinition[] = [
			{ id: 'knowledge', label: 'Knowledge', patterns: ['**/*.md'] },
			{ id: 'raw', label: 'Raw', patterns: ['**/*'], roots: ['~/Drive'] },
		];
		const { byLayer } = classifyFiles([file('src/index.ts'), file('notes/a.md')], layers);
		assert.deepStrictEqual(byLayer.get('raw'), []);
		assert.deepStrictEqual(byLayer.get(OTHER_LAYER_ID)!.map((f) => f.relativePath), ['src/index.ts']);
		assert.ok(hasExternalRoots(layers[1]));
	});

	test('roots が空のレイヤーもワークスペース内ファイルを取り込まない（明示的に無効な状態）', () => {
		const layers: LayerDefinition[] = [{ id: 'raw', label: 'Raw', patterns: ['**/*'], roots: [] }];
		const { byLayer } = classifyFiles([file('src/index.ts')], layers);
		assert.deepStrictEqual(byLayer.get('raw'), []);
		// 「全部を飲み込む catch-all」に化けないことが互換性上の要点
		assert.deepStrictEqual(byLayer.get(OTHER_LAYER_ID)!.map((f) => f.relativePath), ['src/index.ts']);
	});

	test('既定の Raw レイヤーは roots を持たず，マウント先ディレクトリを分類する', () => {
		const raw = DEFAULT_LAYERS.find((l) => l.id === 'raw')!;
		assert.strictEqual(hasExternalRoots(raw), false);
		const { byLayer } = classifyFiles(
			[file('contents/drive/scan.pdf'), file('data/x.bin'), file('src/index.ts'), file('contents/notes.md')],
			DEFAULT_LAYERS
		);
		assert.deepStrictEqual(
			byLayer.get('raw')!.map((f) => f.relativePath),
			['contents/drive/scan.pdf', 'data/x.bin']
		);
		// first-match-wins なので contents/ 配下の Markdown は先にナレッジ層が取る
		assert.deepStrictEqual(byLayer.get('knowledge')!.map((f) => f.relativePath), ['contents/notes.md']);
		assert.deepStrictEqual(byLayer.get(OTHER_LAYER_ID)!.map((f) => f.relativePath), ['src/index.ts']);
	});

	test('先に定義したレイヤーが優先される（first-match-wins）', () => {
		const layers: LayerDefinition[] = [
			{ id: 'ontology', label: 'Ontology', patterns: ['ontology/**'] },
			{ id: 'knowledge', label: 'Knowledge', patterns: ['**/*.md'] },
		];
		const { layerOfFile } = classifyFiles([file('ontology/terms.md'), file('notes/a.md')], layers);
		assert.strictEqual(layerOfFile.get('ontology/terms.md'), 'ontology');
		assert.strictEqual(layerOfFile.get('notes/a.md'), 'knowledge');
	});

	test('ファイルが無いレイヤーも空配列として含まれる', () => {
		const { byLayer } = classifyFiles([], DEFAULT_LAYERS);
		assert.deepStrictEqual([...byLayer.keys()], ['schema', 'ontology', 'knowledge', 'raw', OTHER_LAYER_ID]);
		assert.deepStrictEqual(byLayer.get('schema'), []);
	});
});

suite('layers: filterExternalFiles', () => {
	test('外部フォルダのファイルはレイヤーの patterns で絞り込まれる', () => {
		const layer: LayerDefinition = { id: 'raw', label: 'Raw', patterns: ['**/*.pdf', 'scans/**'], roots: ['~/Drive'] };
		const result = filterExternalFiles([file('a.pdf'), file('scans/1.png'), file('notes.txt')], layer);
		assert.deepStrictEqual(result.map((f) => f.relativePath), ['a.pdf', 'scans/1.png']);
	});
});

suite('layers: compileLayerMatcher', () => {
	test('ドットファイル・ブレース・先頭の ./ を扱える', () => {
		const matches = compileLayerMatcher({
			id: 'x',
			label: 'x',
			patterns: ['./.claude/**', '**/*.{md,csv}', '/AGENTS.md'],
		});
		assert.ok(matches('.claude/settings.json'));
		assert.ok(matches('deep/dir/file.csv'));
		assert.ok(matches('AGENTS.md'));
		assert.ok(!matches('src/index.ts'));
	});
});

suite('layers: validateLayers', () => {
	test('既定レイヤーは妥当', () => {
		assert.deepStrictEqual(validateLayers(DEFAULT_LAYERS), []);
	});

	test('ID 重複・予約 ID・patterns 欠落・roots の型を検出する', () => {
		const problems = validateLayers([
			{ id: 'a', label: 'a', patterns: ['**'] },
			{ id: 'a', label: 'a', patterns: ['**'] },
			{ id: OTHER_LAYER_ID, label: 'o', patterns: ['**'] },
			{ id: 'b', label: 'b', patterns: [] },
			{ id: 'c', label: 'c', patterns: ['**'], roots: '~/x' as unknown as string[] },
		]);
		assert.strictEqual(problems.length, 4);
	});
});

suite('layers: hasUsableExternalRoots', () => {
	test('空配列・空文字列だけの roots は「走査先なし」と判定される', () => {
		const base = { id: 'raw', label: 'Raw', patterns: ['**/*'] };
		assert.strictEqual(hasUsableExternalRoots({ ...base, roots: [] }), false);
		assert.strictEqual(hasUsableExternalRoots({ ...base, roots: ['', '   '] }), false);
		assert.strictEqual(hasUsableExternalRoots(base), false);
	});

	test('空白でない roots が 1 つでもあれば走査対象になる', () => {
		const base = { id: 'raw', label: 'Raw', patterns: ['**/*'] };
		assert.strictEqual(hasUsableExternalRoots({ ...base, roots: ['', '~/Drive'] }), true);
	});

	test('roots が配列でない場合も走査対象にしない', () => {
		const layer: LayerDefinition = {
			id: 'raw',
			label: 'Raw',
			patterns: ['**/*'],
			roots: '~/Drive' as unknown as string[],
		};
		assert.strictEqual(hasUsableExternalRoots(layer), false);
	});
});

suite('layers: buildTree', () => {
	test('ディレクトリ構造を保ったツリーを作る', () => {
		const root = buildTree([file('a/b/x.md'), file('a/y.md'), file('z.md')], false);
		assert.deepStrictEqual(root.files.map((f) => f.name), ['z.md']);
		assert.deepStrictEqual(root.directories.map((d) => d.name), ['a']);
		const a = root.directories[0];
		assert.deepStrictEqual(a.files.map((f) => f.name), ['y.md']);
		assert.deepStrictEqual(a.directories.map((d) => d.path), ['a/b']);
	});

	test('compact モードでは単一子ディレクトリの連鎖を 1 ノードにまとめる', () => {
		const root = buildTree([file('a/b/c/x.md'), file('a/b/c/y.md'), file('d/e.md')], true);
		const names = root.directories.map((d) => d.name);
		assert.deepStrictEqual(names, ['a/b/c', 'd']);
		assert.strictEqual(root.directories[0].path, 'a/b/c');
		assert.strictEqual(root.directories[0].files.length, 2);
	});

	test('複数ルートではルート名がツリー先頭に付く', () => {
		const root = buildTree([file('notes/a.md', 'kb'), file('notes/b.md', 'kb2')], false);
		assert.deepStrictEqual(root.directories.map((d) => d.name), ['kb', 'kb2']);
		assert.strictEqual(root.directories[0].directories[0].path, 'kb/notes');
	});
});
