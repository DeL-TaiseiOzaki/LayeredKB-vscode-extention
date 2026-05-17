# parts-engine

段落エンジニアリングのパーツ管理コア（ドメイン非依存）。仕様書 §10 のレイヤー原則に従い、コア層・型層・整合性エンジン・CLI を疎結合で構成する。

## レイヤー

- `src/core/` — パーツ定義・frontmatter・関係グラフ・ハッシュ（ドメイン非依存, §3）
- `src/types/` — 型ごとの追加フィールドと関係ルール（プラグイン, §4）
- `src/consistency/` — バリデーション・ドリフト検出・ゲート階層（§5, §6）
- `src/cli/` — `parts list / show / check`（§13）

## 開発

```sh
npm install
npm run typecheck
npm run build
npm test
```

## CLI

```sh
node dist/cli/index.js list          # 型別にパーツを一覧
node dist/cli/index.js show <id>     # パーツ詳細と関係 in/out
node dist/cli/index.js check         # 構造エラー＋整合性違反（tier1 で exit 1）
```

## パーツの形（仕様 §3）

Markdown ファイルの YAML frontmatter で定義する。

```md
---
part: auth/login
type: code
title: ログインハンドラ
oneline: メール/パスワード認証と JWT 発行
summary: POST /login を受けて認証し JWT を返す。
created_at: 2026-05-17
updated_at: 2026-05-17
summary_updated: 2026-05-17
code_hash: abc123
deps: [auth/jwt]
shape: { max_lines: 80 }
---
本文（パーツの実体）。
```
