#!/usr/bin/env node
// CLI: パーツ一覧・整合性チェック・グラフ操作・分割/結合（仕様 §10, §13）．
// v0.1 スケルトン: エントリポイントのみ．サブコマンド（list / show / check）は作業 C で実装．

import { VERSION } from "../core/index.js";

function main(argv: string[]): void {
  const [, , cmd] = argv;
  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write(`parts ${VERSION}\n`);
    return;
  }
  process.stdout.write(
    "parts-engine v0.1 スケルトン．サブコマンドは未実装（list / show / check は作業 C で追加）．\n",
  );
}

main(process.argv);
