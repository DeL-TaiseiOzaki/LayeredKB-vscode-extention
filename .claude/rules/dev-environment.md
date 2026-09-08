# Development Environment

Project development environment and toolchain for the LayeredKB VS Code extension.

## Package Management: npm

This project uses npm (`package-lock.json` is the lockfile) — do not introduce yarn or pnpm.

```bash
# Install exactly what the lockfile specifies (CI, or after pulling changes)
npm ci

# Install/update dependencies and the lockfile
npm install

# Add a dependency
npm install <package>
npm install --save-dev <package>

# Run any script defined in package.json
npm run <script>
```

CI (`.github/workflows/ci.yml`, `.github/workflows/release.yml`) runs on **Node 22** via `actions/setup-node@v4`; match that locally when possible.

### npm scripts (`package.json`)

| Script | Command | Purpose |
|---|---|---|
| `check-types` | `tsc --noEmit` | Type-check only, no emitted output |
| `lint` | `eslint src` | Lint `src/` |
| `compile` | `npm run check-types && npm run lint && node esbuild.js` | Full dev build: type-check, lint, then bundle |
| `watch` | `npm-run-all -p watch:*` | Run `watch:esbuild` and `watch:tsc` in parallel |
| `watch:esbuild` | `node esbuild.js --watch` | Rebuild the bundle on change |
| `watch:tsc` | `tsc --noEmit --watch --project tsconfig.json` | Re-typecheck on change |
| `package` | `npm run check-types && npm run lint && node esbuild.js --production` | Production build: minified, no sourcemap |
| `vscode:prepublish` | `npm run package` | Runs automatically before `vsce package`/`vsce publish` |
| `compile-tests` | `tsc -p . --outDir out` | Compile `src/**/*.ts` (app + tests) to `out/` |
| `watch-tests` | `tsc -p . -w --outDir out` | Same, in watch mode |
| `pretest` | `npm run compile-tests && npm run compile` | Runs automatically before `npm test` |
| `test` | `vscode-test` | Integration tests inside a real VS Code instance |
| `test:unit` | `npm run compile-tests && mocha --ui tdd "out/test/unit/**/*.test.js"` | Unit tests under Mocha, no VS Code host |

`npm-run-all` is the binary name invoked by `watch`; the package that provides it is `npm-run-all2` (a maintained fork) in `devDependencies` — the name mismatch is expected, not a typo.

## Type Checking: TypeScript

```bash
npm run check-types
```

`tsconfig.json`: `strict: true`, target `ES2022`, module `Node16`, plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Source root is `src/`; `include` is `["src"]`.

## Linting: ESLint

```bash
npm run lint
```

- Config: `eslint.config.mjs` (flat config) — `@eslint/js` recommended + `typescript-eslint` recommended, applied to `**/*.ts`.
- Extra rules (all `warn`): `curly`, `eqeqeq`, `no-throw-literal`, `semi`.
- `src/test/**/*.ts` additionally gets Mocha TDD globals (`suite`, `test`, `setup`, `teardown`, …).
- `dist/**` and `out/**` are ignored.
- There is no autofix script and no formatter (no Prettier) configured in this project — do not assume `npm run lint -- --fix` or a `format` script exists.

## Bundling: esbuild

Driven by `esbuild.js` (a plain Node script, not a config file consumed by a CLI) — always go through the npm scripts above rather than invoking `esbuild` directly.

- Entry point `src/extension.ts` → bundled CommonJS output `dist/extension.js`.
- `vscode` is marked `external` (supplied by the VS Code host at runtime; never bundled).
- Dev build: sourcemap on, unminified. `--production`: minified, no sourcemap.
- `--watch`: incremental rebuild; console output is formatted for VS Code's `$esbuild-watch` problem matcher (see `.vscode/tasks.json`).

## Testing

Two independent suites, both compiled via `compile-tests` first. See `.claude/rules/testing.md` for how to write and structure tests.

```bash
# Unit tests — fast, run directly under Mocha, no VS Code host
npm run test:unit

# Integration tests — launches a real VS Code instance
npm test
```

`npm test` is configured by `.vscode-test.mjs` (`files: 'out/test/*.test.js'`); `pretest` compiles and builds first automatically.

## Debugging: Extension Development Host

`.vscode/launch.json` defines the **Run Extension** configuration (F5 in VS Code): it launches an Extension Development Host with `--extensionDevelopmentPath=${workspaceFolder}`, maps sourcemaps to `dist/**/*.js`, and runs the default build task first (`watch`, defined in `.vscode/tasks.json`).

```bash
# Command-line equivalent of the build step F5 triggers
npm run compile
```

## Packaging & Publishing: vsce

```bash
# Dry-run package, as CI does on every push/PR
npx @vscode/vsce package --out layeredkb.vsix
```

`@vscode/vsce` is a `devDependency`; actual releases are tag-driven (`v*` tags) through `.github/workflows/release.yml`, which also publishes to the Marketplace using the `VSCE_PAT` secret.

## Continuous Integration

- `ci.yml`: on push to `main` and on pull requests — `npm ci` → `npm run compile` → `npm run test:unit` → dry-run package, uploads the `.vsix` as a build artifact.
- `release.yml`: on `v*` tags (or manual `workflow_dispatch` run from a tag) — same build/test steps, then verifies the tag matches `package.json`'s `version`, packages, publishes to the Marketplace, and attaches the `.vsix` to a GitHub Release.
- Both pin **Node 22** via `actions/setup-node@v4`.

## Pre-commit Checklist

- [ ] `npm run check-types` passes
- [ ] `npm run lint` passes
- [ ] `npm run compile` passes
- [ ] `npm run test:unit` passes
- [ ] `npm test` passes (when the change touches anything the integration suite exercises)
