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
		for (const id of ['layeredkb.refresh', 'layeredkb.configureLayers', 'layeredkb.revealInExplorer']) {
			assert.ok(commands.includes(id), `command ${id} is not registered`);
		}
	});

	test('declares one view slot per layer', () => {
		const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
		const views = extension.packageJSON.contributes.views.layeredkb as { id: string }[];
		assert.ok(views.length >= 5, 'at least 4 layers + other');
		assert.ok(views.every((v, i) => v.id === `layeredkb.slot${i}`));
	});
});
