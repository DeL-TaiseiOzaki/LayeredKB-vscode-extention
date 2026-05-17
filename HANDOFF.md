# 引き継ぎプロンプト — paragraph-coding / パーツ管理システム

このファイルは別エージェントへの作業引き継ぎ用ブリーフィングです。前提知識ゼロで読めるように書いています。**まずこの文書を通読してから着手してください。**

---

## 0. あなたへの依頼（プロンプト）

> あなたは `del-taiseiozaki/paragraph-coding` リポジトリで作業するエンジニアエージェントです。
> このリポジトリは「段落エンジニアリング（パーツ管理システム）」の実装で、Microsoft の
> `vscode-extension-samples` フォーク上に **2 つの新規パッケージ**（`parts-engine` / `parts-vscode`）と
> サンプル・CI を追加済みです。下記「現状」「アーキテクチャ」を把握し、「未完了・次の作業」から
> 優先度の高いものを実施してください。**既存の vscode-extension-samples 各ディレクトリと
> ルート `package.json` / `ci.yml` は参照専用で変更しないでください。**
> 仕様書ファイルはリポジトリに存在しません（初期セッションで口頭提示）。設計はコード内の
> `§` 参照コメントに保持されています。認識齟齬があればユーザーに確認してください。
> 開発はブランチを切って PR（ドラフト）を作成し、レビュー後 main へ統合する運用です。

---

## 1. 何をするシステムか

Markdown ファイルの YAML frontmatter で「パーツ」を定義し、パーツ間の関係グラフと
整合性（コード/要約のドリフト、サイズ、関係型、循環、dangling 参照など）を管理する。
CLI と VSCode 拡張から利用する。仕様レイヤー（§10）:

- **コア層**（ドメイン非依存）: パーツ定義・frontmatter・関係グラフ・ハッシュ
- **型層**（プラグイン）: 型ごとの追加フィールドと関係ルール
- **整合性エンジン**: バリデーション・ドリフト検出・3 段階ゲート
- **CLI / 編集UI層（拡張）**: 一覧・チェック・分割/結合

## 2. 現状（main にマージ済み・全て動作確認済み）

A→F の 6 段階を分割 PR（#1〜#6, 全て squash 済み）で実装し、main は線形履歴:

| 段階 | 内容 |
|---|---|
| A | `parts-engine` スケルトン＋vitest |
| B | コア: frontmatter / Part / scanner / graph / hash |
| C | 整合性エンジン＋CLI（`parts list/show/check`） |
| D | `parts-vscode`: 型別ツリー＋Problems 診断 |
| E | hover 要約 / 関係遷移 / 分割・結合（engine 側に純粋関数） |
| F | `parts-ci.yml` / README / `examples/parts`（正常4＋違反1） |

検証状況: `parts-engine` typecheck OK・**20 テスト通過**・build OK、`parts-vscode`
typecheck OK・esbuild バンドル OK、CLI E2E（`examples/parts`）で 5 種違反を正しい
tier で検出し exit 1。

## 3. アーキテクチャ / 主要ファイル

```
parts-engine/                ESM, TypeScript strict, vitest
  src/core/frontmatter.ts    --- 区切りの YAML 分離（区切り無し=パーツ未定義 null）
  src/core/part.ts           必須フィールド検証・関係/shape 抽出・本文ハッシュ/行数
  src/core/hash.ts           本文 SHA-256（空白正規化、code_drift 用）
  src/core/scanner.ts        ワークスペース再帰走査・ID 重複検出
  src/core/graph.ts          有向関係グラフ・巡回検出・dangling 抽出
  src/core/ops.ts            serializePart / splitPart / mergeParts（純粋関数）
  src/core/index.ts          共通型（PartFrontmatterCommon 等）・RELATION_FIELDS
  src/types/index.ts         型層スケルトン（CoreTypeName 等、未実装）
  src/consistency/engine.ts  checkConsistency: 各違反を §6.1 tier 付きで返す
  src/cli/index.ts           list / show <id> / check（tier1 で exit 1）

parts-vscode/                VSCode 拡張、esbuild で parts-engine(ESM) を CJS 同梱
  src/state.ts               走査結果を一元集約（共有）
  src/partsProvider.ts       型別ツリー TreeDataProvider
  src/diagnostics.ts         構造エラー＋整合性違反を Problems へ（tier→severity）
  src/hover.ts               パーツ ID トークン上で要約表示
  src/commands.ts            goToRelated / split / merge（書込前にモーダル確認）
  src/extension.ts           activate: ツリー/診断/hover/コマンド/ファイル監視

.github/workflows/parts-ci.yml  paths スコープで両パッケージを typecheck/build/test
examples/parts/*.md             動作確認用サンプル（broken-example.md が違反デモ）
```

設計原則: コア層はドメイン非依存。型固有ルールは型層プラグインへ。整合性は「検出」
のみで解決方向（fix_reality / fix_definition）はシステムが決めない（§5.2）。
分割/結合は加算的（元パーツを削除せず `supersedes` で連結）。

## 4. ビルド / テスト手順

```sh
# parts-engine
cd parts-engine && npm ci && npm run typecheck && npm test && npm run build
node dist/cli/index.js check          # 任意のパーツ群ディレクトリで実行

# parts-vscode（先に parts-engine を build しておくこと: file: 依存）
cd parts-vscode && npm ci && npm run typecheck && npm run build
```

## 5. 既知のギャップ / 次の作業（優先度順）

1. **実 VSCode UI 未検証**: 作成環境に VSCode 本体が無く、ツリー描画・hover・
   QuickPick・分割/結合の実ファイル書込は未確認。`parts-vscode` を F5（拡張開発
   ホスト）または `npx vsce package` で .vsix 化し、`examples/parts` を開いて
   目視確認すること。バグ修正が次の最優先。
2. **型層が未実装**: `src/types/index.ts` はスケルトンのみ。§4 の型プラグイン
   （型ごとの追加フィールド・関係ルール）を実装し、`engine.ts` の暫定 v0.1
   既定ルール（`RELATION_TARGET_TYPE`）をプラグイン経由に置換する。
3. **未実装の整合性チェック**: scope_violation / boundary_violation /
   dependency_violation は誤検出回避のため未実装（§5.1 列挙のみ）。意味解析が
   必要なため設計から要検討。
4. **size のデフォルト**: shape 未指定時の型別デフォルト行数は型層実装後に
   `CheckOptions.defaultMaxLines` 経由で有効化する想定。
5. **GitHub Actions**: フォークで check run が登録されない（Actions 無効か
   ランナー未割当）。有効化すれば `parts-ci.yml` が PR/main push で自動実行。
6. **CLI 拡充**: グラフ可視化・分割/結合の CLI サブコマンド（現状は拡張のみ）。

## 6. 運用ルール（厳守）

- 既存 `vscode-extension-samples` 各サンプル / ルート `package.json` / `.github/
  workflows/ci.yml` は **変更禁止**（参照のみ）。
- 変更はブランチを切り、ドラフト PR を作成。スタックする場合は前段ブランチを
  base にし、main マージ時は「自段コミットのみ更新 main へリベース」で
  add/add 衝突を回避（過去 PR #2 で発生・解決済みの既知パターン）。
- コミット/PR にモデル識別子等を含めない。`node_modules` / `dist` は
  各 `.gitignore` 済み（コミットしない）。
- 仕様の不明点・アーキ上重要な判断はユーザーに確認（`AskUserQuestion`）。
