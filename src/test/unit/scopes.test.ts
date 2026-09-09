import * as assert from 'assert';
import { ClassifiedFile, DEFAULT_LAYERS, LayerDefinition, OTHER_LAYER_ID, WORKSPACE_SCOPE_ID } from '../../layers';
import {
	attachScopes,
	buildScopeRoots,
	classifyByScope,
	findScopeRoot,
	parseGitmodulePaths,
	ScopeRoot,
	scopeIdOf,
} from '../../scopes';

function file(relativePath: string, rootLabel?: string): ClassifiedFile {
	return { key: relativePath, relativePath, rootLabel };
}

/** フィクスチャの実物と同じ形（vault + team-kb/engineering + partner-kb） */
function vaultScopes(): ScopeRoot[] {
	return buildScopeRoots({
		label: 'fixture-vault',
		submodulePaths: ['team-kb/engineering', 'partner-kb'],
	});
}

suite('scopes: parseGitmodulePaths', () => {
	test('submodule セクションの path を宣言順に取り出す', () => {
		const text = [
			'[submodule "team-kb/engineering"]',
			'\tpath = team-kb/engineering',
			'\turl = /somewhere/engineering-kb',
			'[submodule "partner-kb"]',
			'\tpath = partner-kb',
			'\turl = /somewhere/partner-kb',
		].join('\n');
		assert.deepStrictEqual(parseGitmodulePaths(text), ['team-kb/engineering', 'partner-kb']);
	});

	test('引用符・CRLF・区切りのゆれ・重複を吸収する', () => {
		const text = '[submodule "a"]\r\n\tpath = "team\\\\kb"\r\n[submodule "b"]\r\n\tpath = team/kb/\r\n';
		assert.deepStrictEqual(parseGitmodulePaths(text), ['team/kb']);
	});

	test('ワークスペースの外を指す path とセクション外の path は捨てる', () => {
		const text = [
			'path = not-in-a-section',
			'[core]',
			'\tpath = also-not-a-submodule',
			'[submodule "escape"]',
			'\tpath = ../outside',
			'[submodule "absolute"]',
			'\tpath = /etc',
			'[submodule "drive"]',
			'\tpath = C:/kb',
			'[submodule "empty"]',
			'\tpath =',
			'[submodule "ok"]',
			'\tpath = team-kb',
		].join('\n');
		assert.deepStrictEqual(parseGitmodulePaths(text), ['team-kb']);
	});

	test('.gitmodules が空なら submodule は無い', () => {
		assert.deepStrictEqual(parseGitmodulePaths(''), []);
	});
});

