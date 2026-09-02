# LayeredKB

Personal Knowledge Base（PKB）のワークスペースを，役割ごとの **レイヤー** に整理して表示する VS Code 拡張機能です．

PKB を CLI エージェント（Claude Code など）と一緒に運用すると，ワークスペースには性質の異なるファイルが混在します．
LayeredKB はそれらをディレクトリ構造ではなく「どの層に属するか」で見せます．

| レイヤー | 役割 | 既定で含まれるもの |
| --- | --- | --- |
| **Schema** | CLI エージェントの振る舞いを規定する層 | `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `.cursor/**`, `.codex/**`, `.gemini/**`, `.github/copilot-instructions.md`, `.mcp.json` など |
| **Knowledge** | メインの知見・情報とオントロジー | `**/*.md`, `**/*.mdx`, `**/*.csv`, `**/*.tsv` |
| **Other** | どのレイヤーにも属さないファイル | 上記以外 |

## 機能

- **エクスプローラー内の「LayeredKB」ビュー**: レイヤー → ディレクトリ → ファイルのツリー．レイヤー行にはファイル数を表示します．
  クリックで開く，右クリックで「横に開く」「エクスプローラーで表示」「パスをコピー」などが使えます．
- **標準エクスプローラーの装飾**: 各ファイルに所属レイヤーのバッジ（`S` / `K`）と色を付けます（`layeredkb.decorateExplorer` で無効化可）．
- **コンパクトフォルダー**: 子が 1 つしかないフォルダーは `a/b/c` のように 1 行にまとめます．
- **自動更新**: ファイルの追加・削除・設定変更を検知して再走査します．
- **マルチルート対応**: 複数のワークスペースフォルダーはルート名を先頭に付けて表示します．

## レイヤーのカスタマイズ

レイヤーは `layeredkb.layers` 設定で自由に定義できます．上から順に評価され，最初に一致したレイヤーが採用されます（first-match-wins）．
たとえばオントロジーを独立したレイヤーにし，生データ層を追加するには `.vscode/settings.json` に次のように書きます．

```jsonc
{
  "layeredkb.layers": [
    {
      "id": "schema",
      "label": "Schema",
      "icon": "law",
      "badge": "S",
      "color": "charts.purple",
      "patterns": [".claude/**", "**/CLAUDE.md", "**/AGENTS.md", ".mcp.json"]
    },
    {
      "id": "ontology",
      "label": "Ontology",
      "icon": "type-hierarchy",
      "badge": "O",
      "color": "charts.orange",
      "patterns": ["ontology/**", "**/*.ontology.csv"]
    },
    {
      "id": "knowledge",
      "label": "Knowledge",
      "icon": "book",
      "badge": "K",
      "color": "charts.blue",
      "patterns": ["**/*.md", "**/*.csv"]
    },
    {
      "id": "raw",
      "label": "Raw Sources",
      "icon": "database",
      "badge": "R",
      "color": "charts.green",
      "patterns": ["raw/**", "**/*.pdf", "**/*.html"]
    }
  ]
}
```

各レイヤーのフィールド:

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `id` | ○ | 一意な ID（`other` は予約済み） |
| `label` | ○ | ツリーに表示する名前 |
| `patterns` | ○ | ワークスペースルートからの相対 glob（`**`，ブレース展開可） |
| `description` | | ツールチップの説明 |
| `icon` | | [codicon](https://microsoft.github.io/vscode-codicons/dist/codicon.html) の名前 |
| `badge` | | 標準エクスプローラーに出すバッジ（1〜2 文字） |
| `color` | | 標準エクスプローラーの装飾色（テーマカラー ID，例 `charts.blue`） |

その他の設定:

| 設定 | 既定値 | 説明 |
| --- | --- | --- |
| `layeredkb.exclude` | `node_modules`, `.git`, `dist`, `out` | 走査から除外する glob（`files.exclude` に加えて適用） |
| `layeredkb.showOtherLayer` | `true` | `Other` レイヤーを表示する |
| `layeredkb.compactFolders` | `true` | コンパクトフォルダー表示 |
| `layeredkb.decorateExplorer` | `true` | 標準エクスプローラーにバッジと色を付ける |

標準の「フォルダー」ビューを畳んで LayeredKB ビューだけを使うと，エクスプローラー全体がレイヤー表示になります．

## 開発

```bash
npm install
```

| コマンド | 内容 |
| --- | --- |
| `npm run watch` | esbuild と tsc の型チェックをウォッチ実行 |
| `npm run compile` | 型チェック + Lint + バンドル（開発ビルド） |
| `npm run package` | 型チェック + Lint + バンドル（本番ビルド，minify） |
| `npm run lint` | ESLint |
| `npm run check-types` | 型チェックのみ |
| `npm run test:unit` | 分類・ツリー構築ロジックの単体テスト（VS Code 不要） |
| `npm test` | 拡張機能の統合テスト（VS Code を起動） |

VS Code でこのフォルダを開き，`F5`（Run Extension）で拡張機能ホストが起動します．

### ディレクトリ構成

```
src/
├── extension.ts            # エントリポイント（ビュー・コマンド・装飾の登録）
├── layers.ts               # レイヤー定義・分類・ツリー構築（VS Code API 非依存）
├── config.ts               # 設定の読み込みと検証
├── workspaceIndex.ts       # ワークスペース走査と分類結果の保持
├── layerTreeProvider.ts    # TreeDataProvider
├── explorerDecorations.ts  # FileDecorationProvider
└── test/
    ├── extension.test.ts   # 統合テスト
    └── unit/               # 単体テスト
```

## 公開

```bash
npx @vscode/vsce package   # .vsix を生成
npx @vscode/vsce publish   # Marketplace へ公開
```
