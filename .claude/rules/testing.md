# Testing Rules

Guidelines for writing and running tests in this repository.

## Core Principles

- **TDD encouraged**: write the test alongside or before the implementation.
- **No coverage gate**: no coverage tool (nyc, c8, istanbul, ...) is configured in this repo. Treat coverage as an untooled aspiration, not a gate -- rely on the Test Case Coverage checklist below instead of a percentage target.
- **Keep the unit suite fast**: unit tests run in milliseconds because they execute directly under `mocha`, with no Electron startup. Reserve the integration suite for what actually needs the real editor.

## Two Test Suites, Two Costs

This repository has two independent test suites, and where a new test file lives decides which one runs it:

- **Unit suite** -- `src/test/unit/**/*.test.ts`. Pure logic with no `vscode` import, like `src/layers.ts`, whose header comment states it is free of the VS Code API by design. Compiled by `npm run compile-tests` and run directly by `mocha` -- no VS Code download, tests run in milliseconds. Command: `npm run test:unit`.
- **Integration suite** -- `src/test/*.test.ts` (top level only, e.g. `src/test/extension.test.ts`). Anything that touches `vscode.*` (window, workspace, commands, extension activation, ...). Run through `@vscode/test-cli` / `@vscode/test-electron`, which launch a real VS Code instance -- slow, but it is the only way to exercise the real API. Command: `npm test`.

`npm run compile-tests` (`tsc -p . --outDir out`) compiles all of `src/`, preserving directory structure, so `out/test/unit/**/*.test.js` and `out/test/*.test.js` (the glob `.vscode-test.mjs` declares) stay disjoint by construction -- a test file can never land in both suites.

CI (`.github/workflows/ci.yml`) runs `npm run test:unit` on Node 22 only; the integration suite is not part of CI, so run `npm test` locally whenever a change touches `vscode.*`.

**Default new logic to the VS Code-free side.** Being free of the `vscode` import is what makes the unit suite possible at all -- importing `vscode` anywhere in a module's dependency chain forces every test of that module into the slow, Electron-backed suite.

## Test Structure

### AAA Pattern

Follow Arrange-Act-Assert, using the mocha TDD interface (`suite` / `test`) and Node's built-in `assert` module -- the same imports every existing test file uses:

```typescript
import * as assert from 'assert';
import { classifyFiles, ClassifiedFile, LayerDefinition } from '../../layers';

function file(relativePath: string): ClassifiedFile {
  return { key: relativePath, relativePath };
}

suite('layers: classifyFiles', () => {
  test('先に定義したレイヤーが優先される（first-match-wins）', () => {
    // Arrange
    const layers: LayerDefinition[] = [
      { id: 'ontology', label: 'Ontology', patterns: ['ontology/**'] },
      { id: 'knowledge', label: 'Knowledge', patterns: ['**/*.md'] },
    ];

    // Act
    const { layerOfFile } = classifyFiles([file('ontology/terms.md'), file('notes/a.md')], layers);

    // Assert
    assert.strictEqual(layerOfFile.get('ontology/terms.md'), 'ontology');
    assert.strictEqual(layerOfFile.get('notes/a.md'), 'knowledge');
  });
});
```

(Adapted from `src/test/unit/layers.test.ts`.)

### Naming Convention

`suite()` groups tests by module and function under test (`'layers: classifyFiles'`, `'layers: buildTree'`, ...). Each `test()` description is a full sentence stating the condition and the expected result -- not a fixed template. Existing examples from `src/test/unit/layers.test.ts`:

- `'先に定義したレイヤーが優先される（first-match-wins）'`
- `'roots を持つレイヤー（Raw）はワークスペース内ファイルを取り込まない'`
- `'ID 重複・予約 ID・patterns 欠落・roots の型を検出する'`

## Test Case Coverage

For each function, consider all four, the same way `src/test/unit/layers.test.ts` does for `src/layers.ts`:

1. **Happy path** -- e.g. `classifyFiles` sorting a normal file list into `schema` / `ontology` / `knowledge` / `other`.
2. **Boundary values** -- e.g. `classifyFiles([], DEFAULT_LAYERS)` still returns every layer key with an empty array.
3. **Error / invalid-input cases** -- e.g. `validateLayers` detecting a duplicate `id`, the reserved `"other"` id, an empty `patterns` array, and a non-array `roots`.
4. **Edge cases** -- e.g. `buildTree` collapsing a chain of single-child directories only when `compact` is `true`.

## Fixtures

There is no shared, centralized fixture file -- each test file defines its own small local helper to build fixture objects. `src/test/unit/layers.test.ts` defines:

```typescript
function file(relativePath: string, rootLabel?: string): ClassifiedFile {
  return { key: relativePath, relativePath, rootLabel };
}
```

and calls it inline, e.g. `file('AGENTS.md')` or `file('notes/a.md', 'kb')`. If a fixture is ever needed by more than one test file, add a small shared helper module under `src/test/` rather than introducing a global fixture registry that does not exist yet.

## Mocking / Stubbing

No mocking or stubbing library is declared in `package.json` -- do not add one without a concrete need.

- **Unit suite**: the functions under test (`classifyFiles`, `buildTree`, `validateLayers`, `compileLayerMatcher`, ...) are pure -- plain data in, plain data out -- so tests build fixture objects (see Fixtures) instead of mocking collaborators.
- **Integration suite**: `src/test/extension.test.ts` does not mock `vscode` either. It runs inside the real VS Code instance `@vscode/test-electron` launches, and asserts on the real result of calls like `vscode.extensions.getExtension(...)` and `vscode.commands.getCommands(true)`. If behavior can only be observed through the real editor, it belongs in this suite rather than behind a hand-rolled mock.

## Commands

```bash
# Unit suite -- compiles, then runs mocha directly (fast, no VS Code download)
npm run test:unit

# Integration suite -- the "pretest" script compiles first, then a real VS Code instance is launched
npm test

# Compile test sources (and the rest of src/) without running anything
npm run compile-tests

# Recompile on every change while iterating on tests
npm run watch-tests

# Run a single unit test file
npx mocha --ui tdd out/test/unit/layers.test.js

# Filter unit tests by name (regex against the test description)
npx mocha --ui tdd "out/test/unit/**/*.test.js" --grep "buildTree"
```

## Checklist

- [ ] Happy path is tested
- [ ] Error cases are tested
- [ ] Boundary values are tested
- [ ] Tests are independent (no order dependency)
- [ ] New VS Code-free logic has a unit test under `src/test/unit/`
- [ ] New code touching `vscode.*` has (or extends) an integration test under `src/test/`
- [ ] Unit tests still run in milliseconds -- nothing slow leaked into that suite
