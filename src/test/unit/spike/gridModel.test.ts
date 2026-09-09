/** SPIKE (2026-09-08): grid サイドバー試作のモデル層のユニットテスト． */
import * as assert from 'assert';
import { buildTree, ClassifiedFile, DEFAULT_LAYERS } from '../../../layers';
import {
	buildGridModel,
	bucketOf,
	DEFAULT_GRID_OPTIONS,
	flattenDirectory,
	GridRow,
	TEAM_GROUPS,
	visibleRowIndices,
} from '../../../spike/gridModel';
import { DEEP_SHAPE, describeShape, FLAT_SHAPE, generateVault } from '../../../spike/synthetic';

function file(relativePath: string): ClassifiedFile {
	return { key: relativePath, relativePath };
}

const noBadge = () => undefined;

suite('spike/gridModel: flattenDirectory', () => {
	test('ディレクトリが先，ファイルが後の深さ優先順で並び，subtreeSize が部分木の行数になる', () => {
		// Arrange
		const tree = buildTree([file('a/b/x.md'), file('a/y.md'), file('z.md')], false);

		// Act
		const rows = flattenDirectory(tree, 0, noBadge);

		// Assert
		assert.deepStrictEqual(
			rows.map((r) => `${r.depth}:${r.kind}:${r.name}`),
			['0:directory:a', '1:directory:b', '2:file:x.md', '1:file:y.md', '0:file:z.md']
		);
		assert.strictEqual(rows[0].subtreeSize, 3, 'a は b / x.md / y.md を含む');
		assert.strictEqual(rows[1].subtreeSize, 1, 'b は x.md だけを含む');
		assert.strictEqual(rows[4].subtreeSize, 0, 'ファイルは部分木を持たない');
	});

	test('空のツリーは 0 行になる（境界値）', () => {
		assert.deepStrictEqual(flattenDirectory(buildTree([], false), 0, noBadge), []);
	});

	test('depth の開始値がそのままインデント段数になる（グループ配下は 1 から）', () => {
		const rows = flattenDirectory(buildTree([file('a/x.md')], false), 1, noBadge);
		assert.deepStrictEqual(rows.map((r) => r.depth), [1, 2]);
	});
});

suite('spike/gridModel: visibleRowIndices', () => {
	const rows = flattenDirectory(buildTree([file('a/b/x.md'), file('a/y.md'), file('z.md')], false), 0, noBadge);

	test('折りたたみが無ければ全行が見える', () => {
		assert.deepStrictEqual(visibleRowIndices(rows, new Set()), [0, 1, 2, 3, 4]);
	});

	test('折りたたんだディレクトリは部分木ごと飛ばされる', () => {
		assert.deepStrictEqual(visibleRowIndices(rows, new Set([0])), [0, 4]);
		assert.deepStrictEqual(visibleRowIndices(rows, new Set([1])), [0, 1, 3, 4]);
	});

	test('見えていない行の折りたたみ状態は結果に影響しない（入れ子の縮退）', () => {
		assert.deepStrictEqual(visibleRowIndices(rows, new Set([0, 1])), [0, 4]);
	});

	test('ファイル行が折りたたみ集合に混ざっていても飛ばさない（異常入力）', () => {
		assert.deepStrictEqual(visibleRowIndices(rows, new Set([4])), [0, 1, 2, 3, 4]);
	});

	test('行が無ければ空を返す（境界値）', () => {
		assert.deepStrictEqual(visibleRowIndices([], new Set()), []);
	});
});

suite('spike/gridModel: buildGridModel', () => {
	const files = generateVault({ fileCount: 400, ...DEEP_SHAPE });
	const model = buildGridModel(files, DEFAULT_LAYERS, DEFAULT_GRID_OPTIONS);

	test('モックアップの 5 領域をその順序で返す', () => {
		assert.deepStrictEqual(
			model.regions.map((r) => r.id),
			['schema', 'myKnowledge', 'teamKnowledge', 'myContents', 'teamContents']
		);
	});

	test('全ファイルがちょうど 1 つの領域に入る', () => {
		assert.strictEqual(model.fileCount, files.length);
		assert.strictEqual(
			model.rowCount,
			model.regions.reduce((sum, r) => sum + r.rows.length, 0)
		);
	});

	test('チーム領域は名前付きグループ行を持ち，そこに常設の + が付く', () => {
		const team = model.regions.find((r) => r.id === 'teamKnowledge')!;
		const groups = team.rows.filter((r: GridRow) => r.kind === 'group');
		assert.deepStrictEqual(groups.map((g) => g.name), [...TEAM_GROUPS]);
		assert.ok(groups.every((g) => g.addAction), 'グループ行は + を常時表示する');
		assert.ok(groups.every((g) => g.depth === 0), 'グループ行は最上位');
	});

	test('グループ行の subtreeSize が次のグループ行までの行数と一致する', () => {
		const team = model.regions.find((r) => r.id === 'teamContents')!;
		const groupIndices = team.rows.flatMap((r, i) => (r.kind === 'group' ? [i] : []));
		groupIndices.forEach((start, n) => {
			const end = groupIndices[n + 1] ?? team.rows.length;
			assert.strictEqual(team.rows[start].subtreeSize, end - start - 1);
		});
	});

	test('ファイルが 0 件でも 5 領域を返す（境界値）', () => {
		const empty = buildGridModel([], DEFAULT_LAYERS, DEFAULT_GRID_OPTIONS);
		assert.strictEqual(empty.regions.length, 5);
		assert.strictEqual(empty.fileCount, 0);
	});
});

suite('spike/synthetic: generateVault', () => {
	test('deep 形状は branching ** depth 個の葉ディレクトリに散らばる', () => {
		const files = generateVault({ fileCount: 2000, ...DEEP_SHAPE });
		const leaves = new Set(files.map((f) => f.relativePath.split('/').slice(0, -1).join('/')));
		assert.strictEqual(files.length, 2000);
		assert.ok(leaves.size > 1000, `葉ディレクトリが少なすぎる: ${leaves.size}`);
	});

	test('flat 形状は 1 階層しか作らない（最悪ケース）', () => {
		const files = generateVault({ fileCount: 50, ...FLAT_SHAPE });
		const depths = new Set(files.map((f) => f.relativePath.split('/').length));
		assert.deepStrictEqual([...depths].sort(), [1, 2], 'ルート直下か 1 階層のプレフィックス配下だけ');
	});

	test('0 件でも例外にならない（境界値）', () => {
		assert.deepStrictEqual(generateVault({ fileCount: 0, ...DEEP_SHAPE }), []);
	});

	test('形状の説明文に測定に必要な数値が入る', () => {
		assert.match(describeShape({ fileCount: 20000, ...DEEP_SHAPE }), /depth 4.*branching 6.*1296/);
	});

	test('生成したファイルは既定レイヤー全てに分配される', () => {
		const model = buildGridModel(generateVault({ fileCount: 1000, ...DEEP_SHAPE }), DEFAULT_LAYERS);
		assert.ok(model.regions.every((r) => r.fileCount > 0), 'どの領域も空にならない');
	});
});

suite('spike/gridModel: bucketOf', () => {
	test('同じパスは常に同じバケットに入り，範囲を外れない', () => {
		assert.strictEqual(bucketOf('a/b/c.md', 3), bucketOf('a/b/c.md', 3));
		for (const p of ['x', 'y/z', '', 'ぱす/日本語.md']) {
			const bucket = bucketOf(p, 3);
			assert.ok(bucket >= 0 && bucket < 3, `${p} -> ${bucket}`);
		}
	});
});
