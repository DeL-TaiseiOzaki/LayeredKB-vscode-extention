/** SPIKE (2026-09-09): 実ワークスペースからグリッドを組み立てる経路のユニットテスト． */
import * as assert from 'assert';
import { ClassifiedFile, DEFAULT_LAYERS } from '../../../layers';
import { MountPoint } from '../../../mounts';
import { buildScopeRoots, classifyByScope, ScopeRoot } from '../../../scopes';
import { GridModel, GridRow, RegionModel } from '../../../spike/gridModel';
import { buildRealGridModel, MOUNT_BADGE } from '../../../spike/realModel';

function file(relativePath: string): ClassifiedFile {
	return { key: relativePath, relativePath };
}

const SCOPES: ScopeRoot[] = buildScopeRoots({
	label: 'vault',
	submodulePaths: ['team-kb/engineering', 'partner-kb'],
});

const FILES = [
	'CLAUDE.md',
	'.claude/rules/coding.md',
	'knowledge/notes/idea.md',
	'ontology/terms.csv',
	'contents/failed-mount/sample.bin',
	'team-kb/engineering/CLAUDE.md',
	'team-kb/engineering/.claude/rules/house.md',
	'team-kb/engineering/docs/architecture.md',
	'team-kb/engineering/ontology/terms.csv',
	'team-kb/engineering/contents/dump.bin',
].map(file);

/**
 * 交換面直下は全部マウント点（方針 2026-09-09）．`failed-mount` はマウントの位置に
 * 実ローカルディレクトリがある異常で，走査は中に入れる＝行はディレクトリのまま印が付く．
 */
const MOUNTS: MountPoint[] = [
	{ path: 'contents/gdrive', state: 'attached' },
	{ path: 'contents/onedrive', state: 'unavailable' },
	{ path: 'contents/failed-mount', state: 'local-data' },
];

function build(files: readonly ClassifiedFile[] = FILES, mounts: readonly MountPoint[] = MOUNTS): GridModel {
	return buildRealGridModel({
		byLayer: classifyByScope(files, SCOPES, DEFAULT_LAYERS).byLayer,
		scopes: SCOPES,
		mounts,
		layers: DEFAULT_LAYERS,
		compact: false,
	});
}

function region(model: GridModel, id: string): RegionModel {
	const found = model.regions.find((r) => r.id === id);
	assert.ok(found, `領域 ${id} が無い`);
	return found;
}

function names(rows: readonly GridRow[]): string[] {
	return rows.map((row) => `${row.depth}:${row.kind}:${row.name}`);
}

