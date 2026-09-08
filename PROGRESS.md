# PROGRESS

> Auto-maintained by /checkpointing. Shows the most recent 5 checkpoints (newest first).
> Full checkpoints live in `.claude/checkpoints/` (git-ignored).

## [2026-09-08-023011](.claude/checkpoints/2026-09-08-023011.md)

# セッションサマリ — /init から多重 Drive 設計の決着まで

## 何をしたのか

`/init` によるプロジェクトコンテキストの初期化から始まり、LayeredKB の層モデルに
関する設計決着の記録、リポジトリのルール整備、そして実装ブロッカーの修正までを
一続きで実施した。成果は 5 系統。

1. **`/init` 完了** — `.claude/docs/DESIGN.md` を要件 14 件・NFR 7 件・技術選定 8 件・
   Agent Roles 5 件・Key Decisions 6 件・散文 5 節で初期化し、`.claude/STATE.md` の
   Repository Identity を設定した。
2. **ルール 2 件を実態に合わせて全面書き換え** — `.claude/rules/dev-environment.md` と
   `.claude/rules/testing.md` が Python/uv/ruff/pytest 前提だったため、npm + TypeScript +
   esbuild + eslint + mocha + @vscode/test-cli という本リポジトリの実態に置き換えた。
3. **多重 Google Drive 設計の決着を DESIGN.md へ記録** — Key Decisions 6 行を追記し、
   制約節と TODO 節を更新。未決は 11 件から 10 件、🔴 は 3 件から 2 件へ減った。
4. **実装ブロッカー 2 件を修正** — シンボリックリンクの無言スキップと、既定 `raw`
   レイヤーが構造上ゼロ件になる問題。`src/walk.ts` を新規に切り出し、ユニットテストは
   11 件から 29 件へ増えた。
5. **調査文書 3 件と検証スクリプト 1 件を作成** — Drive マウント機構の比較、
   teamai-cli の採否判断資料、実機検証手順とその実行スクリプト。

## どういうやり取りをユーザーと行ったのか

`/init` 実行中にユーザーから大量の設計ノート（LayeredKB Obsidian 版、層の軸と生成物の
置き場）が投入され、これが以降すべての作業の権威ある入力になった。ノートは 4 層から
3 層（schema / Knowledge_Base / contents）への決着と、「生成物そのものは層に入らない。
入るのは参照と来歴」という 2 つの結論を含んでいた。

`/init` 完了報告時に `.claude/rules/` のスタック不一致を指摘し、書き換えの承認を求めた。
ユーザーは「着手して」と承認。

続いてユーザーから本題の相談。個人 KB・チーム KB・個人 Google ドライブ・チーム Google
ドライブを組み合わせた運用 UI を作りたい、チーム KB は git submodule として導入する案、
複数 Drive をどう `contents` 層に収めるか、rclone や GWS CLI が使えるか、そして
Tencent/teamai-cli の検討依頼。

調査と設計の結果を報告した際、次の 4 つの行動を提示し、ユーザーは「1,2,3,4 全部進めて」と
指示した。すべて完了。

最後にユーザーの指示で本チェックポイントを実行した。

## どうやったのか

`.claude/rules/delegation.md` の委譲優先方針に従い、主エージェントは調査を直接行わず、
以下を委譲した。独立した単位は 1 メッセージで並列起動している。

- `general-purpose-opus`: DESIGN.md 入力 JSON の構成、Drive マウント機構と teamai-cli の
  外部調査、多重 Drive アーキテクチャの Codex 相談、実装ブロッカーの修正。
- `general-purpose-sonnet`: ルール 2 ファイルの書き換え（並列）、teamai-cli 判断資料、
  rclone 検証手順。
- `claude-code-guide`: スキル解決順序の事実確認。

Codex CLI は 2 回相談した。多重 Drive アーキテクチャ（`gpt-5.6-sol`、read-only、178 秒）と
シンボリックリンク・roots のセマンティクス（同、142 秒）。いずれも編集ゼロ、HEAD 不変。

DESIGN.md と STATE.md はすべて型付き writer 経由で書いた（`update_design.py`、
`append_state_block.py`）。手書きは一切していない。

検証は委譲せず主エージェントが実行した。`npm run check-types` / `lint` / `test:unit` を
自分で回し、`git diff --stat` と実際の差分を自分で読み、報告された事実（コード行、
CI 設定、VS Code バイナリ内の設定既定値）を一次ソースで確認した。

## 途中でどういう課題が起こったのか

**主エージェント自身の誤りが 1 件。** シンボリックリンクのスキップを「macOS のマウント
戦略を殺す」と広く述べたが、`walk()` は `roots` 経由の外部走査からしか呼ばれない。
ワークスペース内のマウントは `vscode.workspace.findFiles` を通り、VS Code 側の
`search.followSymlinks`（既定 true）に支配される。訂正して検証手順を 8a / 8b に分割させた。

**推測が事実と逆だった件が 1 件。** スキル名衝突時に「project が黙って勝つのか」と推測したが、
実際の解決順序は `Enterprise > Personal > Project > Plugin > Bundled` で Personal が勝つ。
teamai-cli が書き込む `~/.claude/skills/` が、本リポジトリの正典スキルを黙って上書きする
という逆向きの失敗モードだった。teamai-cli 判断資料の R7 を Critical へ格上げし、
R1（供給網）を抜いてトップリスクになった。

**型付き writer の追記による矛盾が 1 件。** `update_design.py` はセクション末尾に追記する
ため、TODO 節に旧「🔴 join key は未決」と新「解決済み」が併存した。TODO 節を書き直して解消。

**委譲先が自分の修正のテスト中にバグを 1 件発見。** 検証スクリプトの設定読み取り
フォールバックが `grep -E`（ERE）に BRE 記法を渡しており、明示的な override が
すべて黙って無視されていた。修正済み。

**環境制約。** 本環境は Linux コンテナで rclone も `/dev/fuse` も Obsidian も無い。
対象機は Mac / Windows のため、実機検証は実行できず、手順とスクリプトの作成に留めた。
rclone `combine` が期待どおり動くかの結論はまだ出ていない。

## 将来のアクション

1. **CHANGELOG 未更新。** 既定レイヤーの挙動変更（`contents/**` `raw/**` `data/**`
   `attachments/**` が「その他」から「Raw」へ移動）は 0.1.0 公開済み拡張に対する
   利用者可視の変更。リリース前に必須。
2. **`readFollowSymlinks()` の置き場所。** `LayeredKbConfig` ではなく
   `vscode.workspace.getConfiguration` を直接読んでいる。`readConfig()` に寄せるべき。
3. **実機検証。** Mac で `./scripts/verify-rclone-mount.sh --mount-path <マウント先>` を
   走らせ、最も決定的なチェック #1（combine バックエンド）の結論を出す。
   これが通らなければ rclone 採用の理由が消える。
4. **未コミット。** `src/walk.ts` など新規 2 件を含む変更が作業ツリーに乗ったまま。
5. **残る 🔴 未決 2 件** — 一般 vault 向けの分類主信号（frontmatter か path か）と、
   Obsidian プラグインのリポジトリ境界。
6. **teamai-cli** は現時点で採用しない推奨。反転トリガは 2 つ目のリポジトリの必要性、
   または 2 人目の開発者によるドリフト観測。加えて `~/.claude/skills/` と
   `<repo>/.claude/skills/` の名前衝突を検出するチェックの整備が前提条件。
