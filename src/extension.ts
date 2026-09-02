import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('layeredkb.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from LayeredKB!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
