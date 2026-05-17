# parts-vscode

ワークスペースのパーツを一覧し、整合性違反を可視化する VSCode 拡張（仕様 §10 編集UI層）。`parts-engine` を `file:` 依存として esbuild で同梱する。

## 機能

- **Parts ビュー** — アクティビティバーに型別ツリー。クリックでファイルを開く。
- **整合性診断** — 構造エラー＋整合性違反を Problems パネルへ（tier1=Error / tier2=Warning / tier3=Information）。`*.md` 変更で自動更新。
- **ホバー** — パーツ ID トークン上で対象の要約を表示。
- **コマンド**
  - `Parts: 整合性チェック` / `Parts: 一覧を更新`
  - `Parts: 関係パーツへ移動`（in/out 関係を QuickPick）
  - `Parts: パーツを分割`（本文の `---SPLIT---` 位置で2分割し deps 連結）
  - `Parts: パーツを結合`（加算的: 元は保持し `supersedes` で連結）

分割/結合はファイル書込前にモーダル確認する。

## 開発

```sh
# 先に parts-engine をビルド（file: 依存）
( cd ../parts-engine && npm install && npm run build )

npm install
npm run typecheck
npm run build      # dist/extension.js を生成
```

## 実行

VSCode で `parts-vscode` を開き F5（拡張開発ホスト）。または `npx vsce package` で `.vsix` を作成しインストールする。
