# LayeredKB

VS Code 拡張機能のスケルトンです。TypeScript + esbuild 構成。

## セットアップ

```bash
npm install
```

## 開発

| コマンド | 内容 |
| --- | --- |
| `npm run watch` | esbuild と tsc の型チェックをウォッチ実行 |
| `npm run compile` | 型チェック + Lint + バンドル（開発ビルド） |
| `npm run package` | 型チェック + Lint + バンドル（本番ビルド、minify） |
| `npm run lint` | ESLint |
| `npm run check-types` | 型チェックのみ |
| `npm test` | 拡張機能の統合テスト（VS Code を起動） |

VS Code でこのフォルダを開き、`F5`（Run Extension）で拡張機能ホストが起動します。
コマンドパレットから `LayeredKB: Hello World` を実行して動作確認できます。

## ディレクトリ構成

```
.
├── .vscode/              # デバッグ・ビルドタスク設定
├── src/
│   ├── extension.ts      # エントリポイント（activate / deactivate）
│   └── test/             # 統合テスト
├── esbuild.js            # バンドル設定
├── eslint.config.mjs     # ESLint（flat config）
├── tsconfig.json
└── .vscode-test.mjs      # @vscode/test-cli 設定
```

エントリポイントは `src/extension.ts`、バンドル出力は `dist/extension.js`（`package.json` の `main`）です。
コマンドや設定項目は `package.json` の `contributes` に追加します。

## 公開前に

`package.json` の `name` / `displayName` / `description` / `publisher` を実際の値に更新してください。
`publisher` は Marketplace で取得した publisher ID である必要があります。

```bash
npx @vscode/vsce package   # .vsix を生成
npx @vscode/vsce publish   # Marketplace へ公開
```