suite('scopes: buildScopeRoots / findScopeRoot', () => {
	test('ワークスペースフォルダ自身も 1 つのスコープルートになる', () => {
		const [workspace, ...submodules] = vaultScopes();
		assert.deepStrictEqual(
			{ id: workspace.id, path: workspace.path, kind: workspace.kind },
			{ id: WORKSPACE_SCOPE_ID, path: '', kind: 'workspace' }
		);
		assert.deepStrictEqual(
			submodules.map((s) => [s.id, s.label, s.kind]),
			[
				['team-kb/engineering', 'engineering', 'submodule'],
				['partner-kb', 'partner-kb', 'submodule'],
			]
		);
	});

	test('複数ルート時はルート名を前置して ID を一意にする', () => {
		assert.strictEqual(scopeIdOf(undefined, ''), WORKSPACE_SCOPE_ID);
		assert.strictEqual(scopeIdOf('kb', ''), 'kb');
		assert.strictEqual(scopeIdOf('kb', 'team-kb'), 'kb/team-kb');
	});

	test('最も近い祖先のスコープルートが所有する（入れ子も含む）', () => {
		const scopes = buildScopeRoots({
			label: 'vault',
			submodulePaths: ['team-kb', 'team-kb/engineering'],
		});
		assert.strictEqual(findScopeRoot(file('team-kb/engineering/CLAUDE.md'), scopes)!.path, 'team-kb/engineering');
		assert.strictEqual(findScopeRoot(file('team-kb/README.md'), scopes)!.path, 'team-kb');
		assert.strictEqual(findScopeRoot(file('knowledge/idea.md'), scopes)!.path, '');
	});

	test('パスの前方一致ではなく区切り単位で判定する', () => {
		const scopes = vaultScopes();
		// "partner-kb-archive" は "partner-kb" の配下ではない
		assert.strictEqual(findScopeRoot(file('partner-kb-archive/note.md'), scopes)!.path, '');
		// スコープルートと同名のファイルもその配下ではない
		assert.strictEqual(findScopeRoot(file('partner-kb'), scopes)!.path, '');
	});

	test('複数ルート時は別のワークスペースフォルダのスコープを拾わない', () => {
		const scopes = [
			...buildScopeRoots({ rootLabel: 'kb', label: 'kb', submodulePaths: ['team-kb'] }),
			...buildScopeRoots({ rootLabel: 'other', label: 'other', submodulePaths: [] }),
		];
		assert.strictEqual(findScopeRoot(file('team-kb/CLAUDE.md', 'kb'), scopes)!.id, 'kb/team-kb');
		assert.strictEqual(findScopeRoot(file('team-kb/CLAUDE.md', 'other'), scopes)!.id, 'other');
	});
});

suite('scopes: attachScopes', () => {
	test('すべてのファイルがスコープとスコープ相対パスを持つ', () => {
		const scoped = attachScopes(
			[file('CLAUDE.md'), file('team-kb/engineering/.claude/rules/house.md')],
			vaultScopes()
		);
		assert.deepStrictEqual(
			scoped.map((f) => [f.scope.id, f.scopePath]),
			[
				[WORKSPACE_SCOPE_ID, 'CLAUDE.md'],
				['team-kb/engineering', '.claude/rules/house.md'],
			]
		);
	});

	test('スコープルートが 1 つも無くてもワークスペース相当のスコープで埋める', () => {
		const scoped = attachScopes([file('notes/idea.md', 'kb')], []);
		assert.deepStrictEqual(
			[scoped[0].scope.id, scoped[0].scope.kind, scoped[0].scopePath],
			['kb', 'workspace', 'notes/idea.md']
		);
	});

	test('relativePath は表示用にワークスペース相対のまま保たれる', () => {
		const scoped = attachScopes([file('team-kb/engineering/docs/design.md')], vaultScopes());
		assert.strictEqual(scoped[0].relativePath, 'team-kb/engineering/docs/design.md');
		assert.strictEqual(scoped[0].scopePath, 'docs/design.md');
	});
});