suite('spike/realModel: スコープ→領域の対応', () => {
	const model = build();

	test('モックアップの 5 領域をその順序で返す', () => {
		assert.deepStrictEqual(
			model.regions.map((r) => r.id),
			['schema', 'myKnowledge', 'teamKnowledge', 'myContents', 'teamContents']
		);
	});

	test('ワークスペーススコープのファイルだけが個人の 3 領域に入る', () => {
		assert.deepStrictEqual(names(region(model, 'schema').rows), [
			'0:directory:.claude',
			'1:directory:rules',
			'2:file:coding.md',
			'0:file:CLAUDE.md',
		]);
		assert.deepStrictEqual(names(region(model, 'myKnowledge').rows), [
			'0:directory:knowledge',
			'1:directory:notes',
			'2:file:idea.md',
			'0:directory:ontology',
			'1:file:terms.csv',
		]);
		assert.ok(
			region(model, 'myContents').rows.some((row) => row.name === 'sample.bin'),
			'個人の contents 配下のファイルは MY CONTENTS に入る'
		);
	});

	test('submodule スコープのファイルは個人領域に混ざらない', () => {
		for (const id of ['schema', 'myKnowledge', 'myContents']) {
			assert.ok(
				!region(model, id).rows.some((row) => row.name === 'house.md' || row.name === 'architecture.md'),
				`${id} にチームのファイルが漏れている`
			);
		}
	});

	test('チーム領域は scope.label のグループを持ち，常設の + が付く', () => {
		const team = region(model, 'teamKnowledge');
		const groups = team.rows.filter((row) => row.kind === 'group' && row.depth === 0);
		assert.deepStrictEqual(groups.map((g) => g.name), ['partner-kb', 'engineering']);
		assert.ok(groups.every((g) => g.addAction && g.variant === 'scope'));
	});

	test('チームのスキーマはチームのグループ内にレイヤー小見出しとして出る（親のスキーマ層へ持ち上げない）', () => {
		const team = region(model, 'teamKnowledge');
		const start = team.rows.findIndex((row) => row.name === 'engineering');
		const rows = team.rows.slice(start, start + team.rows[start].subtreeSize + 1);
		assert.deepStrictEqual(names(rows), [
			'0:group:engineering',
			'1:group:スキーマ層',
			'2:directory:.claude',
			'3:directory:rules',
			'4:file:house.md',
			'2:file:CLAUDE.md',
			'1:group:オントロジー層',
			'2:directory:ontology',
			'3:file:terms.csv',
			'1:group:ナレッジベース層',
			'2:directory:docs',
			'3:file:architecture.md',
		]);
		assert.ok(
			rows.every((row) => !row.name.includes('team-kb')),
			'グループ内はスコープルート相対で，スコープルートのパスを繰り返さない'
		);
	});

	test('レイヤー小見出しは scope グループと区別され，+ を持たない', () => {
		const layerGroups = region(model, 'teamKnowledge').rows.filter((row) => row.variant === 'layer');
		assert.ok(layerGroups.length > 0);
		assert.ok(layerGroups.every((row) => row.kind === 'group' && row.depth === 1 && !row.addAction));
	});

	test('グループ行の subtreeSize が次のグループ行までの行数と一致する', () => {
		for (const id of ['teamKnowledge', 'teamContents']) {
			const rows = region(model, id).rows;
			const starts = rows.flatMap((row, i) => (row.kind === 'group' && row.depth === 0 ? [i] : []));
			starts.forEach((start, n) => {
				const end = starts[n + 1] ?? rows.length;
				assert.strictEqual(rows[start].subtreeSize, end - start - 1, `${id} のグループ ${rows[start].name}`);
			});
		}
	});

	test('ファイルはちょうど 1 つの領域に数えられ，マウント行は数に入らない', () => {
		assert.strictEqual(model.fileCount, FILES.length);
	});

	test('宣言済みの submodule はファイルが無くてもグループとして出る', () => {
		const partner = region(model, 'teamContents').rows.find((row) => row.name === 'partner-kb');
		assert.ok(partner, 'partner-kb のグループが無い');
		assert.strictEqual(partner.badge, '0');
	});
});

