import * as assert from 'assert';
import {
	buildTree,
	ClassifiedFile,
	classifyFiles,
	compileLayerMatcher,
	DEFAULT_LAYERS,
	LayerDefinition,
	OTHER_LAYER_ID,
	validateLayers,
} from '../../layers';

function file(relativePath: string, rootLabel?: string): ClassifiedFile {
	return { key: relativePath, relativePath, rootLabel };
}

suite('layers: classifyFiles', () => {
	test('既定レイヤーでスキーマ・知見・その他に分類される', () => {
		const files = [
			file('.claude/settings.json'),
			file('.claude/commands/review.md'),
			file('AGENTS.md'),
			file('docs/CLAUDE.md'),
			file('notes/ontology.csv'),
			file('notes/2026/idea.md'),
			file('src/index.ts'),
			file('README.md'),
		];
		const { byLayer, layerOfFile } = classifyFiles(files, DEFAULT_LAYERS);

		assert.deepStrictEqual(
			byLayer.get('schema')!.map((f) => f.relativePath),
			['.claude/commands/review.md', '.claude/settings.json', 'AGENTS.md', 'docs/CLAUDE.md']
		);
		assert.deepStrictEqual(
			byLayer.get('knowledge')!.map((f) => f.relativePath),
			['README.md', 'notes/2026/idea.md', 'notes/ontology.csv'] // コードポイント順（大文字が先）
		);
		assert.deepStrictEqual(
			byLayer.get(OTHER_LAYER_ID)!.map((f) => f.relativePath),
			['src/index.ts']
		);
		assert.strictEqual(layerOfFile.get('.claude/commands/review.md'), 'schema');
		assert.strictEqual(layerOfFile.get('src/index.ts'), OTHER_LAYER_ID);
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
		assert.deepStrictEqual([...byLayer.keys()], ['schema', 'knowledge', OTHER_LAYER_ID]);
		assert.deepStrictEqual(byLayer.get('schema'), []);
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

	test('ID 重複・予約 ID・patterns 欠落を検出する', () => {
		const problems = validateLayers([
			{ id: 'a', label: 'a', patterns: ['**'] },
			{ id: 'a', label: 'a', patterns: ['**'] },
			{ id: OTHER_LAYER_ID, label: 'o', patterns: ['**'] },
			{ id: 'b', label: 'b', patterns: [] },
		]);
		assert.strictEqual(problems.length, 3);
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

	test('マルチルートではルート名がツリー先頭に付く', () => {
		const root = buildTree([file('notes/a.md', 'kb'), file('notes/b.md', 'kb2')], false);
		assert.deepStrictEqual(root.directories.map((d) => d.name), ['kb', 'kb2']);
		assert.strictEqual(root.directories[0].directories[0].path, 'kb/notes');
	});
});
