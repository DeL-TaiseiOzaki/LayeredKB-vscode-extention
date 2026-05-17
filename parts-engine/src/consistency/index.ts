// 整合性エンジン: バリデーション・ドリフト検出・違反提示（仕様 §5, §6, §10）．
// v0.1 スケルトン: 不整合の種類とゲート階層の型のみ．判定ロジックは作業 C 以降．

// 仕様 §5.1 検出する不整合の種類．
export type InconsistencyKind =
  | "code_drift"
  | "summary_drift"
  | "size_violation"
  | "scope_violation"
  | "boundary_violation"
  | "dependency_violation"
  | "relation_type_violation"
  | "cyclic_dependency"
  | "dangling_reference";

// 仕様 §6.1 3段階ゲート．
export type GateTier =
  | "tier1_absolute_block"
  | "tier2_decision_block"
  | "tier3_review_required";

// 仕様 §5.2 解決の2方向．システムは決定しない（ユーザーが選ぶ）．
export type ResolutionDirection = "fix_reality" | "fix_definition";

export interface Inconsistency {
  kind: InconsistencyKind;
  tier: GateTier;
  part: string;
  message: string;
}
