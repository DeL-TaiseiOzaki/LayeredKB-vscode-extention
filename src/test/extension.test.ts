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
		const views = extension.packageJSON.contributes.views.layeredkb as { id: string; when?: string }[];
		const slots = views.filter((v) => v.id.startsWith('layeredkb.slot'));
		assert.ok(slots.length >= 5, 'at least 4 layers + other');
		assert.ok(slots.every((v, i) => v.id === `layeredkb.slot${i}`));
		// Any other view in this container (the grid spike) must be opt-in, never shown by default.
		for (const view of views.filter((v) => !v.id.startsWith('layeredkb.slot'))) {
			assert.ok(view.when?.startsWith('config.'), `${view.id} must be gated by a setting`);
		}
	});
});
