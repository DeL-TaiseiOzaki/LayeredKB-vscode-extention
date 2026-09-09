import * as assert from 'assert';
import {
	collectMountPoints,
	FILE_TYPE_DIRECTORY,
	FILE_TYPE_FILE,
	FILE_TYPE_SYMBOLIC_LINK,
	MountObservation,
	mountDisplayPath,
	mountStateOf,
} from '../../mounts';

/** 実測値: 辿れないリンクは 64，辿れるディレクトリのリンクは 66 */
const DANGLING_LINK = FILE_TYPE_SYMBOLIC_LINK;
const LINKED_DIRECTORY = FILE_TYPE_SYMBOLIC_LINK | FILE_TYPE_DIRECTORY;

function observed(name: string, type: number, onSeparateDevice?: boolean): MountObservation {
	return { name, type, onSeparateDevice };
}

suite('mounts: mountStateOf', () => {
	test('辿れないリンク（type=64）は未接続', () => {
		assert.strictEqual(mountStateOf(observed('onedrive', DANGLING_LINK)), 'unavailable');
		assert.strictEqual(mountStateOf(observed('onedrive', DANGLING_LINK, false)), 'unavailable');
	});

	test('辿れるリンクは接続済み（同じデバイス上のリンク先でも変わらない）', () => {
		assert.strictEqual(mountStateOf(observed('gdrive', LINKED_DIRECTORY)), 'attached');
		assert.strictEqual(mountStateOf(observed('gdrive', LINKED_DIRECTORY, false)), 'attached');
	});

	test('リンクでない実ディレクトリでも別デバイスなら接続済み（FUSE マウントポイント）', () => {
		// シンボリックリンク判定に依存しないことの証明: type にリンクビットが無い．
		assert.strictEqual(mountStateOf(observed('gdrive', FILE_TYPE_DIRECTORY, true)), 'attached');
	});

	test('交換面と同じデバイスの実ディレクトリは異常（マウントの位置にあるローカルデータ）', () => {
		assert.strictEqual(mountStateOf(observed('failed-mount', FILE_TYPE_DIRECTORY, false)), 'local-data');
	});

	test('交換面直下の実ファイルも同じ異常として扱う', () => {
		assert.strictEqual(mountStateOf(observed('dropped.bin', FILE_TYPE_FILE, false)), 'local-data');
	});

	test('デバイスを観測できないときは異常と断定しない（リモート FS で誤警告しない）', () => {
		assert.strictEqual(mountStateOf(observed('gdrive', FILE_TYPE_DIRECTORY, undefined)), 'attached');
	});
});

suite('mounts: collectMountPoints', () => {
	test('交換面直下は種別を問わずすべてマウント点として状態つきで返る', () => {
		const mounts = collectMountPoints(
			[
				observed('gdrive', LINKED_DIRECTORY),
				observed('nfs-drive', FILE_TYPE_DIRECTORY, true),
				observed('onedrive', DANGLING_LINK),
				observed('failed-mount', FILE_TYPE_DIRECTORY, false),
			],
			'contents'
		);
		assert.deepStrictEqual(
			mounts.map((m) => [m.path, m.state]),
			[
				['contents/gdrive', 'attached'],
				['contents/nfs-drive', 'attached'],
				['contents/onedrive', 'unavailable'],
				['contents/failed-mount', 'local-data'],
			]
		);
	});

	test('交換面が空ならマウント点も無い（境界値）', () => {
		assert.deepStrictEqual(collectMountPoints([], 'contents'), []);
	});

	test('複数ルート時は表示パスにルート名が付く', () => {
		const [mount] = collectMountPoints([observed('onedrive', DANGLING_LINK)], 'contents', 'kb');
		assert.strictEqual(mountDisplayPath(mount), 'kb/contents/onedrive');
		assert.strictEqual(mount.state, 'unavailable');
	});
});
