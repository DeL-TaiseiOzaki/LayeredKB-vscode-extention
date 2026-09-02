import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'del-taiseiozaki.layeredkb';

suite('Extension Test Suite', () => {
	test('activates and registers its commands', async () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID);
		assert.ok(extension, `extension ${EXTENSION_ID} was not found`);

		await extension.activate();
		assert.ok(extension.isActive);

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('layeredkb.helloWorld'));
	});
});
