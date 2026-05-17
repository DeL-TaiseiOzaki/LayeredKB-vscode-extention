// 型層: 型ごとの追加フィールドと関係ルール．プラグインとして外付け（仕様 §4, §10）．
// v0.1 スケルトン: コア型一覧と関係ペア・ルールの宣言場所のみ．検証ロジックは整合性エンジン側．

import type { PartId } from "../core/index.js";

// 仕様 §4.1 v0.1 で扱うコア型．
export type CoreTypeName =
  | "code"
  | "paper_claim"
  | "note"
  | "reference"
  | "decision";

// 仕様 §4.2 型プラグインが宣言するもの（型名・追加フィールド・許容関係・レンダリング規則）．
export interface TypePlugin {
  name: string;
  // 追加フィールドのスキーマ・関係ルール・レンダリング規則は作業 B 以降で定義．
}

// 仕様 §4.3 関係の型ペア・ルール（From → To で許容される関係）．
// 不適切な関係は Tier 1 絶対ブロック対象（仕様 §6.1）．
export type RelationName = keyof {
  deps: PartId[];
  implements: PartId[];
  cites: PartId[];
  refs: PartId[];
  decided_in: PartId[];
  decides: PartId[];
  extended_by: PartId[];
  contradicts: PartId[];
  supersedes: PartId[];
};
