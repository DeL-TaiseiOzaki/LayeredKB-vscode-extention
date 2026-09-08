import * as assert from 'assert';
import { DirectoryEntry, walkDirectory, WalkPort } from '../../walk';

/**
 * テスト用の擬似ファイルシステム．
 * `dirs` はディレクトリ（絶対風パス）→ 子要素，`links` はリンクの絶対風パス → リンク先．
 * 実際のファイルシステムを触らないので，自己参照リンクも安全に組める．
 */
interface FakeFs {
	dirs: Record<string, DirectoryEntry[]>;
	links?: Record<string, string>;
}

function dir(name: string, isSymbolicLink = false): DirectoryEntry {
	return { name, isFile: false, isDirectory: true, isSymbolicLink };
}

function plainFile(name: string, isSymbolicLink = false): DirectoryEntry {
	return { name, isFile: true, isDirectory: false, isSymbolicLink };
}

function brokenLink(name: string): DirectoryEntry {
	return { name, isFile: false, isDirectory: false, isSymbolicLink: true };
}

/** ルートを `/root` とみなす擬似ポート．readDirectory の呼び出し回数も数える */
function createFakePort(fs: FakeFs): WalkPort & { reads: string[]; realPathCalls: string[] } {
	const links = fs.links ?? {};
	const toAbsolute = (relativePath: string): string => (relativePath ? `/root/${relativePath}` : '/root');
	const resolve = (absolute: string): string => {
		// 先頭から順に，リンクとして登録されているプレフィックスを置き換える
		const segments = absolute.split('/');
		let current = '';
		for (const segment of segments) {
			if (segment === '') {
				continue;
			}
			current = `${current}/${segment}`;
			const target = links[current];
			if (target !== undefined) {
				current = target;
			}
		}
		return current || '/';
	};
	const reads: string[] = [];
	const realPathCalls: string[] = [];
	return {
		reads,
		realPathCalls,
		async readDirectory(relativePath) {
			reads.push(relativePath);
			const real = resolve(toAbsolute(relativePath));
			const entries = fs.dirs[real];
			if (entries === undefined) {
				throw new Error(`ENOENT: ${relativePath} (${real})`);
			}
			return entries;
		},
		async realPath(relativePath) {
			realPathCalls.push(relativePath);
			return resolve(toAbsolute(relativePath));
		},
		childPath(parentRealPath, name) {
			return `${parentRealPath}/${name}`;
		},
	};
}

function run(
	fs: FakeFs,
	options: { followSymlinks?: boolean; exclude?: (p: string) => boolean; limits?: { maxDepth?: number; maxEntries?: number } } = {}
) {
	const port = createFakePort(fs);
	const visited: string[] = [];
	const promise = walkDirectory(port, {
		followSymlinks: options.followSymlinks ?? false,
		excluded: options.exclude ?? (() => false),
		visit: (relativePath) => visited.push(relativePath),
		limits: options.limits,
	});
	return { port, visited, promise };
}

suite('walk: walkDirectory（リンクを辿らない既定動作）', () => {
	test('通常のディレクトリを再帰的に走査し，除外パターンを尊重する', async () => {
		const { visited, promise } = run(
			{
				dirs: {
					'/root': [plainFile('a.md'), dir('sub'), dir('node_modules')],
					'/root/sub': [plainFile('b.md')],
					'/root/node_modules': [plainFile('c.md')],
				},
			},
			{ exclude: (p) => p.startsWith('node_modules') }
		);
		await promise;
		assert.deepStrictEqual(visited, ['a.md', 'sub/b.md']);
	});

	test('シンボリックリンクはスキップし，件数を診断として返す', async () => {
		const { visited, port, promise } = run({
			dirs: {
				'/root': [plainFile('a.md'), dir('drive', true), plainFile('note.md', true)],
				'/drive': [plainFile('inside.pdf')],
			},
			links: { '/root/drive': '/drive' },
		});
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['a.md']);
		assert.strictEqual(diagnostics.skippedSymlinks, 2);
		// 辿らない経路では realpath を一切呼ばない（ネットワークマウントでの stat 追加を避ける）
		assert.deepStrictEqual(port.realPathCalls, []);
	});

	test('リンクを辿らないときは上限を適用せず，従来どおり全件を返す', async () => {
		const { visited, promise } = run(
			{ dirs: { '/root': [plainFile('a.md'), plainFile('b.md'), plainFile('c.md')] } },
			{ limits: { maxEntries: 1 } }
		);
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['a.md', 'b.md', 'c.md']);
		assert.strictEqual(diagnostics.truncatedBy, undefined);
	});
});