suite('scopes: classifyByScope', () => {
	test('submodule の CLAUDE.md は親のスキーマ層へ持ち上がらず，そのスコープのスキーマになる', () => {
		// 欠陥 1．旧実装では `**/CLAUDE.md` により親フレームのスキーマ層に入り，
		// どのリポジトリの契約かを示す情報も持っていなかった．
		const files = [file('CLAUDE.md'), file('team-kb/engineering/CLAUDE.md')];
		const { byLayer, layerOfFile } = classifyByScope(files, vaultScopes(), DEFAULT_LAYERS);
		assert.strictEqual(layerOfFile.get('team-kb/engineering/CLAUDE.md'), 'schema');

		// 分類結果のファイルは所有スコープを持ち歩く（どのリポジトリの契約かが分かる）
		assert.deepStrictEqual(
			byLayer.get('schema')!.map((f) => [f.relativePath, f.scope?.id]),
			[
				['CLAUDE.md', WORKSPACE_SCOPE_ID],
				['team-kb/engineering/CLAUDE.md', 'team-kb/engineering'],
			]
		);
	});

	test('同じスコープのスキーマは 1 つの層にまとまる（.claude/ が knowledge へ落ちない）', () => {
		// 欠陥 2．旧実装では `.claude/**` だけがルート固定で，submodule の
		// .claude/rules/house.md がナレッジ層へ落ちていた．
		const files = [
			file('team-kb/engineering/CLAUDE.md'),
			file('team-kb/engineering/AGENTS.md'),
			file('team-kb/engineering/.claude/rules/house.md'),
			file('team-kb/engineering/docs/design.md'),
			file('team-kb/engineering/ontology/terms.csv'),
		];
		const { layerOfFile } = classifyByScope(files, vaultScopes(), DEFAULT_LAYERS);
		assert.deepStrictEqual(
			files.map((f) => layerOfFile.get(f.key)),
			['schema', 'schema', 'schema', 'knowledge', 'ontology']
		);
	});

	test('マウントの中身は種別で散らず，交換面のレイヤーにまとまる', () => {
		// 欠陥 3．旧実装では CLAUDE.md→schema，.md→knowledge，.csv→ontology，.bin→raw と
		// 1 つのドライブが 4 レイヤーに散っていた．
		const files = [
			file('contents/gdrive/MyDrive/CLAUDE.md'),
			file('contents/gdrive/MyDrive/note.md'),
			file('contents/gdrive/Shared/data.csv'),
			file('contents/gdrive/Shared/blob.bin'),
			file('contents/local-raw/x.bin'),
		];
		const { byLayer } = classifyByScope(files, vaultScopes(), DEFAULT_LAYERS);
		assert.deepStrictEqual(
			byLayer.get('raw')!.map((f) => f.relativePath),
			files.map((f) => f.relativePath).sort() // 並びはツリー上のパス順
		);
		assert.deepStrictEqual(byLayer.get('schema'), []);
		assert.deepStrictEqual(byLayer.get('knowledge'), []);
		assert.deepStrictEqual(byLayer.get('ontology'), []);
	});

	test('交換面はフレームごとに存在する（submodule 配下の contents/ もその submodule のもの）', () => {
		const { layerOfFile } = classifyByScope(
			[file('team-kb/engineering/contents/share/data.csv')],
			vaultScopes(),
			DEFAULT_LAYERS
		);
		assert.strictEqual(layerOfFile.get('team-kb/engineering/contents/share/data.csv'), 'raw');
	});

	test('宣言されたスコープルートは交換面の中にあっても分類を所有する', () => {
		const scopes = buildScopeRoots({ label: 'vault', submodulePaths: ['contents/team-kb'] });
		const { layerOfFile } = classifyByScope(
			[file('contents/team-kb/CLAUDE.md'), file('contents/gdrive/CLAUDE.md')],
			scopes,
			DEFAULT_LAYERS
		);
		assert.strictEqual(layerOfFile.get('contents/team-kb/CLAUDE.md'), 'schema');
		assert.strictEqual(layerOfFile.get('contents/gdrive/CLAUDE.md'), 'raw');
	});

	test('ファイルが無くてもすべてのレイヤーが空配列として返る', () => {
		const { byLayer } = classifyByScope([], vaultScopes(), DEFAULT_LAYERS);
		assert.deepStrictEqual([...byLayer.keys()], ['schema', 'ontology', 'knowledge', 'raw', OTHER_LAYER_ID]);
	});

	test('フレームをまたいでもツリー上のパス順で並ぶ', () => {
		const layers: LayerDefinition[] = [{ id: 'knowledge', label: 'Knowledge', patterns: ['**/*.md'] }];
		const { byLayer } = classifyByScope(
			[file('team-kb/engineering/docs/design.md'), file('knowledge/idea.md'), file('partner-kb/docs/a.md')],
			vaultScopes(),
			layers
		);
		assert.deepStrictEqual(
			byLayer.get('knowledge')!.map((f) => f.relativePath),
			['knowledge/idea.md', 'partner-kb/docs/a.md', 'team-kb/engineering/docs/design.md']
		);
	});
});
