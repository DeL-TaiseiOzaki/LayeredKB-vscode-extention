// コア層: パーツの定義・ID・summary・関係・ハッシュ・更新履歴．完全にドメイン非依存（仕様 §10）．
// v0.1 スケルトン: 型シグネチャのみ．実装は作業 B 以降．

export type PartId = string;

// 仕様 §2.3 多段階 summary の解像度．
export type SummaryResolution = "title" | "oneline" | "summary" | "body";

// 仕様 §3.1 共通フィールド（全 type）．型固有フィールドは型層（src/types）で拡張する．
export interface PartFrontmatterCommon {
  part: PartId;
  type: string;
  title: string;
  oneline: string;
  summary: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  summary_updated: string;
  code_hash: string;
  version?: string;
}

// 仕様 §3.3 形状要件．省略時は型ごとのデフォルトが適用される．
export interface PartShape {
  target_lines?: number;
  max_lines?: number;
  scope_keywords?: string[];
  allowed_external_deps?: string[];
}

// 仕様 §3.2 関係フィールド（有向エッジ，主体 → 対象）．
export interface PartRelations {
  deps?: PartId[];
  implements?: PartId[];
  cites?: PartId[];
  refs?: PartId[];
  decided_in?: PartId[];
  decides?: PartId[];
  extended_by?: PartId[];
  contradicts?: PartId[];
}

export const VERSION = "0.1.0";
