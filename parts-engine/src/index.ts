// parts-engine 公開エントリ．コア層・型層・整合性エンジンを再エクスポートする．
// 編集UI層（parts-vscode）や CLI はこのパッケージを依存として使う（仕様 §10 疎結合原則）．

export * from "./core/index.js";
export * from "./core/frontmatter.js";
export * from "./core/hash.js";
export * from "./core/part.js";
export * from "./core/scanner.js";
export * from "./core/graph.js";
export * from "./types/index.js";
export * from "./consistency/index.js";
export * from "./consistency/engine.js";