suite('spike/realModel: マウント点', () => {
	const model = build();
	const contents = region(model, 'myContents');

	test('マウントは contents ツリー内の実際の位置に出る', () => {
		assert.deepStrictEqual(names(contents.rows), [
			'0:directory:contents',
			'1:directory:failed-mount',
			'2:file:sample.bin',
			'1:mount:gdrive',
			'1:mount:onedrive',
		]);
	});

	test('交換面直下に印の無い普通のフォルダは出ない（直下は全部マウント点）', () => {
		const start = contents.rows.findIndex((row) => row.name === 'contents');
		const children = contents.rows.filter((row, i) => i > start && row.depth === 1);
		assert.ok(children.length > 0);
		assert.ok(
			children.every((row) => row.mountState !== undefined),
			`印の無い直下の行がある: ${children.filter((row) => !row.mountState).map((row) => row.name).join()}`
		);
	});

	test('3 つの状態はバッジ・状態・説明ですべて互いに区別できる', () => {
		const rows = ['gdrive', 'onedrive', 'failed-mount'].map((name) => {
			const row = contents.rows.find((r) => r.name === name);
			assert.ok(row, `${name} の行が無い`);
			return row;
		});
		assert.deepStrictEqual(rows.map((row) => row.mountState), ['attached', 'unavailable', 'local-data']);
		const badges = rows.map((row) => String(row.badge));
		assert.strictEqual(new Set(badges).size, 3, `バッジが重複している: ${badges.join()}`);
		assert.ok(badges.every((badge) => badge.length > 0));
		assert.strictEqual(new Set(rows.map((row) => String(row.tooltip))).size, 3);
	});

	test('この端末に繋がっていない入口は葉で，状態とバッジと説明が付く', () => {
		const unavailable = contents.rows.find((row) => row.name === 'onedrive');
		assert.ok(unavailable);
		assert.strictEqual(unavailable.kind, 'mount');
		assert.strictEqual(unavailable.mountState, 'unavailable');
		assert.strictEqual(unavailable.badge, MOUNT_BADGE.unavailable);
		assert.match(String(unavailable.tooltip), /not attached/);
		assert.strictEqual(unavailable.subtreeSize, 0, 'マウントは葉（開ける空フォルダではない）');
	});

	test('マウントの位置のローカルデータは開けるまま，git 外であることが説明に出る', () => {
		const anomaly = contents.rows.find((row) => row.name === 'failed-mount');
		assert.ok(anomaly);
		assert.strictEqual(anomaly.kind, 'directory', '中身があるので開けるまま');
		assert.strictEqual(anomaly.mountState, 'local-data');
		assert.strictEqual(anomaly.badge, MOUNT_BADGE['local-data']);
		assert.ok(anomaly.subtreeSize > 0, '配下の行を従える');
		assert.match(String(anomaly.tooltip), /version control/);
	});

	test('走査が中に入れたマウントはディレクトリのまま印が付き，二重に出ない', () => {
		const withWalked = build([...FILES, file('contents/gdrive/MyDrive/notes/meeting.md')], MOUNTS);
		const rows = region(withWalked, 'myContents').rows.filter((row) => row.name === 'gdrive');
		assert.strictEqual(rows.length, 1, 'ディレクトリ行とマウント行が重複している');
		assert.strictEqual(rows[0].kind, 'directory', '中身があるマウントは開けるまま');
		assert.strictEqual(rows[0].mountState, 'attached');
		assert.strictEqual(rows[0].badge, MOUNT_BADGE.attached);
		assert.ok(rows[0].subtreeSize > 0, 'マウント配下の行を従える');
	});

	test('繋がっているマウントは別のバッジになる', () => {
		const attached = contents.rows.find((row) => row.name === 'gdrive');
		assert.strictEqual(attached?.mountState, 'attached');
		assert.strictEqual(attached?.badge, MOUNT_BADGE.attached);
	});

	test('submodule の中のマウントは最も近いスコープ＝そのチームのグループに入る', () => {
		const team = build(FILES, [{ path: 'team-kb/engineering/contents/shared', state: 'unavailable' }]);
		const rows = region(team, 'teamContents').rows;
		const mount = rows.find((row) => row.kind === 'mount');
		assert.ok(mount, 'チーム側にマウント行が無い');
		assert.strictEqual(mount.name, 'shared');
		const group = rows.slice(0, rows.indexOf(mount)).reverse().find((row) => row.depth === 0);
		assert.strictEqual(group?.name, 'engineering');
		assert.ok(
			!region(team, 'myContents').rows.some((row) => row.kind === 'mount'),
			'チームのマウントが個人領域に出ている'
		);
	});

	test('コンパクト表示で単一子に畳まれてもマウントの印は残る（既定は compact）', () => {
		const model = buildRealGridModel({
			byLayer: classifyByScope(
				[file('contents/gdrive/MyDrive/notes/meeting.md')],
				SCOPES,
				DEFAULT_LAYERS
			).byLayer,
			scopes: SCOPES,
			mounts: [{ path: 'contents/gdrive', state: 'attached' }],
			layers: DEFAULT_LAYERS,
			compact: true,
		});
		const marked = region(model, 'myContents').rows.filter((row) => row.mountState === 'attached');
		assert.strictEqual(marked.length, 1, 'マウントの印が消えている（畳まれた行を見ていない）');
		assert.strictEqual(marked[0].badge, MOUNT_BADGE.attached);
	});

	test('ファイルもマウントも無ければ 5 領域を空で返す（境界値）', () => {
		const empty = build([], []);
		assert.strictEqual(empty.regions.length, 5);
		assert.strictEqual(empty.fileCount, 0);
		assert.strictEqual(region(empty, 'myContents').rows.length, 0);
	});

	test('ファイルが 1 件も無くてもマウントだけは描かれる（空フォルダとの取り違えを防ぐ）', () => {
		const onlyMounts = build([], MOUNTS);
		assert.deepStrictEqual(names(region(onlyMounts, 'myContents').rows), [
			'0:directory:contents',
			'1:mount:failed-mount',
			'1:mount:gdrive',
			'1:mount:onedrive',
		]);
	});
});