suite('walk: walkDirectory（リンクを辿る場合）', () => {
	test('ディレクトリへのリンクを辿り，ファイルへのリンクも 1 ファイルとして扱う', async () => {
		const { visited, promise } = run(
			{
				dirs: {
					'/root': [dir('drive', true), plainFile('shortcut.md', true)],
					'/drive': [plainFile('inside.pdf'), dir('nested')],
					'/drive/nested': [plainFile('deep.pdf')],
				},
				links: { '/root/drive': '/drive' },
			},
			{ followSymlinks: true }
		);
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['drive/inside.pdf', 'drive/nested/deep.pdf', 'shortcut.md']);
		assert.strictEqual(diagnostics.skippedSymlinks, 0);
		assert.strictEqual(diagnostics.cycles, 0);
	});

	test('自己参照リンク（自分の親を指すリンク）でも走査が終了する', async () => {
		const { visited, promise } = run(
			{
				dirs: { '/root': [plainFile('a.md'), dir('loop', true)] },
				links: { '/root/loop': '/root' },
			},
			{ followSymlinks: true }
		);
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['a.md']);
		assert.strictEqual(diagnostics.cycles, 1);
		assert.strictEqual(diagnostics.truncatedBy, undefined);
	});

	test('リンクが相互に指し合う循環でも走査が終了する', async () => {
		const { visited, promise } = run(
			{
				dirs: {
					'/root': [dir('a'), dir('b')],
					'/root/a': [plainFile('a.md'), dir('to-b', true)],
					'/root/b': [plainFile('b.md'), dir('to-a', true)],
				},
				links: { '/root/a/to-b': '/root/b', '/root/b/to-a': '/root/a' },
			},
			{ followSymlinks: true }
		);
		const diagnostics = await promise;
		// a -> to-b -> b（b.md）-> to-a は祖先 /root/a を指すので打ち切られる
		assert.deepStrictEqual(visited, ['a/a.md', 'a/to-b/b.md', 'b/b.md', 'b/to-a/a.md']);
		assert.strictEqual(diagnostics.cycles, 2);
	});

	test('同じ実体を指す 2 本のリンクは両方とも走査される（祖先チェーンのみで循環判定するため）', async () => {
		const { visited, promise } = run(
			{
				dirs: {
					'/root': [dir('public', true), dir('private', true)],
					'/target': [plainFile('x.pdf')],
				},
				links: { '/root/public': '/target', '/root/private': '/target' },
			},
			{ followSymlinks: true }
		);
		await promise;
		assert.deepStrictEqual(visited, ['public/x.pdf', 'private/x.pdf']);
	});

	test('壊れたリンク（種別不明）は無視され，走査は続く', async () => {
		const { visited, promise } = run(
			{ dirs: { '/root': [brokenLink('dangling'), plainFile('a.md')] } },
			{ followSymlinks: true }
		);
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['a.md']);
		assert.strictEqual(diagnostics.unresolvedSymlinks, 0);
	});

	test('正規パスを解決できないリンクは辿らず，未解決として数える', async () => {
		const port = createFakePort({
			dirs: { '/root': [dir('drive', true)], '/drive': [plainFile('inside.pdf')] },
			links: { '/root/drive': '/drive' },
		});
		const unresolvable: WalkPort = { ...port, realPath: async () => undefined };
		const visited: string[] = [];
		const diagnostics = await walkDirectory(unresolvable, {
			followSymlinks: true,
			excluded: () => false,
			visit: (p) => visited.push(p),
		});
		assert.deepStrictEqual(visited, []);
		assert.strictEqual(diagnostics.unresolvedSymlinks, 1);
	});

	test('深さ上限を超えた枝だけを捨て，兄弟の走査は続ける', async () => {
		const { visited, promise } = run(
			{
				dirs: {
					'/root': [dir('deep'), plainFile('top.md')],
					'/root/deep': [dir('deeper')],
					'/root/deep/deeper': [plainFile('buried.md')],
				},
			},
			{ followSymlinks: true, limits: { maxDepth: 1 } }
		);
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['top.md']);
		assert.strictEqual(diagnostics.truncatedBy, 'max-depth');
		assert.strictEqual(diagnostics.truncatedAt, 'deep/deeper');
	});

	test('検査エントリ数の上限に達したら走査全体を打ち切り，理由を返す', async () => {
		const { visited, promise } = run(
			{ dirs: { '/root': [plainFile('a.md'), plainFile('b.md'), plainFile('c.md')] } },
			{ followSymlinks: true, limits: { maxEntries: 2 } }
		);
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['a.md', 'b.md']);
		assert.strictEqual(diagnostics.truncatedBy, 'max-entries');
		assert.strictEqual(diagnostics.entriesInspected, 3);
	});

	test('除外されたエントリも検査数に数える（除外されたリンクの奥で予算を使い切らないため）', async () => {
		const { promise } = run(
			{ dirs: { '/root': [dir('skipped'), plainFile('a.md')] } },
			{ followSymlinks: true, exclude: (p) => p.startsWith('skipped') }
		);
		const diagnostics = await promise;
		assert.strictEqual(diagnostics.entriesInspected, 2);
	});

	test('ルート自身がリンクでも走査され，正規パスが祖先チェーンの起点になる', async () => {
		const { visited, port, promise } = run(
			{
				dirs: { '/drive': [plainFile('a.pdf'), dir('back', true)] },
				links: { '/root': '/drive', '/drive/back': '/drive' },
			},
			{ followSymlinks: true }
		);
		const diagnostics = await promise;
		assert.deepStrictEqual(visited, ['a.pdf']);
		assert.strictEqual(diagnostics.cycles, 1);
		assert.strictEqual(port.realPathCalls[0], '');
	});
});
